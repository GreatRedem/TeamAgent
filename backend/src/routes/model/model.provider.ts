import { CATALOG_CACHE, CATALOG_TIMEOUT, CATALOG_TTL, CATALOG_URL } from '../../constant.js';

export interface ProviderModel {
    id: string;
    context: number;
}

export interface ProviderPreset {
    key: string;
    label: string;
    url: string;
    catalog: boolean;
    key_required: boolean;
    models: ProviderModel[];
    hint: string;
}

export interface CatalogModel {
    id: string;
    name: string;
    context: number;
    prompt: number;
    completion: number;
    tools: boolean;
}

function toMillion(value: unknown): number {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000000 * 1000) / 1000 : 0;
}

export function readContextLength(entry: unknown): number {
    if (typeof entry !== 'object' || entry === null) {
        return 0;
    }

    const source = entry as Record<string, unknown>;
    const meta =
        typeof source['meta'] === 'object' && source['meta'] !== null
            ? (source['meta'] as Record<string, unknown>)
            : {};

    const candidates = [
        source['context_length'],
        source['max_model_len'],
        source['max_context_length'],
        source['context_window'],
        meta['n_ctx_train'],
        meta['n_ctx'],
    ];

    for (const candidate of candidates) {
        const parsed = Number(candidate);

        if (Number.isInteger(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return 0;
}

export function readCatalog(payload: unknown): CatalogModel[] {
    const data = (payload as { data?: unknown } | null)?.data;

    if (!Array.isArray(data)) {
        return [];
    }

    const models: CatalogModel[] = [];

    for (const raw of data) {
        if (typeof raw !== 'object' || raw === null) {
            continue;
        }

        const entry = raw as {
            id?: unknown;
            name?: unknown;
            context_length?: unknown;
            pricing?: { prompt?: unknown; completion?: unknown };
            architecture?: { output_modalities?: unknown };
            supported_parameters?: unknown;
        };

        if (typeof entry.id !== 'string' || entry.id === '') {
            continue;
        }

        const outputs = entry.architecture?.output_modalities;

        if (Array.isArray(outputs) && !outputs.includes('text')) {
            continue;
        }

        models.push({
            id: entry.id,
            name: typeof entry.name === 'string' ? entry.name : entry.id,
            context: Number.isFinite(Number(entry.context_length))
                ? Number(entry.context_length)
                : 0,
            prompt: toMillion(entry.pricing?.prompt),
            completion: toMillion(entry.pricing?.completion),
            tools:
                Array.isArray(entry.supported_parameters) &&
                entry.supported_parameters.includes('tools'),
        });
    }

    return models.sort((a, b) => a.id.localeCompare(b.id));
}

export interface CatalogResult {
    models: CatalogModel[];
    stale: boolean;
    reason?: string;
}

export async function fetchCatalog(now = Date.now()): Promise<CatalogResult> {
    const cached = CATALOG_CACHE.entry;

    if (cached !== null && now - cached.at < CATALOG_TTL) {
        return { models: cached.models, stale: true };
    }

    try {
        const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(CATALOG_TIMEOUT) });

        if (!response.ok) {
            throw new Error(`http ${response.status}`);
        }

        const models = readCatalog(await response.json());

        if (models.length === 0) {
            throw new Error('empty listing');
        }

        CATALOG_CACHE.entry = { at: now, models };

        return { models, stale: false };
    } catch {
        return cached !== null
            ? { models: cached.models, stale: true, reason: 'CATALOG_UNREACHABLE' }
            : { models: [], stale: false, reason: 'CATALOG_UNREACHABLE' };
    }
}
