import {
    BING_URL,
    CONFIG,
    DUCKDUCKGO_URL,
    SEARCH_RESULTS_MAX,
    SEARCH_SNIPPET_MAX,
    SEARCH_TIMEOUT,
    SEARCH_USER_AGENT,
    TAVILY_URL,
    WIKIPEDIA_URL,
} from '../../constant.js';
import { decodeEntities } from './mcp.web.js';

export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}

export interface SearchOutcome {
    ok: boolean;
    source: string;
    results: SearchResult[];
    reason?: string;
}

function clean(html: string): string {
    return decodeEntities(html.replace(/<[^>]+>/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

function trimmed(result: SearchResult): SearchResult {
    return { ...result, snippet: result.snippet.slice(0, SEARCH_SNIPPET_MAX) };
}

function bingTarget(href: string): string {
    const url = decodeEntities(href);

    if (!url.includes('bing.com/ck/a')) {
        return url;
    }

    const encoded = new URL(url).searchParams.get('u') ?? '';

    if (!encoded.startsWith('a1')) {
        return url;
    }

    try {
        return Buffer.from(encoded.slice(2), 'base64url').toString('utf8');
    } catch {
        return url;
    }
}

export function relevant(query: string, results: SearchResult[]): SearchResult[] {
    const terms = query
        .toLowerCase()
        .split(/[\s\p{P}\p{S}]+/u)
        .filter((term) => term.length >= 3);

    if (terms.length === 0) {
        return results;
    }

    return results.filter((result) => {
        const text = `${result.title} ${result.snippet} ${result.url}`.toLowerCase();

        return terms.some((term) => text.includes(term));
    });
}

export function parseBing(html: string): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [, block] of html.matchAll(/<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g)) {
        const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);

        if (!link) {
            continue;
        }

        const snippet = /<p[^>]*>([\s\S]*?)<\/p>/.exec(block);
        const url = bingTarget(link[1]);

        if (!/^https?:\/\//.test(url)) {
            continue;
        }

        results.push({ title: clean(link[2]), url, snippet: snippet ? clean(snippet[1]) : '' });
    }

    return results;
}

export function parseDuckDuckGo(html: string): SearchResult[] {
    const results: SearchResult[] = [];
    const links = [
        ...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g),
    ];
    const snippets = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];

    links.forEach(([, href, title], index) => {
        const raw = decodeEntities(href);
        const target = raw.includes('uddg=')
            ? decodeURIComponent(
                  new URL(raw, 'https://duckduckgo.com').searchParams.get('uddg') ?? '',
              )
            : raw;

        if (!/^https?:\/\//.test(target)) {
            return;
        }

        results.push({
            title: clean(title),
            url: target,
            snippet: snippets[index] ? clean(snippets[index][1]) : '',
        });
    });

    return results;
}

async function page(url: string, init?: RequestInit): Promise<string | null> {
    try {
        const response = await fetch(url, {
            ...init,
            headers: {
                'user-agent': SEARCH_USER_AGENT,
                'accept-language': 'en-US,en;q=0.9',
                ...init?.headers,
            },
            signal: AbortSignal.timeout(SEARCH_TIMEOUT),
        });

        return response.status === 200 ? await response.text() : null;
    } catch {
        return null;
    }
}

async function tavily(query: string, topic: string, key: string): Promise<SearchResult[] | null> {
    try {
        const response = await fetch(TAVILY_URL, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${key}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                query,
                topic,
                search_depth: 'basic',
                max_results: SEARCH_RESULTS_MAX,
            }),
            signal: AbortSignal.timeout(SEARCH_TIMEOUT),
        });

        if (!response.ok) {
            return null;
        }

        const body = (await response.json()) as {
            results?: { title?: unknown; url?: unknown; content?: unknown }[];
        };

        return (body.results ?? [])
            .filter((item) => typeof item.url === 'string')
            .map((item) => ({
                title: typeof item.title === 'string' ? item.title : String(item.url),
                url: String(item.url),
                snippet: typeof item.content === 'string' ? item.content : '',
            }));
    } catch {
        return null;
    }
}

async function wikipedia(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: String(SEARCH_RESULTS_MAX),
        format: 'json',
    });
    const body = await page(`${WIKIPEDIA_URL}?${params}`);

    if (body === null) {
        return [];
    }

    try {
        const hits =
            (JSON.parse(body) as { query?: { search?: { title: string; snippet: string }[] } })
                .query?.search ?? [];

        return hits.map((hit) => ({
            title: hit.title,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`,
            snippet: clean(hit.snippet),
        }));
    } catch {
        return [];
    }
}

export async function searchWeb(
    query: string,
    topic = 'general',
    key = CONFIG.TAVILY_API_KEY,
): Promise<SearchOutcome> {
    const done = (source: string, results: SearchResult[]): SearchOutcome => ({
        ok: true,
        source,
        results: results.slice(0, SEARCH_RESULTS_MAX).map(trimmed),
    });

    if (key !== '') {
        const found = await tavily(query, topic, key);

        if (found !== null && found.length > 0) {
            return done('tavily', found);
        }
    }

    const bing = await page(`${BING_URL}?${new URLSearchParams({ q: query, setlang: 'en' })}`);
    const fromBing = bing === null ? [] : relevant(query, parseBing(bing));

    if (fromBing.length > 0) {
        return done('bing', fromBing);
    }

    const duck = await page(DUCKDUCKGO_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ q: query }).toString(),
    });
    const fromDuck = duck === null ? [] : relevant(query, parseDuckDuckGo(duck));

    if (fromDuck.length > 0) {
        return done('duckduckgo', fromDuck);
    }

    const fromWikipedia = await wikipedia(query);

    if (fromWikipedia.length > 0) {
        return done('wikipedia', fromWikipedia);
    }

    return {
        ok: false,
        source: 'none',
        results: [],
        reason:
            key === ''
                ? 'no search engine answered; a Tavily API key makes search reliable'
                : 'no search engine answered',
    };
}
