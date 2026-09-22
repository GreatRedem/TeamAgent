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

/**
 * AgentRouter's OpenAI-compatible root.
 *
 * A hosted router with free quotas, so like OpenRouter it is a url and a model
 * name rather than an integration -- nothing on the reply path changes.
 *
 * It speaks two protocols on two different roots, and only this one is ours:
 * `/v1` is OpenAI-compatible, while the bare origin serves Anthropic's
 * messages API. That split is why its Claude models are absent from the
 * suggestions below -- they are reachable only over the protocol this codebase
 * does not speak.
 */
export const AGENTROUTER_URL = 'https://agentrouter.org/v1';

/** A model a provider is documented to serve, for one that publishes no listing. */
export interface ProviderModel
{
    id: string;
    /** Its window, or 0 where the documentation does not give one. */
    context: number;
}

export interface ProviderPreset
{
    key: string;
    label: string;
    /** Prefilled into the url field; blank means the caller types their own. */
    url: string;
    /**
     * Whether this provider's model list can be served from `/model/catalog`.
     *
     * Only true where the listing is the same for everyone and needs no key, so
     * in practice only the default provider. Anything else is either discovered
     * by probing the endpoint with the caller's own key, or listed below.
     */
    catalog: boolean;
    /** Whether a key is required, as opposed to merely accepted. */
    key_required: boolean;
    /**
     * Models this provider documents, for one that serves no `/v1/models`.
     *
     * A published list is a weaker source than an endpoint answering for itself,
     * so anything a probe discovers replaces these, and a window the endpoint
     * reports wins over the one here. They exist so a provider is usable before
     * either -- without them a new model is a name and a window to look up by
     * hand, and a wrong window is silently expensive.
     */
    models: ProviderModel[];
    hint: string;
}

/**
 * The providers the add form offers.
 *
 * Kept here rather than in the client so the urls have one definition: the
 * frontend already reads the default root from the catalog response instead of
 * repeating it, and a second hardcoded address would undo that.
 */
export const PROVIDERS: ProviderPreset[] = [
    {
        key: 'openrouter',
        label: 'OpenRouter · one key, every model',
        url: OPENROUTER_URL,
        catalog: true,
        key_required: true,
        models: [ ],
        hint: 'One key reaches hundreds of models. The list below is fetched from OpenRouter.'
    },
    {
        key: 'agentrouter',
        label: 'AgentRouter · free quota for coding models',
        url: AGENTROUTER_URL,
        catalog: false,
        key_required: true,
        // Documented for the OpenAI-compatible root specifically. The Claude
        // models AgentRouter also offers are served over Anthropic's protocol at
        // the bare origin, so they are not reachable from here.
        models: [
            { id: 'gpt-5.5', context: 100000 },
            { id: 'glm-5.2', context: 0 }
        ],
        hint: 'A hosted router with a free quota, but it admits only client applications it recognises and refuses anything else with a 401 -- a valid key is not enough. Its Claude models also use the Anthropic protocol on a different root and are not reachable here.'
    },
    {
        key: 'custom',
        label: 'Other OpenAI-compatible endpoint',
        url: '',
        catalog: false,
        key_required: false,
        models: [ ],
        hint: 'Any OpenAI-compatible root, including a model served locally.'
    }
];

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
 * The context window declared by one entry of a `/models` listing.
 *
 * There is no field for this in the OpenAI spec, so every compatible server
 * invented its own and the names below are what they actually send:
 *
 * - `context_length` -- OpenRouter, Together, Fireworks
 * - `max_model_len` -- vLLM
 * - `max_context_length` -- LM Studio
 * - `context_window` -- assorted gateways
 * - `meta.n_ctx_train` -- llama.cpp's server, which nests its own metadata
 *
 * Checked in that order and the first usable number wins. 0 means the endpoint
 * did not say, which is different from saying zero -- the caller falls back to
 * the conservative default rather than trusting a silence.
 *
 * Exported so it can be checked without a network.
 */
export function readContextLength(entry: unknown): number
{
    if (typeof entry !== 'object' || entry === null)
    {
        return 0;
    }

    const source = entry as Record<string, unknown>;
    const meta = typeof source['meta'] === 'object' && source['meta'] !== null ? source['meta'] as Record<string, unknown> : { };

    const candidates = [
        source['context_length'],
        source['max_model_len'],
        source['max_context_length'],
        source['context_window'],
        meta['n_ctx_train'],
        meta['n_ctx']
    ];

    for (const candidate of candidates)
    {
        const parsed = Number(candidate);

        // Integer and positive: a float or a -1 placeholder is the endpoint
        // saying something other than a window size.
        if (Number.isInteger(parsed) && parsed > 0)
        {
            return parsed;
        }
    }

    return 0;
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
