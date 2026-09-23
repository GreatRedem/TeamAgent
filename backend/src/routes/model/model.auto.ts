import type { CatalogModel } from './model.provider.js';

export const AUTO_FREE = 'auto:free';

export const isAutoFree = (model: string): boolean => model === AUTO_FREE;

export const AUTO_ATTEMPTS = 3;

export const REST_BUSY = 60_000;
export const REST_DOWN = 30_000;
export const REST_GONE = 3_600_000;

const resting = new Map<string, number>();

export function freeCandidates(models: CatalogModel[], needTools: boolean): CatalogModel[] {
    return models
        .filter(
            (model) => model.prompt === 0 && model.completion === 0 && (!needTools || model.tools),
        )
        .toSorted((a, b) => b.context - a.context || a.id.localeCompare(b.id));
}

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

export function wake(): void {
    resting.clear();
}
