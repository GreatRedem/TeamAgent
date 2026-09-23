import {
    AUTO_FREE,
    FREE_QUOTA,
    hidden,
    REST_BUSY,
    REST_DOWN,
    REST_GONE,
    resting,
} from '../../constant.js';
import type { CatalogModel } from './model.provider.js';

export interface SetAside {
    kind: 'rest' | 'hide' | 'quota';
    until: number;
}

export function isAutoFree(model: string): boolean {
    return model === AUTO_FREE;
}

export function freeCandidates(models: CatalogModel[], needTools: boolean): CatalogModel[] {
    return models
        .filter(
            (model) =>
                model.text &&
                model.prompt === 0 &&
                model.completion === 0 &&
                (!needTools || model.tools),
        )
        .toSorted((a, b) => a.rank - b.rank || b.context - a.context || a.id.localeCompare(b.id));
}

export function pickFree(
    candidates: CatalogModel[],
    tried: ReadonlySet<string>,
    now = Date.now(),
): CatalogModel | null {
    if (FREE_QUOTA.until > now) {
        return null;
    }

    const open = candidates.filter(
        (model) => !tried.has(model.id) && (hidden.get(model.id) ?? 0) <= now,
    );
    const ready = open.find((model) => (resting.get(model.id) ?? 0) <= now);

    if (ready !== undefined) {
        return ready;
    }

    return open.toSorted((a, b) => (resting.get(a.id) ?? 0) - (resting.get(b.id) ?? 0))[0] ?? null;
}

function errorOf(payload: unknown): {
    message: string;
    headers: Record<string, unknown>;
} {
    const error = (payload as { error?: { message?: unknown; metadata?: { headers?: unknown } } })
        ?.error;
    const headers = error?.metadata?.headers;

    return {
        message: typeof error?.message === 'string' ? error.message : '',
        headers:
            typeof headers === 'object' && headers !== null
                ? (headers as Record<string, unknown>)
                : {},
    };
}

function resetAt(headers: Record<string, unknown>, now: number): number {
    const reset = Number(headers['X-RateLimit-Reset'] ?? headers['x-ratelimit-reset']);

    if (Number.isFinite(reset) && reset > now) {
        return reset < 1e12 ? reset * 1000 : reset;
    }

    const midnight = new Date(now);

    midnight.setUTCHours(24, 0, 0, 0);

    return midnight.getTime();
}

export function judge(
    status: number,
    payload: unknown,
    refusedTools: boolean,
    now = Date.now(),
): SetAside | null {
    const { message, headers } = errorOf(payload);

    if (status === 429) {
        return /free-models-per-(day|min)/i.test(message)
            ? { kind: 'quota', until: resetAt(headers, now) }
            : { kind: 'rest', until: now + REST_BUSY };
    }

    if (
        refusedTools ||
        status === 402 ||
        status === 404 ||
        (status === 400 &&
            /no endpoints|not a valid model|model.*(not found|unavailable)/i.test(message))
    ) {
        return { kind: 'hide', until: now + REST_GONE };
    }

    if (status === 0 || status === 408 || status >= 500) {
        return { kind: 'rest', until: now + REST_DOWN };
    }

    return null;
}

export function setAside(model: string, verdict: SetAside): void {
    if (verdict.kind === 'quota') {
        FREE_QUOTA.until = Math.max(FREE_QUOTA.until, verdict.until);
    } else if (verdict.kind === 'hide') {
        hidden.set(model, verdict.until);
    } else {
        resting.set(model, verdict.until);
    }
}

export function rest(model: string, ms: number, now = Date.now()): void {
    resting.set(model, now + ms);
}

export function freeQuotaUntil(now = Date.now()): number | null {
    return FREE_QUOTA.until > now ? FREE_QUOTA.until : null;
}

export function wake(): void {
    resting.clear();
    hidden.clear();
    FREE_QUOTA.until = 0;
}
