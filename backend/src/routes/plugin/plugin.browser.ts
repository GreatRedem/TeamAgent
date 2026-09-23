import { CONFIG, FETCH_TEXT_MAX } from '../../constant.js';

import { searchWeb } from '../mcp/mcp.search.js';
import { fetchPublicUrl } from '../mcp/mcp.web.js';
import { argText, failed, type PluginOutcome, type PluginSettings } from './plugin.common.js';

export function blockedHost(host: string, blocked: string): boolean {
    const name = host.toLowerCase().replace(/\.$/, '');

    return blocked
        .split(',')
        .map((domain) =>
            domain
                .trim()
                .toLowerCase()
                .replace(/^\*?\./, ''),
        )
        .filter((domain) => domain !== '')
        .some((domain) => name === domain || name.endsWith(`.${domain}`));
}

function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export async function browserAct(
    settings: PluginSettings,
    name: string,
    args: Record<string, unknown>,
): Promise<PluginOutcome> {
    const blocked = settings.config['blocked_domains'] ?? '';

    if (name === 'browser_search') {
        const query = argText(args, 'query');

        if (query === '') {
            return failed('query is required');
        }

        const found = await searchWeb(
            query,
            args['topic'] === 'news' ? 'news' : 'general',
            settings.secrets['tavily_key'] || CONFIG.TAVILY_API_KEY,
        );

        if (!found.ok) {
            return failed(found.reason ?? 'search failed');
        }

        return {
            ok: true,
            status: 200,
            data: {
                query,
                source: found.source,
                results: found.results.filter(
                    (result) => !blockedHost(hostOf(result.url), blocked),
                ),
            },
        };
    }

    if (name === 'browser_open') {
        const url = argText(args, 'url');

        if (url === '') {
            return failed('url is required');
        }

        if (blockedHost(hostOf(url), blocked)) {
            return failed('that site is blocked for this browser');
        }

        const offset = Number(args['offset']);
        const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
        const page = await fetchPublicUrl(url, start);

        if (!page.ok) {
            return failed(page.reason ?? 'the page could not be opened', page.status ?? 0);
        }

        if (blockedHost(hostOf(page.finalUrl ?? ''), blocked)) {
            return failed('that page redirects to a blocked site');
        }

        return {
            ok: true,
            status: page.status ?? 200,
            data: {
                url: page.finalUrl,
                content_type: page.contentType,
                length: page.length,
                offset: start,
                ...(page.truncated && { next_offset: start + FETCH_TEXT_MAX }),
                text: page.text,
                links: (page.links ?? []).filter((link) => !blockedHost(hostOf(link.url), blocked)),
            },
        };
    }

    return failed('unknown browser action');
}

export function browserProbe(settings: PluginSettings): PluginOutcome {
    return {
        ok: true,
        status: 200,
        data: settings.secrets['tavily_key'] ? 'Tavily search' : 'Free search engines',
    };
}
