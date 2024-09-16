import { NETWORK_ID } from './config';
import { DB, NetworkInfo } from './db';
import Peer, { Keys, PeerConfig } from './network/Peer';
import * as NAT from './network/nat';

export type Ports = {
    port?: number;
    probeInternalPort?: number;
};

// FIXME: remove this distinction between envs and make it configurable
async function getPorts(): Promise<Ports> {
    if (import.meta.env.MODE === 'hacky') {
        const application = await import('socket:application');
        const win = await application.getCurrentWindow();
        return {
            port: 9801 + win.index * 2,
            probeInternalPort: 9802 + win.index * 2,
        };
    } else {
        return {};
    }
}

export type SocketNetwork = {
    socket: Peer;
    shutdown: () => void;
};

export async function createSocketCluster({
    db,
    keys,
    dgram,
    clusterId,
    config,
}: {
    db: DB;
    keys: Keys;
    clusterId: Uint8Array;
    config: PeerConfig;
    dgram: typeof import('node:dgram');
}): Promise<SocketNetwork> {
    const onShutdown: any[] = [];
    const defer = (fn: any) => {
        onShutdown.push(fn);
    };
    const peerId = Buffer.from(keys.publicKey).toString('hex');
    const ports = await getPorts();
    const info: NetworkInfo = {
        id: NETWORK_ID,
        clusterId,
        peerId,
        keepalive: 30_000,
        natType: -1,
        online: globalThis.navigator?.onLine ?? true,
        ready: false,
        ...ports,
    };

    await db.network.put(info);

    const socket = new Peer(config, dgram);
    await socket.init();

    console.log('started net');
    defer(() => {
        socket.close();
    });

    const onApplicationResume = () => {
        console.log('APPLICATION RESUME');
        if (socket) {
            socket.reconnect().catch((err) => {
                console.error('reconnect-err:', err);
            });
        }
    };
    globalThis.addEventListener('applicationresume', onApplicationResume);
    defer(() =>
        globalThis.removeEventListener(
            'applicationresume',
            onApplicationResume,
        ),
    );

    const onApplicationPause = () => {
        console.log('APPLICATION PAUSE');
    };
    globalThis.addEventListener('applicationpause', onApplicationPause);
    defer(() =>
        globalThis.removeEventListener('applicationpause', onApplicationPause),
    );

    const onOnline = () => {
        console.log('APPLICATION ONLINE');
        if (socket) {
            socket.reconnect().catch((err) => {
                console.error('reconnect-err:', err);
            });
        }
        db.network.update(NETWORK_ID, { online: true }).catch((err) => {
            console.error('network-online-update-err:', err);
        });
    };
    globalThis.addEventListener('online', onOnline);
    defer(() => globalThis.removeEventListener('online', onOnline));

    const onOffline = () => {
        db.network.update(NETWORK_ID, { online: false }).catch((err) => {
            console.error('network-offline-update-err:', err);
        });
        console.log('APPLICATION OFFLINE');
    };
    globalThis.addEventListener('offline', onOffline);
    defer(() => globalThis.removeEventListener('offline', onOffline));

    // mark network as ready
    const onReady = (info) => {
        console.log('ready updated', JSON.stringify(info));
        db.network
            .update(NETWORK_ID, {
                ready: true,
                address: info.address,
                port: info.port,
                clock: info.clock,
                uptime: info.uptime,
                natType: info.natType,
                natName: NAT.toString(info.natType),
            })
            .catch((err) => {
                console.error('network-ready-update-err:', err);
            });
    };
    socket.onReady = onReady;

    // Debugging! Just tweak to filter logs, this is a firehose!
    // Don't listen to debug in production, it can strain the CPU.
    // eslint-disable-next-line no-constant-condition
    if (
        import.meta.env.SS_DEBUG === 'true' ||
        globalThis.process?.env?.SS_DEBUG === 'true'
    ) {
        let clock = Date.now();
        socket.onDebug = (pid, str) => {
            pid = pid.slice(0, 6);

            // if (str.includes('SYNC')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('JOIN')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('CONN')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('<- STREAM')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('<- PUB')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('DROP')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('PONG')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('INTRO')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('WRITE')) {
            //     console.log(pid, str, ...args);
            // }

            // if (str.includes('XX') || str.includes('LIMIT')) {
            //     console.log(pid, str, ...args);
            // }

            // everything expect the SENDS
            const delta = Date.now() - clock;
            console.log(pid, str, `[${delta}ms]`);
            clock = Date.now();
        };
    }

    socket.onError = (err) => {
        console.error('SOCKET ERROR', err);
    };
    // socket.on('#packet', (...args) => console.log('PACKET', ...args))
    // socket.on('#send', (...args) => console.log('SEND', ...args))

    const shutdown = () => {
        for (const fn of onShutdown) {
            fn();
        }
    };

    return { socket, shutdown };
}

export interface SocketEmitOpts {
    ttl?: number;
}

export type SocketRPCGetMessagesByHeight = {
    name: 'requestMessagesBySig';
    timestamp: number;
    sender: string;
    args: {
        sig: Uint8Array;
    };
};

export type SocketRPCRequest = SocketRPCGetMessagesByHeight;

export type SocketRPCResponse = {
    err?: string;
    result?: any;
};
