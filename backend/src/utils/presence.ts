import { seen, WINDOW } from '../constant.js';
export function touchAccount(accountId: number): void {
    seen.set(accountId, Date.now());
}

export function activeAccounts(): number {
    const cutoff = Date.now() - WINDOW;

    for (const [id, at] of seen) {
        if (at < cutoff) {
            seen.delete(id);
        }
    }

    return seen.size;
}
