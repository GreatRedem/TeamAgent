/**
 * OpenRouter as the default provider.
 *
 * One key reaches hundreds of models behind an OpenAI-compatible root, so
 * nothing on the reply path changes -- only the url and the model name. That is
 * why this is a default in the add form rather than an integration: a model
 * added this way is an ordinary `team_model` row and everything downstream
 * treats it as one.
 *
 * The catalog endpoint is public, so no key is sent. It is cached in process
 * because the listing changes a few times a day, and because an authenticated
 * route is deliberately skipped by the rate limiter -- without a cache every
 * page load would be one more outbound request anyone signed in could drive.
 */

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

const CATALOG_URL = `${ OPENROUTER_URL }/models`;
const CATALOG_TTL = 3600000;
const CATALOG_TIMEOUT = 8000;

export interface CatalogModel
{
    id: string;
    name: string;
    context: number;
    /** Dollars per million tokens, which is how the listing is read by people. */
    prompt: number;
    completion: number;
}

/** Per-token strings in the listing; per-million is the unit the price is quoted in. */
function toMillion(value: unknown): number
{
    const parsed = Number(value);

    // Absent, non-numeric or the -1 that variable pricing uses: report 0 rather
    // than NaN, which the response schema would drop and leave undefined.
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000000 * 1000) / 1000 : 0;
}

/**
 * Keeps the few fields the add form shows and drops the rest -- the raw listing
 * is megabytes of descriptions and benchmark data.
 *
 * Models that cannot answer with text are left out: an embedding or image model
 * in a chat agent's dropdown is only ever a mistake.
 *
 * Exported separately from the fetch so it can be checked without network.
 */
export function readCatalog(payload: unknown): CatalogModel[]
{
    const data = (payload as { data?: unknown } | null)?.data;

    if (!Array.isArray(data))
    {
        return [ ];
    }

    const models: CatalogModel[] = [ ];

    for (const raw of data)
    {
        if (typeof raw !== 'object' || raw === null)
        {
            continue;
        }

        const entry = raw as { id?: unknown; name?: unknown; context_length?: unknown; pricing?: { prompt?: unknown; completion?: unknown }; architecture?: { output_modalities?: unknown } };

        if (typeof entry.id !== 'string' || entry.id === '')
        {
            continue;
        }

        const outputs = entry.architecture?.output_modalities;

        // An older listing without the field is kept: refusing everything would
        // be worse than offering one model that turns out not to chat.
        if (Array.isArray(outputs) && !outputs.includes('text'))
        {
            continue;
        }

        models.push({
            id: entry.id,
            name: typeof entry.name === 'string' ? entry.name : entry.id,
            context: Number.isFinite(Number(entry.context_length)) ? Number(entry.context_length) : 0,
            prompt: toMillion(entry.pricing?.prompt),
            completion: toMillion(entry.pricing?.completion)
        });
    }

    // Sorted by id, which is what the dropdown matches on, so the same list
    // comes back in the same order whatever order the provider returned it in.
    return models.sort((a, b) => a.id.localeCompare(b.id));
}

let cached: { at: number; models: CatalogModel[] } | null = null;

export interface CatalogResult
{
    models: CatalogModel[];
    /** True when served from the in-process copy rather than fetched. */
    stale: boolean;
    reason?: string;
}

export async function fetchCatalog(now = Date.now()): Promise<CatalogResult>
{
    if (cached !== null && now - cached.at < CATALOG_TTL)
    {
        return { models: cached.models, stale: true };
    }

    try
    {
        const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT) });

        if (!response.ok)
        {
            throw new Error(`http ${ response.status }`);
        }

        const models = readCatalog(await response.json());

        if (models.length === 0)
        {
            throw new Error('empty listing');
        }

        cached = { at: now, models };

        return { models, stale: false };
    }
    catch
    {
        // A provider outage should not empty a dropdown that was fine a minute
        // ago; the expired copy is served with the failure reported alongside.
        return cached !== null
            ? { models: cached.models, stale: true, reason: 'CATALOG_UNREACHABLE' }
            : { models: [ ], stale: false, reason: 'CATALOG_UNREACHABLE' };
    }
}
