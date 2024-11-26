import Dexie from 'dexie';
import md5 from 'md5';
import { Buffer } from 'socket:buffer';

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

export function getVersionString() {
    return import.meta.env.SS_VERSION || 'dev';
}

export function getVersionNumberHash(version: string) {
    return md5(version).slice(0, 4);
}

const CHANNEL_CODE_DELIMITER = ':';

export function getChannelCode(channelId: string) {
    return (
        channelId +
        CHANNEL_CODE_DELIMITER +
        getVersionNumberHash(getVersionString())
    );
}

export function splitChannelCode(channelCode: string) {
    const [channelId, hostVersionHash] = channelCode.split(
        CHANNEL_CODE_DELIMITER,
    );
    return { channelId, hostVersionHash };
}

const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArray = TypedArrayPrototype.constructor;

export function isArrayBuffer(object) {
    return object !== null && object instanceof ArrayBuffer;
}

export function isBufferLike(object) {
    return (
        isArrayBuffer(object) || isTypedArray(object) || Buffer.isBuffer(object)
    );
}

export function isTypedArray(input) {
    return input instanceof TypedArray;
}

export function toBuffer(object, encoding = undefined) {
    if (Buffer.isBuffer(object)) {
        return object;
    } else if (isTypedArray(object)) {
        return Buffer.from(object.buffer);
    } else if (typeof object?.toBuffer === 'function') {
        return toBuffer(object.toBuffer(), encoding);
    }

    return Buffer.from(object, encoding);
}

export function isArrayLike(input) {
    return (
        (Array.isArray(input) || isTypedArray(input)) &&
        input !== TypedArrayPrototype &&
        input !== Buffer.prototype
    );
}
