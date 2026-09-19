import { lookup } from 'node:dns/promises';
import net from 'node:net';

/**
 * Fetching a url an agent chose.
 *
 * This is the most dangerous capability in the tool set, because the agent does
 * not choose the url in isolation -- the person chatting with it can ask it to
 * fetch anything, and the result is handed straight back to them. Without a
 * guard that is a read primitive against everything this server can reach:
 * cloud metadata, the database host, internal admin panels.
 *
 * So the hostname is resolved first and refused if **any** address it resolves
 * to is private, loopback, link-local or otherwise not on the public internet,
 * and every redirect hop is re-checked the same way rather than trusted.
 *
 * Residual risk: a name that passes the check and then resolves differently
 * when the connection is made (DNS rebinding). Closing that needs pinning the
 * connection to the checked address, which `fetch` does not expose; it is
 * recorded here rather than silently ignored.
 */

export const FETCH_TIMEOUT = 10000;
export const FETCH_BYTES_MAX = 100000;
export const FETCH_REDIRECTS_MAX = 3;

/** Content this is willing to hand to a model. */
const ALLOWED_TYPES = [ 'text/plain', 'text/html', 'text/markdown', 'application/json', 'application/xml', 'text/xml', 'text/csv' ];

/**
 * True for anything that is not a routable public address.
 *
 * Unknown formats return true: refusing something harmless is a nuisance,
 * letting an internal address through is a breach.
 */
export function isPrivateAddress(ip: string): boolean
{
    if (net.isIPv4(ip))
    {
        const parts = ip.split('.').map(Number);

        const [ a, b ] = parts;

        return a === 0                               // this network
            || a === 10                              // private
            || a === 127                             // loopback
            || (a === 100 && b >= 64 && b <= 127)    // carrier NAT
            || (a === 169 && b === 254)              // link-local, incl. cloud metadata
            || (a === 172 && b >= 16 && b <= 31)     // private
            || (a === 192 && b === 168)              // private
            || (a === 192 && b === 0)                // protocol assignments
            || (a === 198 && b >= 18 && b <= 19)     // benchmarking
            || a >= 224;                             // multicast and reserved
    }

    if (net.isIPv6(ip))
    {
        const low = ip.toLowerCase();

        // An IPv4 address wearing an IPv6 coat still reaches the IPv4 host.
        if (low.startsWith('::ffff:'))
        {
            const embedded = low.slice(7);

            return net.isIPv4(embedded) ? isPrivateAddress(embedded) : true;
        }

        return low === '::1'
            || low === '::'
            || low.startsWith('fc')       // unique local
            || low.startsWith('fd')       // unique local
            || low.startsWith('fe80')     // link-local
            || low.startsWith('ff');      // multicast
    }

    return true;
}

export interface UrlCheck
{
    ok: boolean;
    reason?: string;
    url?: URL;
}

/** Parses and resolves a url, refusing anything that is not publicly routable. */
export async function checkPublicUrl(raw: string): Promise<UrlCheck>
{
    let url: URL;

    try
    {
        url = new URL(raw);
    }
    catch
    {
        return { ok: false, reason: 'not a valid url' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:')
    {
        return { ok: false, reason: 'only http and https are allowed' };
    }

    // A literal address skips DNS but still has to pass the same test. URL keeps
    // the brackets on an IPv6 literal, and `[::1]` is not a parseable address --
    // without stripping them the check falls through to a DNS lookup it should
    // never have needed.
    const literal = url.hostname.startsWith('[') && url.hostname.endsWith(']')
        ? url.hostname.slice(1, -1)
        : url.hostname;

    if (net.isIP(literal) !== 0)
    {
        return isPrivateAddress(literal)
            ? { ok: false, reason: 'address is not publicly routable' }
            : { ok: true, url };
    }

    let addresses: { address: string }[];

    try
    {
        addresses = await lookup(url.hostname, { all: true });
    }
    catch
    {
        return { ok: false, reason: 'host does not resolve' };
    }

    if (addresses.length === 0)
    {
        return { ok: false, reason: 'host does not resolve' };
    }

    // Every address, not just the first: a name that resolves to one public and
    // one private address would otherwise slip through half the time.
    for (const entry of addresses)
    {
        if (isPrivateAddress(entry.address))
        {
            return { ok: false, reason: 'host resolves to a non-public address' };
        }
    }

    return { ok: true, url };
}

export interface FetchResult
{
    ok: boolean;
    reason?: string;
    status?: number;
    contentType?: string;
    text?: string;
    truncated?: boolean;
    finalUrl?: string;
}

/**
 * Fetches a checked url, re-checking every redirect hop.
 *
 * Redirects are followed manually because `fetch`'s own following would jump to
 * a private address without the guard ever seeing it -- a public url that
 * 302s to 169.254.169.254 is the classic way past a naive allow-list.
 */
export async function fetchPublicUrl(raw: string): Promise<FetchResult>
{
    let target = raw;

    for (let hop = 0; hop <= FETCH_REDIRECTS_MAX; hop += 1)
    {
        const check = await checkPublicUrl(target);

        if (!check.ok || !check.url)
        {
            return { ok: false, reason: check.reason ?? 'refused' };
        }

        let response: Response;

        try
        {
            response = await fetch(check.url, {
                redirect: 'manual',
                headers: { accept: ALLOWED_TYPES.join(',') },
                signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        }
        catch
        {
            return { ok: false, reason: 'request failed' };
        }

        if (response.status >= 300 && response.status < 400)
        {
            const location = response.headers.get('location');

            if (!location)
            {
                return { ok: false, reason: 'redirect without a location' };
            }

            target = new URL(location, check.url).toString();

            continue;
        }

        const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();

        if (contentType !== '' && !ALLOWED_TYPES.includes(contentType))
        {
            return { ok: false, reason: `unsupported content type ${ contentType }`, status: response.status };
        }

        const body = await response.text().catch(() => '');

        return {
            ok: response.ok,
            status: response.status,
            contentType,
            // Cut rather than refused: a long page is still useful, and the
            // model cannot do anything with an unbounded one anyway.
            text: body.slice(0, FETCH_BYTES_MAX),
            truncated: body.length > FETCH_BYTES_MAX,
            finalUrl: check.url.toString(),
            ...response.ok ? { } : { reason: `http ${ response.status }` }
        };
    }

    return { ok: false, reason: 'too many redirects' };
}
