export default class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, V>;

    constructor(capacity: number) {
        if (capacity <= 0) {
            capacity = 1;
        }

        this.capacity = capacity;
        this.cache = new Map<K, V>();
    }

    get(key: K) {
        if (!this.cache.has(key)) {
            return undefined;
        }

        const value = this.cache.get(key) as V;

        this.cache.delete(key);
        this.cache.set(key, value);

        return value;
    }

    set(key: K, value: V) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            const oldestKey = this.cache.keys().next().value;

            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, value);
    }

    has(key: K) {
        return this.cache.has(key);
    }

    delete(key: K) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }
}
