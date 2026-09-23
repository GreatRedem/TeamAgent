import { lookup } from 'node:dns/promises';
import net from 'node:net';
import {
    ALLOWED_TYPES,
    FETCH_REDIRECTS_MAX,
    FETCH_TEXT_MAX,
    FETCH_TIMEOUT,
} from '../../constant.js';

export function decodeEntities(text: string): string {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

export function htmlToText(html: string): string {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
    const body = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(
            /<(script|style|noscript|svg|head|template|iframe|nav|aside|footer)\b[\s\S]*?<\/\1>/gi,
            '',
        )
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(
            /<\/(p|div|li|h[1-6]|tr|section|article|header|footer|blockquote|pre|table)>/gi,
            '\n',
        )
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, ' ');

    const text = decodeEntities(body)
        .split('\n')
        .map((line) => line.replace(/[ \t\r\f\v]+/g, ' ').trim())
        .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
        .join('\n')
        .trim();

    const heading = decodeEntities(title).replace(/\s+/g, ' ').trim();

    return heading === '' ? text : `${heading}\n\n${text}`;
}

export function isPrivateAddress(ip: string): boolean {
    if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);

        const [a, b] = parts;

        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && b >= 18 && b <= 19) ||
            a >= 224
        );
    }

    if (net.isIPv6(ip)) {
        const low = ip.toLowerCase();

        if (low.startsWith('::ffff:')) {
            const embedded = low.slice(7);

            return net.isIPv4(embedded) ? isPrivateAddress(embedded) : true;
        }

        return (
            low === '::1' ||
            low === '::' ||
            low.startsWith('fc') ||
            low.startsWith('fd') ||
            low.startsWith('fe80') ||
            low.startsWith('ff')
        );
    }

    return true;
}

export interface UrlCheck {
    ok: boolean;
    reason?: string;
    url?: URL;
}

export async function checkPublicUrl(raw: string): Promise<UrlCheck> {
    let url: URL;

    try {
        url = new URL(raw);
    } catch {
        return { ok: false, reason: 'not a valid url' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, reason: 'only http and https are allowed' };
    }

    const literal =
        url.hostname.startsWith('[') && url.hostname.endsWith(']')
            ? url.hostname.slice(1, -1)
            : url.hostname;

    if (net.isIP(literal) !== 0) {
        return isPrivateAddress(literal)
            ? { ok: false, reason: 'address is not publicly routable' }
            : { ok: true, url };
    }

    let addresses: { address: string }[];

    try {
        addresses = await lookup(url.hostname, { all: true });
    } catch {
        return { ok: false, reason: 'host does not resolve' };
    }

    if (addresses.length === 0) {
        return { ok: false, reason: 'host does not resolve' };
    }

    for (const entry of addresses) {
        if (isPrivateAddress(entry.address)) {
            return { ok: false, reason: 'host resolves to a non-public address' };
        }
    }

    return { ok: true, url };
}

export interface FetchResult {
    ok: boolean;
    reason?: string;
    status?: number;
    contentType?: string;
    text?: string;
    truncated?: boolean;
    finalUrl?: string;
}

export async function fetchPublicUrl(raw: string): Promise<FetchResult> {
    let target = raw;

    for (let hop = 0; hop <= FETCH_REDIRECTS_MAX; hop += 1) {
        const check = await checkPublicUrl(target);

        if (!check.ok || !check.url) {
            return { ok: false, reason: check.reason ?? 'refused' };
        }

        let response: Response;

        try {
            response = await fetch(check.url, {
                redirect: 'manual',
                headers: { accept: ALLOWED_TYPES.join(',') },
                signal: AbortSignal.timeout(FETCH_TIMEOUT),
            });
        } catch {
            return { ok: false, reason: 'request failed' };
        }

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');

            if (!location) {
                return { ok: false, reason: 'redirect without a location' };
            }

            target = new URL(location, check.url).toString();

            continue;
        }

        const contentType = (response.headers.get('content-type') ?? '')
            .split(';')[0]
            .trim()
            .toLowerCase();

        if (contentType !== '' && !ALLOWED_TYPES.includes(contentType)) {
            return {
                ok: false,
                reason: `unsupported content type ${contentType}`,
                status: response.status,
            };
        }

        const body = await response.text().catch(() => '');
        const readable =
            contentType === 'text/html' ||
            (contentType === '' && /^\s*<(!doctype|html)/i.test(body))
                ? htmlToText(body)
                : body;

        return {
            ok: response.ok,
            status: response.status,
            contentType,
            text: readable.slice(0, FETCH_TEXT_MAX),
            truncated: readable.length > FETCH_TEXT_MAX,
            finalUrl: check.url.toString(),
            ...(response.ok ? {} : { reason: `http ${response.status}` }),
        };
    }

    return { ok: false, reason: 'too many redirects' };
}
