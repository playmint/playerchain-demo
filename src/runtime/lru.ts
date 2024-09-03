// works like a Map but with a fixed size, and evicts the least recently set item when the size is exceeded
export class LruCache<T> {
    private a: number[] = [];
    private m: Map<number, T> = new Map();
    private size: number;

    constructor(size: number) {
        this.size = size;
    }

    get(k: number): T | undefined {
        return this.m.get(k);
    }

    set(k: number, v: T): void {
        this.a = this.a.filter((x) => x !== k);
        this.a.push(k);
        this.m.set(k, v);
        // expire an item if we're over capacity
        if (this.a.length >= this.size) {
            const key = this.a.shift();
            if (key === undefined) {
                throw new Error(
                    'fatal bug in LruCache: key should not be undefined',
                );
            }
            this.m.delete(key);
        }
    }
}

// works a bit like the LruCache, expiring once over capcity, but also expires all keys that are greater than k when k is set
export class IncrementalCache<K, V> {
    private a: K[] = [];
    private m: Map<K, V> = new Map();
    private size: number;
    constructor(size: number) {
        this.size = size;
    }

    set(k: K, v: V): void {
        // remove all keys that are greater than k
        this.a = this.a.filter((x) => {
            if (x >= k) {
                this.m.delete(x);
                return false;
            }
            return true;
        });
        // push k to the front
        this.a.unshift(k);
        this.m.set(k, v);
        // expire an item if we're over capacity
        if (this.a.length >= this.size) {
            const key = this.a.pop();
            if (key === undefined) {
                throw new Error(
                    'fatal bug in LruCache: key should not be undefined',
                );
            }
            this.m.delete(key);
        }
    }

    get(k: K): V | undefined {
        return this.m.get(k);
    }

    getBefore(k: K): V | undefined {
        const key = this.a.find((x) => x < k);
        if (key) {
            return this.m.get(key);
        }
        return undefined;
    }
}
