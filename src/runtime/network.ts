import type EventEmitter from 'socket:events';
import { NETWORK_ID } from './config';
import { DB, NetworkInfo } from './db';
import Peer from './network/Peer';
import { RemotePeer } from './network/RemotePeer';
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
    socket: SocketCluster;
    shutdown: () => void;
};

export async function createSocketCluster({
    db,
    keys,
    network,
    clusterId,
    config,
}: {
    db: DB;
    keys: ClientKeys;
    network: SocketClusterConstructor;
    clusterId: Uint8Array;
    config?: SocketPersistedState;
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

    const socket = await network({
        peerId: info.peerId,
        clusterId: info.clusterId,
        keepalive: info.keepalive,
        signingKeys: keys,
        // worker: false,
        ...ports,
        ...(config || {}),
        // config: config
        //     ? {
        //           ...ports,
        //           peerId: info.peerId,
        //           clusterId: info.clusterId,
        //           signingKeys: keys,
        //           keepalive: info.keepalive,
        //       }
        //     : undefined,
    });
    console.log('started net');
    defer(() => {
        socket.disconnect();
        socket.close();
    });

    const onApplicationResume = () => {
        console.log('APPLICATION RESUME');
        if (socket) {
            socket.reconnect();
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
            socket.reconnect();
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
    socket.on('#ready', onReady);
    defer(() => socket.off('#ready', onReady));

    // store the nat type
    const onNat = (natType: number) => {
        console.log('nat updated');
        db.network
            .update(NETWORK_ID, {
                natType,
                natName: NAT.toString(natType),
            })
            .catch((err) => {
                console.error('network-nat-update-err:', err);
            });
    };
    socket.on('#nat', onNat);
    defer(() => socket.off('#nat', onNat));

    //
    // Debugging! Just tweak to filter logs, this is a firehose!
    // Don't listen to debug in production, it can strain the CPU.
    // eslint-disable-next-line no-constant-condition
    if (
        import.meta.env.SS_DEBUG === 'true' ||
        globalThis.process?.env?.SS_DEBUG === 'true'
    ) {
        let clock = Date.now();
        socket.on('#debug', (pid, str) => {
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
        });
    }

    socket.on('#error', (err) => {
        console.error('SOCKET ERROR', err);
    });
    // socket.on('#packet', (...args) => console.log('PACKET', ...args))
    // socket.on('#send', (...args) => console.log('SEND', ...args))

    const shutdown = () => {
        for (const fn of onShutdown) {
            fn();
        }
    };

    return { socket, shutdown };
}

// better socket types
export interface ClientKeys {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

export type SocketPeer = Omit<EventEmitter, 'emit'> & {
    peerId: string; // 32 byte hex string
    address: string;
    port: number;
    _peer?: {
        connected: boolean;
        proxies: Map<string, RemotePeer>; // if set then we are proxying to get to this peer
        localPeer?: any;
        lastUpdate: number;
        lastRequest: number;
        natType: number;
    };
    emit(
        eventName: string,
        value: Uint8Array | Buffer,
        opts?: SocketEmitOpts,
    ): Promise<unknown>;
    stream(
        eventName: string,
        value: Uint8Array | Buffer,
        opts?: SocketEmitOpts,
    ): Promise<unknown>;
};
export interface SocketEmitOpts {
    ttl?: number;
}
export type SocketSubcluster = Omit<EventEmitter, 'emit'> & {
    // peerId: string; // 32 byte hex string
    subclusterId: Buffer; // bufferize public key from the derived key
    sharedKey: Uint8Array; // the shared secret
    derivedKeys: ClientKeys; // the keypair derived from the shared key
    peers: Map<string, SocketPeer>;
    emit(
        eventName: string,
        value: Uint8Array | Buffer,
        opts?: SocketEmitOpts,
    ): Promise<unknown>;
    stream(
        eventName: string,
        value: Uint8Array | Buffer,
        opts?: SocketEmitOpts,
    ): Promise<unknown>;
    join(): any;
};
export type SocketCluster = Omit<EventEmitter, 'emit'> & {
    subclusters: Map<string, SocketSubcluster>; // subclusterId => subcluster
    emit(
        eventName: string,
        value: Uint8Array | Buffer,
        opts?: SocketEmitOpts,
    ): Promise<unknown>;
    subcluster(opts: { sharedKey: Uint8Array }): Promise<SocketSubcluster>;
    getInfo(): object;
    getMetrics(): object;
    getState(): object;
    addIndexedPeer(peerInfo: {
        peerId: string;
        address: string;
        port: number;
    }): void;
    close(): void;
    sync(peerId: string): void;
    reconnect(): void;
    disconnect(): void;
    _peer: Peer;
    MAX_CACHE_TTL: number;
};

export type SocketClusterConstructor = (cfg: any) => Promise<SocketCluster>;

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

export type SocketPeerState = {
    address: string;
    port: number;
    peerId: string; // hex enc
    natType: number;
    indexed: boolean;
};
export type SocketPersistedState = {
    address?: string;
    port?: number;
    indexed?: boolean;
    natType?: number;
    limitExempt?: boolean;
};
