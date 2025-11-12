import { LRUCache } from 'lru-cache';

const options = {
    max: 500,

    // how long to live in ms
    ttl: 1000 * 60 * 99999,

    // return stale items before removing from cache?
    allowStale: false,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
}

const cache = new LRUCache(options)

export default {
    set: (k, v, ttl) => {
        return cache.set(k, v, { ttl });
    },
    get: (k) => {
        return cache.get(k);
    },
    all: () => {
        const items = [];
        for (const item in cache.entries()) {
            items.push(item);
        }
        return items;
    }
}