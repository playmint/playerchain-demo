import Dexie from 'dexie';

// stop vite being a nob and just let me do a dynamic import
export async function importStatic(modulePath) {
    return import(/* @vite-ignore */ `${modulePath}?${Date.now()}`);
}

// the bigest truncation of a peerId to fit in a 64bit number
export function peerIdTo64bitBigNum(peerId: string): bigint {
    return BigInt(`0x${peerId.slice(0, 15)}`);
}

// wipe all the state
export async function hardReset(dbname?: string) {
    console.log('hard reset');
    for (let i = 0, len = localStorage.length; i < len; ++i) {
        const key = localStorage.key(i);
        console.log('key: ', key);
        if (key && key.startsWith('peerSecret')) {
            console.log('removing key: ', key);
            localStorage.removeItem(key);
        }
    }
    const names = await Dexie.getDatabaseNames();
    names.forEach(function (name) {
        if (dbname && name !== dbname) {
            return;
        }
        console.log('destroying db: ', name);
        const db = new Dexie(name);
        db.delete()
            .then(function () {
                console.log('Database successfully deleted: ', name);
            })
            .catch(function (err) {
                console.error('Could not delete database: ', name, err);
            })
            .finally(function () {
                console.log('Done. Now executing callback if passed.');
            });
    });
}

export function ByRandom() {
    return 0.5 - Math.random();
}
