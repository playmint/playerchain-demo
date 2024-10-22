import { Buffer } from 'socket:buffer';
import { Encryption } from 'socket:node/index';
import { CLUSTER_ID } from '../runtime/config';
import Peer from '../runtime/network/Peer';

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
    process.on('SIGINT', function () {
        console.log('shutdown');
        process.exit();
    });

    const clusterId = await Encryption.createClusterId(CLUSTER_ID);
    const keys = await Encryption.createKeyPair(SS_SECRET);
    const peerId = Buffer.from(keys.publicKey).toString('hex');

    console.log('--------------------');
    console.log('version: subfi-v0.1.0');
    console.log('peerId:', peerId);
    console.log('address:', SS_ADDRESS);
    console.log('port:', SS_PORT);
    console.log('clusterId:', CLUSTER_ID);
    console.log('--------------------');

    const socket = new Peer({
        address: SS_ADDRESS,
        port: Number(SS_PORT),
        natType: 31,
        indexed: true,
        limitExempt: true,
        signingKeys: keys,
        clusterId,
    });

    let ready = false;

    const logState = () => {
        console.log(`
-----------
peerId: ${peerId}
peers: ${socket.peers.size}
active: ${ready}
${Array.from(socket.peers)
    .map(([peerId, peer]) => `${peerId} ${peer.address}:${peer.port}`)
    .join('\n')}
-----------`);
    };

    socket.onReady = () => {
        ready = true;
        logState();
    };

    socket.onError = (err) => {
        console.error(peerId, 'error:', err);
    };

    if (
        import.meta.env.SS_DEBUG === 'true' ||
        globalThis.process?.env?.SS_DEBUG === 'true'
    ) {
        socket.onDebug = (pid, str) => {
            pid = pid.slice(0, 6);
            console.log(pid, str);
        };
    }

    setInterval(logState, 30000);

    await socket.init();
    return socket;
}

main()
    .then((peer) => {
        console.log(peer.peerId, 'started');
    })
    .catch((err) => {
        console.error('exit err:', err);
        process.exit(1);
    });
