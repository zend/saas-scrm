import fs from 'fs/promises'

class Cache {
    path = './data';

    async get(k) {
        try {
            const data = await fs.readFile(this.make_path(k));
            const json = JSON.parse(data);
            if (!json) return false;
            const { v, ttl, mt } = json || {};
            if (mt + ttl < +new Date()) return '';
            return v;
        } catch (e) {
            return '';
        }
    }

    async set(k, v, ttl) {
        const mt = +new Date();
        const data = JSON.stringify({ v, ttl, mt });
        return await fs.writeFile(this.make_path(k), data);
    }

    async all() {
        const p = await fs.readdir(this.path);
        const out = {};
        for (let v in p) {
            const k = p[v].replace(/\.json$/, '');
            out[k] = await this.get(k);
        }
        return out;
    }

    make_path(k) {
        k = k.replace(/[^a-z0-1_:-]/ig, '')
        return `${this.path}/${k}.json`
    }
}

const cache = new Cache();
async function main() {
    console.log(await cache.all());
}
main();

export default {
    set: async (k, v, ttl) => {
        return await cache.set(k, v, { ttl: ttl * 1000 });
    },
    get: async (k) => {
        return await cache.get(k);
    },
    all: async () => {
        return await cache.all();
    }
}
