export function enqueue<K>(
    queues: Map<K, Promise<void>>,
    key: K,
    job: () => Promise<void>,
): Promise<void> {
    const next = (queues.get(key) ?? Promise.resolve()).then(job).catch(() => undefined);

    queues.set(key, next);

    return next.then(() => {
        if (queues.get(key) === next) {
            queues.delete(key);
        }
    });
}
