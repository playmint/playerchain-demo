import 'fake-indexeddb/auto';
import dgram from 'node:dgram';
import { Buffer } from 'socket:buffer';
import { Encryption } from 'socket:node/index';
import { CLUSTER_ID } from '../runtime/config';

// using dynamic imports here to ensure that the polyfill is loaded before the dexie library
async function imports() {
    const Dexie = await import('dexie');
    const { Client } = await import('../runtime/client');
    return { Dexie, Client };
}

function env(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`missing env var: ${name}`);
    }
    return value;
}

// monkey patching the globalThis object to be a no-op event emitter
// the network listens for online/offline events which we don't care about in this context
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

// config via env vars
const SS_PORT = env('SS_PORT');
const SS_ADDRESS = env('SS_ADDRESS');
const SS_SECRET = env('SS_SECRET');

async function main() {
    const { Client } = await imports();
    const clusterId = await Encryption.createClusterId(CLUSTER_ID);
    const keys = await Encryption.createKeyPair(SS_SECRET);
    const peerId = Buffer.from(keys.publicKey).toString('hex');
    const shortId = peerId.slice(0, 8);
    const dbname = `client/${shortId}`;

    console.log('--------------------');
    console.log('version: subfi-v0.1.0');
    console.log('peerId:', peerId);
    console.log('address:', SS_ADDRESS);
    console.log('port:', SS_PORT);
    console.log('clusterId:', CLUSTER_ID);
    console.log('--------------------');

    const client = await Client.from({
        dbname,
        clusterId,
        keys,
        dgram,
        config: {
            address: SS_ADDRESS,
            port: Number(SS_PORT),
            natType: 31,
            indexed: true,
            limitExempt: true,
            signingKeys: keys,
            clusterId,
        },
        enableSync: false,
    });
    console.log('client', client.shortId);
}

main()
    .then(() => {
        console.log('ok');
    })
    .catch((err) => {
        console.error('exit err:', err);
        process.exit(1);
    });
