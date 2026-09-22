import type { CatalogModel } from './model.provider.js';

// What a TeamModel stores as its model to mean: for each reply, use a free model from the
// OpenRouter catalog, and move to the next free one when a model is busy or fails.
export const AUTO_FREE = 'auto:free';

export const isAutoFree = (model: string): boolean => model === AUTO_FREE;

// Free models tried for one round of a reply before giving up. Each failure rests that
// model, so the next reply starts from one that is not known to be failing.
export const AUTO_ATTEMPTS = 3;

// How long a free model rests after a failure, by what the failure says about the model.
export const REST_BUSY = 60_000;
export const REST_DOWN = 30_000;
export const REST_GONE = 3_600_000;

const resting = new Map<string, number>();

// The free models an agent can use, largest context first so long histories fit, then by id
// so the order is stable. An agent that offers tools only gets models that take them.
export function freeCandidates(models: CatalogModel[], needTools: boolean): CatalogModel[] {
    return models
        .filter(
            (model) => model.prompt === 0 && model.completion === 0 && (!needTools || model.tools),
        )
        .toSorted((a, b) => b.context - a.context || a.id.localeCompare(b.id));
}

// The next free model to try: the first that is not resting and not already tried this
// round. When every one is resting, the one that wakes soonest, so a reply is never refused
// only because the pool is cooling down.
export function pickFree(
    candidates: CatalogModel[],
    tried: ReadonlySet<string>,
    now = Date.now(),
): CatalogModel | null {
    const open = candidates.filter((model) => !tried.has(model.id));
    const ready = open.find((model) => (resting.get(model.id) ?? 0) <= now);

    if (ready !== undefined) {
        return ready;
    }

    return open.toSorted((a, b) => (resting.get(a.id) ?? 0) - (resting.get(b.id) ?? 0))[0] ?? null;
}

// Whether a failed call is the model's own problem, worth moving to another free model, and
// for how long to rest this one. A rejected key or an empty account is the same for every
// model, so it returns null: switching would only repeat the failure.
export function restFor(status: number, error: string, refusedTools: boolean): number | null {
    if (refusedTools || status === 404) {
        return REST_GONE;
    }

    if (status === 429) {
        return REST_BUSY;
    }

    if (status === 0 || status === 408 || status >= 500) {
        return REST_DOWN;
    }

    if (
        status === 400 &&
        /no endpoints|not a valid model|model.*(not found|unavailable)/i.test(error)
    ) {
        return REST_GONE;
    }

    return null;
}

export function rest(model: string, ms: number, now = Date.now()): void {
    resting.set(model, now + ms);
}

// Test hook: forget every rest.
export function wake(): void {
    resting.clear();
}
