/**
 * This module provides primitives for creating a p2p network.
 */
import * as Comlink from 'comlink';
import { Buffer } from 'socket:buffer';
import { createSocket } from 'socket:dgram';
import { BOOTSTRAP_PEERS } from '../bootstrap';
import { isBufferLike } from '../utils';
import { RemotePeer } from './RemotePeer';
import { Subcluster, SubclusterConfig } from './Subcluster';
import { Cache } from './cache';
import type { defaultSiblingResolver } from './cache';
import { randomBytes } from './encryption';
import { Encryption } from './encryption';
import * as NAT from './nat';
import {
    Packet,
    PacketIntro,
    PacketJoin,
    PacketNoRoute,
    PacketPing,
    PacketPong,
    PacketPublish,
    PacketPublishProxied,
    VERSION,
    sha256,
} from './packets';

const websocketUrl = import.meta.env.SS_WEBSOCKET_URL ?? null;

export { Packet, sha256, Cache, Encryption, NAT };

/**
 * Retry delay in milliseconds for ping.
 */
export const PING_RETRY: number = 250;

/**
 * Probe wait timeout in milliseconds.
 */
export const PROBE_WAIT: number = 512;

/**
 * Default keep alive timeout.
 */
export const DEFAULT_KEEP_ALIVE: number = 10_000;

/**
 * Default rate limit threshold in milliseconds.
 */
export const DEFAULT_RATE_LIMIT_THRESHOLD: number = 8000;

const PRIV_PORTS = 1024;
const MAX_PORTS = 65535 - PRIV_PORTS;

const PEERID_REGEX = /^([A-Fa-f0-9]{2}){32}$/;

/**
 * Port generator factory function.
 */
export const getRandomPort = (
    ports: Set<number> = new Set(),
    p?: number | null,
): number => {
    do {
        p = Math.max(1024, Math.ceil(Math.random() * 0xffff));
    } while (ports.has(p) && ports.size < MAX_PORTS);

    ports.add(p);
    return p;
};

const isReplicatable = (type) =>
    type === PacketPublish.type || type === PacketJoin.type;

/**
 * Computes rate limit predicate value for a port and address pair for a given
 * threshold updating an input rates map. This method is accessed concurrently,
 * the rates object makes operations atomic to avoid race conditions.
 */
interface Rate {
    mtime?: number;
    time: number;
    quota: number;
    used: number;
}

export function rateLimit(
    rates: Map<string, Rate>,
    type: number,
    port: number,
    address: string,
    subclusterIdQuota?: number,
): boolean {
    const R = isReplicatable(type);
    const key = (R ? 'R' : 'C') + ':' + address + ':' + port;
    const quota = subclusterIdQuota || (R ? 1024 : 1024 * 1024);
    const time = Math.floor(Date.now() / 60000);
    const rate: Rate = rates.get(key) || { time, quota, used: 0 };

    rate.mtime = Date.now(); // checked by mainLoop for garabge collection

    if (time !== rate.time) {
        rate.time = time;
        if (rate.used > rate.quota) {
            rate.quota -= 1;
        } else if (rate.used < quota) {
            rate.quota += 1;
        }
        rate.used = 0;
    }

    rate.used += 1;

    rates.set(key, rate);
    return rate.used >= rate.quota;
}

export interface Keys {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

export type PeerConfig = {
    signingKeys: Keys;
    clusterId: Uint8Array;
    address?: string;
    port?: number;
    probeInternalPort?: number;
    indexed?: boolean;
    natType?: number;
    limitExempt?: boolean;
    siblingResolver?: typeof defaultSiblingResolver;
    keepalive?: number;
};

export class Peer {
    port: number | null;
    address: string | null;
    indexed: boolean;
    limitExempt: boolean;
    natType: number | null = NAT.UNKNOWN;
    nextNatType = NAT.UNKNOWN;
    clusterId: Uint8Array;
    cid: string;
    peers: Map<string, RemotePeer>;
    subclusters: Map<string, Subcluster> = new Map();
    peerMapping: Map<string, Set<string>> = new Map(); // peerId -> Set<subclusterId>
    reflectionId = null;
    reflectionTimeout: any = null;
    probeReflectionTimeout: any = null;
    probeInternalPort: number | null;
    probeExternalPort?: number;
    reflectionStage = 0;
    reflectionRetry = 1;
    reflectionFirstResponder: any = null;
    reflectionFirstResponderTimeout: any = null;
    peerId: string;
    isListening = false;
    ctime = Date.now();
    lastUpdate = 0;
    closing = false;
    clock = 0;
    unpublished = {};
    cache: Cache;
    uptime = 0;
    maxHops = 8; // should be 16
    bdpCache: number[] = [];
    sendTimeout?: any;
    mainLoopTimer?: any;
    keepalive: number;
    pendingPings: Map<string, number> = new Map();

    createSocket: typeof createSocket;

    onListening?: () => void;
    onDelete?: (packet: Packet) => void;

    rates = new Map();
    gate = new Map();
    encryption: Encryption;

    socket: any;
    socketPool?: import('socket:dgram').Socket[];
    probeSocket: import('socket:dgram').Socket;

    onDebug?: (peerId: string, ...args: any[]) => void;
    onState?: () => void;
    onError?: (err: Error) => void;
    onReady?: (info: object) => void;
    onMessage?: (msg: Buffer, rinfo: any) => void;
    onLimit?: (...args: any[]) => boolean | undefined;
    onConnection?: (...args: any[]) => void;

    metrics = {
        i: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, DROPPED: 0 },
        o: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    };

    constructor(config: PeerConfig, _dgramImpl?: typeof import('node:dgram')) {
        this.createSocket = createSocket;

        this.peerId = Buffer.from(config.signingKeys.publicKey).toString('hex');
        this.encryption = new Encryption();
        this.clusterId = config.clusterId;
        this.cid = Buffer.from(this.clusterId).toString('base64');
        this.limitExempt = !!config.limitExempt;
        this.indexed = !!config.indexed;
        this.keepalive = config.keepalive ?? DEFAULT_KEEP_ALIVE;

        // initial peer list
        // hardcoding this is temporary, you need at least one peer to connect to
        // but any peer will do, so long as it is online. this just is a list of
        // known peers that are likely to be online to get you started
        this.peers = new Map(
            BOOTSTRAP_PEERS.map((o) => [
                o.peerId,
                new RemotePeer({
                    ...o,
                    indexed: true,
                    localPeer: this,
                    clock: 0,
                    clusterId: this.clusterId,
                }),
            ]),
        );

        let cacheData;
        this.cache = new Cache(cacheData, config.siblingResolver);
        // this.cache.onEjected = (p) => this.mcast(p);
        // this.cache.onEjected = (_p) => console.log('onEject noop');

        this.unpublished = {};

        if (!this.indexed && !this.clusterId) {
            throw new Error('constructor expected .clusterId');
        }

        this.port = config.port || null;
        this.probeInternalPort = config.probeInternalPort || null;
        this.natType = config.natType || null;
        this.address = config.address || null;

        this.socket = this.createSocket({ type: 'udp4', websocketUrl });
        console.log('created socket with websocketUrl', websocketUrl);
        this.probeSocket = this.createSocket({
            type: 'udp4',
            websocketUrl,
        });

        const isRecoverable = (err) =>
            err.code === 'ECONNRESET' ||
            err.code === 'ECONNREFUSED' ||
            err.code === 'EADDRINUSE' ||
            err.code === 'ETIMEDOUT';

        this.socket.on('error', (err) => isRecoverable(err) && this._listen());
        this.probeSocket.on(
            'error',
            (err) => isRecoverable(err) && this._listen(),
        );
    }

    async set(event, fn) {
        this[event] = fn;
    }

    _onError = (err) => {
        this.onError && this.onError(err);
    };

    _onDebug(...args) {
        if (this.onDebug) {
            this.onDebug(this.peerId, ...args);
        }
    }

    /**
     * A method that encapsulates the listing procedure
     */
    async _listen() {
        this.socket.removeAllListeners();
        this.probeSocket.removeAllListeners();

        this.socket.on('message', (data, opts) => this._onMessage(data, opts));
        this.socket.on('error', (err) => this._onError(err));
        this.probeSocket.on('message', (data, opts) =>
            this._onProbeMessage(data, opts),
        );
        this.probeSocket.on('error', (err) => this._onError(err));

        if (this.socket.setMaxListeners) {
            this.socket.setMaxListeners(2048);
            this.probeSocket.setMaxListeners(2048);
        }

        const listening = Promise.all([
            new Promise((resolve) => this.socket.on('listening', resolve)),
            new Promise((resolve) => this.probeSocket.on('listening', resolve)),
        ]);

        await new Promise((resolve) => {
            console.log('binding socket');
            this.socket.bind(
                websocketUrl ? undefined : this.port || 0,
                undefined,
                () => {
                    console.log('socket bound');
                    const { address, port } = this.socket.address();
                    console.log('socket address', address, port);
                    this.port = port;
                    this.address = address;
                    this.socket.emit('listening');
                    resolve(true);
                },
            );
        });
        await new Promise((resolve) => {
            this.probeSocket.bind(
                websocketUrl ? undefined : this.probeInternalPort || 0,
                undefined,
                () => {
                    console.log('probeSocket bound');
                    const { port } = this.probeSocket.address();
                    console.log('probe port', port);
                    this.probeInternalPort = port;
                    this.probeSocket.emit('listening');
                    resolve(true);
                },
            );
        });

        await listening;

        this.port = (this.socket.address() as any).port;
        this.probeInternalPort = (this.probeSocket.address() as any).port;

        if (this.onListening) {
            this.onListening();
        }
        this.isListening = true;

        this._onDebug(
            `++ INIT (config.internalPort=${this.port}, config.probeInternalPort=${this.probeInternalPort})`,
        );
    }

    /*
     * This method will bind the sockets, begin pinging known peers, and start
     * the main program loop.
     */
    async init() {
        if (!this.isListening) {
            try {
                await this._listen();
            } catch (err) {
                console.error('listen-err', err);
                throw err;
            }
        }

        await this._mainLoop(Date.now());
        this.mainLoopTimer = setInterval(
            () => this._mainLoop(Date.now()),
            this.keepalive / 2,
        );

        if (this.indexed && this.onReady) {
            return this.onReady(await this.getInfo());
        }
    }

    /**
     * Continuously evaluate the state of the peer and its network
     */
    async _mainLoop(ts: number): Promise<boolean> {
        if (this.closing) {
            clearInterval(this.mainLoopTimer);
            return true;
        }

        if (!Peer.onLine()) {
            return true;
        }

        if (!this.reflectionId) {
            await this.requestReflection();
        }

        this.uptime += this.keepalive;

        // heartbeat
        for (const [_, peer] of this.peers) {
            await this.ping(peer, false, {
                message: {
                    requesterPeerId: this.peerId,
                    natType: this.natType,
                },
            });
        }

        // wait for nat type to be discovered
        if (!NAT.isValid(this.natType)) {
            return true;
        }

        for (const [k, packet] of [...this.cache.data]) {
            const p = Packet.from(packet);
            if (!p) {
                continue;
            }
            if (!p.timestamp) {
                p.timestamp = ts;
            }
            const cid = p.clusterId.toString('base64');
            const mult = this.cid === cid ? 2 : 1;
            const ttl = p.ttl < Packet.ttl ? p.ttl : Packet.ttl * mult;
            const deadline = p.timestamp + ttl;

            if (deadline <= ts) {
                // if (p.hops < this.maxHops) {
                //     await this.mcast(p);
                // }
                this.cache.delete(k);
                this._onDebug('-- DELETE', k, this.cache.size);
                if (this.onDelete) {
                    this.onDelete(p);
                }
            }
        }

        for (const [k, v] of this.gate.entries()) {
            if (v <= 1) {
                this.gate.delete(k);
            } else {
                this.gate.set(k, v - 1);
            }
        }

        // prune peer list
        const disconnectedPeers: Set<RemotePeer> = new Set(); // reset
        for (const [, peer] of this.peers) {
            if (peer.indexed) {
                continue;
            }
            if (peer.useProxy) {
                // we don't receive keepalives from peers that are using proxy
                // so we can't rely on the lastSeen timestamp to determine if we should prune
                // instead we wait til the peer has no proxies connected
                continue;
            }
            const expired = peer.lastSeen + this.keepalive * 2 < ts;
            if (!expired) {
                continue;
            }
            disconnectedPeers.add(peer);
            // if we lost this peer, we need to remove it from any peers that
            // were depending on it for proxying
            for (const [, dependentPeer] of this.peers) {
                if (dependentPeer.indexed) {
                    continue;
                }
                dependentPeer.proxies.delete(peer.peerId);
            }
        }
        // drop any proxyless peers that needed a proxy
        for (const [, peer] of this.peers) {
            if (peer.useProxy && peer.proxies.size === 0 && !peer.indexed) {
                disconnectedPeers.add(peer);
            }
        }
        for (const peer of disconnectedPeers) {
            this._onDebug(`-- DISCONNECT peer=${peer.peerId.slice(0, 6)}`);
            this.peers.delete(peer.peerId);
        }
        // TODO: expire oldest peer if we are at the peer limit
        // if (this.peers.size >= 256) {
        //     // TODO evicting an older peer definitely needs some more thought.
        //     const oldPeerIndex = this.peers.findIndex(
        //         (p) => !p.lastUpdate && !p.indexed,
        //     );
        //     if (oldPeerIndex > -1) {
        //         this.peers.splice(oldPeerIndex, 1);
        //     }
        // }

        // if this peer has previously tried to join any clusters, multicast a
        // join messages for each into the network so we are always searching.
        await this.reconnect();

        // clear out any old pending pings
        for (const [pingId, ts] of this.pendingPings.entries()) {
            if (Date.now() - ts > 2000) {
                this.pendingPings.delete(pingId);
            }
        }

        return true;
    }

    /**
     * sent to the network
     */
    send(
        data: Uint8Array,
        packet: Packet,
        port: number,
        address: string,
        socket = this.socket,
    ) {
        const pid = packet.packetId.toString('hex');
        socket.send(data, port, address, (err) => {
            delete this.unpublished[pid];
            if (err) {
                console.warn(`send: error: ${err}`);
                return;
            }

            this.metrics.o[packet.type]++;

            this._onDebug(
                `>> SENT (packetId=${pid.slice(0, 6)} from=${this.address}:${this.port}, to=${address}:${port}, type=${packet.type} size=${data.length})`,
            );
        });
    }

    async stream(peerId: string, subcluster: Subcluster, args: any) {
        const p = this.peers.get(peerId);
        if (p) {
            return p.write(subcluster, args);
        }
    }

    /**
     * Send any unpublished packets
     */
    async sendUnpublished(): Promise<void> {
        for (const [packetId] of Object.entries(this.unpublished)) {
            const packet = this.cache.get(packetId);

            if (!packet) {
                // it may have been purged already
                delete this.unpublished[packetId];
                continue;
            }

            await this.mcast(packet);
            this._onDebug(`-> SEND UNPUBLISHED (packetId=${packetId})`);
            if (this.onState) {
                this.onState();
            }
        }
    }

    /**
     * Get the serializable state of the peer (can be passed to the constructor or create method)
     */
    getState() {
        const clock = this.clock; // save off the clock

        const peers = Array.from(this.peers.values()).map((p) => {
            const p2: any = { ...p };
            delete p2.localPeer;
            return p2;
        });

        return {
            peers,
            clock,
            data: [...this.cache.data.entries()],
            unpublished: this.unpublished,
            // FIXME: this is missing most of the stuff since refactoring
        };
    }

    async getInfo() {
        return {
            address: this.address,
            port: this.port,
            clock: this.clock,
            uptime: this.uptime,
            natType: this.natType,
            natName: NAT.toString(this.natType),
            peerId: this.peerId,
        };
    }

    async cacheInsert(packet) {
        const p = Packet.from(packet);
        if (!p) {
            return;
        }
        this.cache.insert(p.packetId.toString('hex'), p);
    }

    async addIndexedPeer(info) {
        if (!info.peerId) {
            throw new Error('options.peerId required');
        }
        if (!info.address) {
            throw new Error('options.address required');
        }
        if (!info.port) {
            throw new Error('options.port required');
        }
        info.indexed = true;
        this.peers.set(info.peerId, new RemotePeer(info));
    }

    async reconnect() {
        for (const [_, subcluster] of this.subclusters) {
            await this.join(subcluster);
        }
    }

    async disconnect() {
        this.natType = 0;
        this.reflectionStage = 0;
        this.reflectionId = null;
        this.reflectionTimeout = null;
        this.probeReflectionTimeout = null;
    }

    async sealUnsigned(message, v) {
        return this.encryption.sealUnsigned(message, v);
    }

    async openUnsigned(message, v) {
        return this.encryption.openUnsigned(message, v);
    }

    async seal(message, v) {
        return this.encryption.seal(message, v);
    }

    async open(message, v) {
        return this.encryption.open(message, v);
    }

    async addEncryptionKey(pk, sk) {
        return this.encryption.add(pk, sk);
    }

    /**
     * Get a selection of known peers
     */
    getPeers(packet: any, ignorelist, filter = (o) => o): RemotePeer[] {
        const peers = Array.from(this.peers.values());
        const rand = () => Math.random() - 0.5;

        const base = (p) => {
            if (
                ignorelist.findIndex(
                    (ilp) => ilp.port === p.port && ilp.address === p.address,
                ) > -1
            ) {
                return false;
            }
            if (p.lastUpdate === 0) {
                return false;
            }
            if (p.lastUpdate < Date.now() - this.keepalive * 3) {
                return false;
            }
            if (this.peerId === p.peerId) {
                return false;
            } // same as me
            if (packet.message?.requesterPeerId === p.peerId) {
                return false;
            } // TODO: same as requester - is this true in all cases?
            if (!p.port || !NAT.isValid(p.natType)) {
                return false;
            }
            return true;
        };

        const candidates = peers.filter(filter).filter(base).sort(rand);

        const list = candidates.slice(0, 3);

        if (!list.some((p) => p.indexed)) {
            const indexed = candidates.filter(
                (p) => p.indexed && !list.includes(p),
            );
            if (indexed.length) {
                list.push(indexed[0]);
            }
        }

        const cid = packet.clusterId.toString('base64');
        const friends = candidates.filter(
            (p) => p.cid === cid && !list.includes(p),
        );
        if (friends.length) {
            list.unshift(friends[0]);
            list.unshift(
                ...candidates.filter(
                    (c) =>
                        c.address === friends[0].address &&
                        c.peerId === friends[0].peerId,
                ),
            );
        }

        return list;
    }

    /**
     * Send an eventually consistent packet to a selection of peers (fanout)
     */
    async mcast(packet: Packet, ignorelist: any[] = []) {
        const peers = this.getPeers(packet, ignorelist);
        const pid = packet.packetId.toString('hex');

        packet.hops += 1;

        const data = await Packet.encode(packet);
        for (const peer of peers) {
            this.send(data, packet, peer.port, peer.address);
        }

        if (this.gate.has(pid)) {
            return;
        }
        this.gate.set(pid, 1);
    }

    /**
     * The process of determining this peer's NAT behavior (firewall and dependentness)
     */
    requestReflection = async () => {
        if (this.closing || this.indexed || this.reflectionId) {
            this._onDebug('<> REFLECT ABORTED', this.reflectionId);
            return;
        }

        if (
            this.natType &&
            this.lastUpdate > 0 &&
            Date.now() - this.keepalive * 2 < this.lastUpdate
        ) {
            this._onDebug(
                `<> REFLECT NOT NEEDED (last-recv=${Date.now() - this.lastUpdate}ms)`,
            );
            return;
        }

        this._onDebug(
            '-> REQ REFLECT',
            this.reflectionId,
            this.reflectionStage,
        );

        const peers = Array.from(this.peers.values())
            .filter((p) => p.lastSeen !== 0)
            .filter(
                (p) =>
                    p.natType === NAT.UNRESTRICTED ||
                    p.natType === NAT.ADDR_RESTRICTED ||
                    p.indexed,
            );

        if (peers.length < 2) {
            this._onDebug(
                'XX REFLECT NOT ENOUGH PINGABLE PEERS - RETRYING',
                peers,
            );

            // tell all well-known peers that we would like to hear from them, if
            // we hear from any we can ask for the reflection information we need.
            for (const peer of Array.from(this.peers.values())
                .filter((p) => p.indexed)
                .sort(() => Math.random() - 0.5)
                .slice(0, 32)) {
                await this.ping(peer, false, {
                    message: {
                        isConnection: true,
                        requesterPeerId: this.peerId,
                    },
                });
            }

            if (++this.reflectionRetry > 16) {
                this.reflectionRetry = 1;
            }
            return setTimeout(
                this.requestReflection,
                this.reflectionRetry * 256,
            );
        }

        this.reflectionRetry = 1;

        const requesterPeerId = this.peerId;
        const opts: any = { requesterPeerId, isReflection: true };

        this.reflectionId = opts.reflectionId = Buffer.from(randomBytes(6))
            .toString('hex')
            .padStart(12, '0');

        //
        // # STEP 1
        // The purpose of this step is strictily to discover the external port of
        // the probe socket.
        //
        if (this.reflectionStage === 0) {
            // start refelection with an zeroed NAT type
            if (this.reflectionTimeout) {
                clearTimeout(this.reflectionTimeout);
            }
            this.reflectionStage = 1;

            this._onDebug('-> NAT REFLECT - STAGE1: A', this.reflectionId);
            const list = peers
                .filter((p) => p.probed)
                .sort(() => Math.random() - 0.5);
            const peer = list.length ? list[0] : peers[0];
            peer.probed = Date.now(); // mark this peer as being used to provide port info
            await this.ping(
                peer,
                false,
                { message: { ...opts, isProbe: true } },
                this.probeSocket,
            );

            // we expect onMessageProbe to fire and clear this timer or it will timeout
            this.probeReflectionTimeout = setTimeout(() => {
                this.probeReflectionTimeout = null;
                if (this.reflectionStage !== 1) {
                    return;
                }
                this._onDebug(
                    'XX NAT REFLECT - STAGE1: C - TIMEOUT',
                    this.reflectionId,
                );

                this.reflectionStage = 1;
                this.reflectionId = null;
                this.requestReflection().catch((err) =>
                    console.error('req-reflection-err', err),
                );
            }, 1024);

            this._onDebug('-> NAT REFLECT - STAGE1: B', this.reflectionId);
            return;
        }

        //
        // # STEP 2
        //
        // The purpose of step 2 is twofold:
        //
        // 1) ask two different peers for the external port and address for our primary socket.
        // If they are different, we can determine that our NAT is a `ENDPOINT_DEPENDENT`.
        //
        // 2) ask the peers to also reply to our probe socket from their probe socket.
        // These packets will both be dropped for `FIREWALL_ALLOW_KNOWN_IP_AND_PORT` and will both
        // arrive for `FIREWALL_ALLOW_ANY`. If one packet arrives (which will always be from the peer
        // which was previously probed), this indicates `FIREWALL_ALLOW_KNOWN_IP`.
        //
        if (this.reflectionStage === 1) {
            this.reflectionStage = 2;
            const probeExternalPort = this.probeExternalPort;

            // peer1 is the most recently probed (likely the same peer used in step1)
            // using the most recent guarantees that the the NAT mapping is still open
            const peer1 = peers
                .filter((p) => p.probed)
                .sort((a, b) => b.probed - a.probed)[0];

            // peer has NEVER previously been probed
            const peer2 = peers
                .filter((p) => !p.probed)
                .sort(() => Math.random() - 0.5)[0];

            if (!peer1 || !peer2) {
                this._onDebug(
                    'XX NAT REFLECT - STAGE2: INSUFFICENT PEERS - RETRYING',
                );
                return setTimeout(this.requestReflection, 256);
            }

            this._onDebug('-> NAT REFLECT - STAGE2: START', this.reflectionId);

            // reset reflection variables to defaults
            this.nextNatType = NAT.UNKNOWN;
            this.reflectionFirstResponder = null;

            await Promise.all([
                this.ping(peer1, false, {
                    message: { ...opts, probeExternalPort },
                }),
                this.ping(peer2, false, {
                    message: { ...opts, probeExternalPort },
                }),
            ]);

            if (this.reflectionTimeout) {
                clearTimeout(this.reflectionTimeout);
                this.reflectionTimeout = null;
            }

            this.reflectionTimeout = setTimeout(() => {
                this.reflectionTimeout = null;
                if (this.reflectionStage !== 2) {
                    return;
                }
                this.reflectionStage = 1;
                this.reflectionId = null;
                this._onDebug(
                    'XX NAT REFLECT - STAGE2: TIMEOUT',
                    this.reflectionId,
                );
                return this.requestReflection();
            }, 2048);
        }
    };

    /**
     * Ping another peer
     */
    async ping(
        peer: RemotePeer,
        withRetry: any,
        props: any,
        socket?: any,
    ): Promise<PacketPing | undefined> {
        if (!peer) {
            return;
        }

        props.message.requesterPeerId = this.peerId;
        props.message.uptime = this.uptime;
        props.message.timestamp = Date.now();
        props.clusterId = this.clusterId;

        if (!props.message.pingId) {
            props.message.pingId = Buffer.from(randomBytes(6))
                .toString('hex')
                .padStart(12, '0');
        }

        const packet = new PacketPing(props);
        const data = await Packet.encode(packet);

        const send = async () => {
            if (this.closing) {
                return false;
            }

            const p = this.peers.get(peer.peerId);
            // if (p?.reflectionId && p.reflectionId === packet.message.reflectionId) {
            //  return false
            // }

            if (!withRetry) {
                this.pendingPings.set(props.message.pingId, Date.now());
            }

            this.send(data, packet, peer.port, peer.address, socket);
            if (p) {
                p.lastRequest = Date.now();
            }
        };

        await send();

        if (withRetry) {
            setTimeout(send, PING_RETRY);
            setTimeout(send, PING_RETRY * 4);
        }

        return packet;
    }

    /**
     * This should be called at least once when an app starts to multicast
     * this peer, and starts querying the network to discover peers.
     */
    async join(
        config: Omit<
            SubclusterConfig,
            'clusterId' | 'signingKeys' | 'localPeer'
        >,
    ): Promise<Subcluster & Comlink.ProxyMarked> {
        const signingKeys = await Encryption.createKeyPair(config.sharedKey);
        const subclusterId = signingKeys.publicKey;
        this.encryption.add(signingKeys.publicKey, signingKeys.privateKey);
        const scid = Buffer.from(subclusterId).toString('base64');

        let subcluster = this.subclusters.get(scid);
        if (!subcluster) {
            subcluster = new Subcluster({
                ...config,
                clusterId: this.clusterId,
                localPeer: this,
                signingKeys,
            });
            this.subclusters.set(subcluster.scid, subcluster);
        }

        if (!this.port || !this.natType) {
            // console.log('-------------------noportnonat');
            return Comlink.proxy(subcluster);
        }

        this.clock += 1;

        const packet = new PacketJoin({
            clock: this.clock,
            clusterId: this.clusterId,
            subclusterId: subcluster.subclusterId,
            message: {
                requesterPeerId: this.peerId,
                natType: this.natType,
                address: this.address,
                port: this.port,
                key: [this.cid, subcluster.scid].join(':'),
            },
        });

        this._onDebug(
            `-> JOIN (clusterId=${this.cid.slice(0, 6)}, subclusterId=${scid.slice(0, 6)}, clock=${(packet as any).clock}/${this.clock})`,
        );
        if (this.onState) {
            this.onState();
        }

        await this.mcast(packet);
        this.gate.set(packet.packetId.toString('hex'), 1);

        return Comlink.proxy(subcluster);
    }

    async _message2packets(T: any, message: any, args) {
        const {
            clusterId,
            subclusterId,
            packet,
            nextId,
            // meta = {},
            usr1,
            usr2,
            sig,
        } = args;

        const messages = [message];
        const len = message?.byteLength ?? message?.length ?? 0;
        let clock = packet?.clock || 0;

        const siblings =
            packet &&
            [...this.cache.data.values()].filter(Boolean).filter((p) => {
                if (!p.previousId || !packet.packetId) {
                    return false;
                }
                return (
                    Buffer.from(p.previousId).compare(
                        Buffer.from(packet.packetId),
                    ) === 0
                );
            });

        if (siblings?.length) {
            // if there are siblings of the previous packet
            // pick the highest clock value, the parent packet or the sibling
            const sort = (a, b) => a.clock - b.clock;
            const sib = siblings.sort(sort).reverse()[0];
            clock = Math.max(clock, sib.clock) + 1;
        }

        clock += 1;

        if (len > 1024) {
            // Split packets that have messages bigger than Packet.maxLength
            throw new Error('MESSAGE_TOO_BIG');
            // messages = [
            //     {
            //         meta,
            //         ts: Date.now(),
            //         size: message.length,
            //         indexes: Math.ceil(message.length / 1024),
            //     },
            // ];
            // let pos = 0;
            // while (pos < message.length) {
            //     messages.push(message.slice(pos, (pos += 1024)));
            // }
        }

        // turn each message into an actual packet
        const packets = messages.map(
            (message) =>
                new T({
                    ...args,
                    clusterId,
                    subclusterId,
                    clock,
                    message,
                    usr1,
                    usr2,
                    usr3: args.usr3,
                    usr4: args.usr4,
                    sig,
                }),
        );

        if (packet) {
            packets[0].previousId = Buffer.from(packet.packetId);
        }
        if (nextId) {
            packets[packets.length - 1].nextId = Buffer.from(nextId);
        }

        // set the .packetId (any maybe the .previousId and .nextId)
        for (let i = 0; i < packets.length; i++) {
            if (packets.length > 1) {
                packets[i].index = i;
            }

            if (i === 0) {
                packets[0].packetId = await sha256(packets[0].message, {
                    bytes: true,
                });
            } else {
                // all fragments will have the same previous packetId
                // the index is used to stitch them back together in order.
                packets[i].previousId = Buffer.from(packets[0].packetId);
            }

            // if (packets[i + 1]) {
            //     packets[i + 1].packetId = await sha256(
            //         Buffer.concat([
            //             await sha256(packets[i].packetId, { bytes: true }),
            //             await sha256(packets[i + 1].message, { bytes: true }),
            //         ]),
            //         { bytes: true },
            //     );

            //     packets[i].nextId = Buffer.from(packets[i + 1].packetId);
            // }
        }

        return packets;
    }

    /**
     * Sends a packet into the network that will be replicated and buffered.
     * Each peer that receives it will buffer it until TTL and then replicate
     * it provided it has has not exceeded their maximum number of allowed hops.
     */
    async publish(
        subcluster: Subcluster,
        args: {
            message: Buffer;
            packet?: Packet | undefined;
            clusterId?: Uint8Array;
            subclusterId?: Uint8Array;
            usr1: Buffer;
            usr2: Buffer;
        },
    ): Promise<Array<PacketPublish>> {
        if (!isBufferLike(args.message)) {
            throw new Error(
                '.publish() will only accept a message of type buffer',
            );
        }

        const keys = subcluster.signingKeys;

        args.subclusterId = keys.publicKey;
        args.clusterId = this.clusterId;

        const cache = new Map();
        const message = this.encryption.seal(args.message, keys);
        const packets = await this._message2packets(
            PacketPublish,
            message,
            args,
        );

        for (let packet of packets) {
            packet = Packet.from(packet);
            if (!packet) {
                continue;
            }
            cache.set(packet.packetId.toString('hex'), packet);
            await this.cacheInsert(packet);

            if (!Peer.onLine()) {
                this.unpublished[packet.packetId.toString('hex')] = Date.now();
                continue;
            }

            await this.mcast(packet);
        }

        // const head = [...cache.values()][0];
        // if there is a head, we can recompose the packets, this gives this
        // peer a consistent view of the data as it has been published.
        // if (this.onPacket && head && head.index === 0) {
        //     const p: any = await this.cache.compose(head, cache);
        //     if (p) {
        //         this.onPacket(p, this.port, this.address, true);
        //         this._onDebug(
        //             `-> PUBLISH (multicasted=true, packetId=${p.packetId.toString('hex').slice(0, 8)})`,
        //         );
        //         return [p];
        //     }
        // }

        return packets;
    }

    close() {
        clearInterval(this.mainLoopTimer);

        if (this.closing) {
            return;
        }

        this.closing = true;
        this.socket.close();
        this.probeSocket.close();
    }

    /**
     *
     * This is a default implementation for deciding what to summarize
     * from the cache when receiving a request to sync. that can be overridden
     *
     */
    cachePredicate(ts?: any) {
        const max = Date.now() - Packet.ttl;
        const T = Math.min(ts || max, max);

        return (packet) => {
            return packet.version === VERSION && packet.timestamp > T;
        };
    }

    /**
     * A connection was made, add the peer to the local list of known
     * peers and call the onConnection if it is defined by the user.
     */
    async _onConnection(
        packet: any,
        peerId: string,
        port: number,
        address: string,
        proxy?: RemotePeer,
        socket?: any,
    ) {
        if (this.closing) {
            return;
        }

        const natType = packet.message.natType;
        if (!NAT.isValid(natType)) {
            return;
        }
        if (!Peer.isValidPeerId(peerId)) {
            return;
        }
        if (peerId === this.peerId) {
            return;
        }

        let peer = this.peers.get(peerId);
        const firstContact = !peer;
        if (!peer) {
            peer = new RemotePeer({
                peerId,
                address,
                port,
                natType,
                localPeer: this,
                clock: 0,
                indexed: false,
                clusterId: packet.clusterId,
            });
            this._onDebug(
                `<- CONNECTION ADDING PEER (id=${peer.peerId}, address=${address}:${port})`,
            );
            this.peers.set(peer.peerId, peer);
        }

        peer.connected = true;
        peer.port = port;
        peer.natType = natType;
        peer.address = address;
        if (socket) {
            peer.socket = socket;
        }

        // assign the peer any cluster we know about right now
        const cid: string = packet.clusterId.toString('base64');
        const scid: string = packet.subclusterId.toString('base64');

        if (proxy && proxy.indexed) {
            // FIXME: we should allow non-index peers as proxies, but we need a heuristic for a "good" proxy
            if (peer.proxies.has(proxy.peerId)) {
                this._onDebug(
                    `<- CONNECTION UPDATING PROXY PEER (id=${peer.peerId}, address=${address}:${port} proxy=${proxy.peerId.slice(0, 6)} count=${peer.proxies.size})`,
                );
            } else {
                this._onDebug(
                    `<- CONNECTION ASSIGNING PROXY PEER (id=${peer.peerId}, address=${address}:${port} proxy=${proxy.peerId.slice(0, 6)} count=${peer.proxies.size + 1})`,
                );
            }
            peer.proxies.set(proxy.peerId, proxy);
            peer.useProxy = true;
        } else {
            if (peer.proxies.size > 0) {
                // remove any proxies that were previously assigned
                // because we are now directly connected
                // console.log(
                //     `SHOULD REMOVE PROXIES, DIRECT CONNECTION ESTABLISHED`,
                // );
                // this._onDebug(
                //     `<- CONNECTION REMOVING PROXY PEER (id=${peer.peerId}, address=${address}:${port} count=${peer.proxies.size - 1})`,
                // );
            }
        }

        this._onDebug(
            '<- CONNECTION (' +
                `peerId=${peer.peerId.slice(0, 6)}, ` +
                `address=${address}:${port}, ` +
                `type=${packet.type}, ` +
                `clusterId=${cid.slice(0, 6)}, ` +
                `subclusterId=${scid.slice(0, 6)})`,
        );

        if (firstContact && this.onConnection) {
            this.onConnection(packet, peer, port, address);
        }
    }

    /**
     * Received a Ping Packet
     */
    async _onPing(packet: any, port: any, address: any, _data: any) {
        this.metrics.i[packet.type]++;

        this.lastUpdate = Date.now();
        const {
            reflectionId,
            isReflection,
            isConnection,
            requesterPeerId,
            natType,
        } = packet.message;

        if (requesterPeerId === this.peerId) {
            return;
        } // from self?

        const { probeExternalPort, isProbe, pingId } = packet.message;

        // if (peer && reflectionId) peer.reflectionId = reflectionId
        if (!port) {
            port = packet.message.port;
        }
        if (!address) {
            address = packet.message.address;
        }

        const message: any = {
            cacheSize: this.cache.size,
            uptime: this.uptime,
            responderPeerId: this.peerId,
            requesterPeerId,
            port,
            isProbe,
            address,
        };

        if (reflectionId) {
            message.reflectionId = reflectionId;
        }
        if (pingId) {
            message.pingId = pingId;
        }

        if (isReflection) {
            message.isReflection = true;
            message.port = port;
            message.address = address;
        } else {
            message.natType = this.natType;
        }

        if (isConnection && natType) {
            this._onDebug('<- CONNECTION (source=ping)');
            await this._onConnection(packet, requesterPeerId, port, address);

            message.isConnection = true;
            delete message.address;
            delete message.port;
            delete message.isProbe;
        }

        const { hash } = await this.cache.summarize('', this.cachePredicate());
        message.cacheSummaryHash = hash;

        const packetPong = new PacketPong({ message });
        const buf = await Packet.encode(packetPong);

        this.send(buf, packetPong, port, address);

        if (probeExternalPort) {
            message.port = probeExternalPort;
            const packetPong = new PacketPong({ message });
            const buf = await Packet.encode(packetPong);
            this.send(
                buf,
                packetPong,
                probeExternalPort,
                address,
                this.probeSocket,
            );
        }
    }

    /**
     * Received a Pong Packet
     */
    async _onPong(packet, port, address, _data) {
        this.metrics.i[packet.type]++;

        this.lastUpdate = Date.now();

        const { reflectionId, pingId, isReflection, responderPeerId } =
            packet.message;

        if (responderPeerId === this.peerId) {
            return;
        } // from self?

        this._onDebug(
            `<- PONG (from=${address}:${port}, hash=${packet.message.cacheSummaryHash}, isConnection=${!!packet.message.isConnection})`,
        );
        const peer = this.peers.get(responderPeerId);
        if (!peer) {
            return;
        }

        const pingSentTimestamp = this.pendingPings.get(pingId);
        if (pingSentTimestamp) {
            const rtt = Date.now() - pingSentTimestamp;
            peer.rtt.unshift(rtt);
            peer.rtt.splice(5);
            this.pendingPings.delete(pingId);
        }

        if (packet.message.isConnection) {
            if (pingId) {
                peer.pingId = pingId;
            }
            this._onDebug('<- CONNECTION (source=pong)');
            await this._onConnection(packet, responderPeerId, port, address);
            return;
        }

        if (isReflection && !this.indexed) {
            if (reflectionId !== this.reflectionId) {
                return;
            }

            clearTimeout(this.reflectionTimeout);

            if (!this.reflectionFirstResponder) {
                this.reflectionFirstResponder = {
                    port,
                    address,
                    responderPeerId,
                    reflectionId,
                    packet,
                };
                this._onDebug(
                    '<- NAT REFLECT - STAGE2: FIRST RESPONSE',
                    port,
                    address,
                    this.reflectionId,
                );
                this.reflectionFirstResponderTimeout = setTimeout(() => {
                    this.reflectionStage = 0;
                    this.lastUpdate = 0;
                    this.reflectionId = null;
                    this._onDebug(
                        '<- NAT REFLECT FAILED TO ACQUIRE SECOND RESPONSE',
                        this.reflectionId,
                    );
                    this.requestReflection().catch((err) =>
                        console.error('req-reflection-err', err),
                    );
                }, PROBE_WAIT);
            } else {
                clearTimeout(this.reflectionFirstResponderTimeout);
                this._onDebug(
                    '<- NAT REFLECT - STAGE2: SECOND RESPONSE',
                    port,
                    address,
                    this.reflectionId,
                );
                if (packet.message.address !== this.address) {
                    return;
                }

                this.nextNatType |=
                    packet.message.port ===
                    this.reflectionFirstResponder.packet.message.port
                        ? NAT.MAPPING_ENDPOINT_INDEPENDENT
                        : NAT.MAPPING_ENDPOINT_DEPENDENT;

                this._onDebug(
                    this.peerId,
                    `++ NAT REFLECT - STATE UPDATE (natType=${this.natType}, nextType=${this.nextNatType})`,
                    packet.message.port,
                    this.reflectionFirstResponder.packet.message.port,
                );

                // wait PROBE_WAIT milliseconds for zero or more probe responses to arrive.
                setTimeout(async () => {
                    // build the NAT type by combining information about the firewall with
                    // information about the endpoint independence
                    let natType = this.nextNatType;

                    // in the case where we recieved zero probe responses, we assume the firewall
                    // is of the hardest type 'FIREWALL_ALLOW_KNOWN_IP_AND_PORT'.
                    if (!NAT.isFirewallDefined(natType)) {
                        natType |= NAT.FIREWALL_ALLOW_KNOWN_IP_AND_PORT;
                    }

                    // if ((natType & NAT.MAPPING_ENDPOINT_DEPENDENT) === 1) natType = NAT.ENDPOINT_RESTRICTED

                    if (NAT.isValid(natType)) {
                        // const oldType = this.natType
                        this.natType = natType;
                        this.reflectionId = null;
                        this.reflectionStage = 0;

                        // if (natType !== oldType) {
                        // alert all connected peers of our new NAT type
                        for (const [_, peer] of this.peers) {
                            peer.lastRequest = Date.now();

                            this._onDebug(
                                `-> PING (to=${peer.address}:${peer.port}, peer-id=${peer.peerId.slice(0, 8)}, is-connection=true)`,
                            );

                            await this.ping(peer, false, {
                                message: {
                                    requesterPeerId: this.peerId,
                                    natType: this.natType,
                                    cacheSize: this.cache.size,
                                    isConnection: true,
                                },
                            });
                        }

                        setTimeout(() => this._mainLoop(Date.now()), 1024);

                        this._onDebug(
                            `++ NAT (type=${NAT.toString(this.natType)})`,
                        );
                        await this.sendUnpublished();

                        if (this.onReady) {
                            this.onReady(await this.getInfo());
                        }
                    }

                    this.reflectionId = null;
                    this.reflectionFirstResponder = null;
                }, PROBE_WAIT);
            }

            this.address = packet.message.address;
            this.port = packet.message.port;
            this._onDebug(
                `++ NAT UPDATE STATE (address=${this.address}, port=${this.port})`,
            );
        }
    }

    /**
     * Received an Intro Packet
     */
    async _onIntro(packet, port, address, _, opts = { attempts: 0 }) {
        this.metrics.i[packet.type]++;
        if (this.closing) {
            return;
        }

        const pid = packet.packetId.toString('hex');
        // the packet needs to be gated, but should allow for attempt
        // recursion so that the fallback can still be selected.
        if (this.gate.has(pid) && opts.attempts === 0) {
            return;
        }
        this.gate.set(pid, 1);

        const ts =
            packet.usr1.length && Number(Buffer.from(packet.usr1).toString());

        if (packet.hops >= this.maxHops) {
            return;
        }
        if (!isNaN(ts) && ts + this.keepalive * 2 < Date.now()) {
            return;
        }
        if (packet.message.requesterPeerId === this.peerId) {
            return;
        } // intro to myself?
        if (packet.message.responderPeerId === this.peerId) {
            return;
        } // intro from myself?

        // this is the peer that is being introduced to the new peers
        const peerId = packet.message.requesterPeerId;
        const peerPort = packet.message.port;
        const peerAddress = packet.message.address;
        const natType = packet.message.natType;
        const { clusterId, subclusterId, clock } = packet;

        let peer = this.peers.get(peerId);
        if (peer) {
            // we know this peer...
            if (peer.connected && peer.proxies.size === 0) {
                return;
            }
            if (clock > 0 && clock < peer.clock) {
                return;
            }
        } else {
            peer = new RemotePeer({
                peerId,
                natType,
                port: peerPort,
                address: peerAddress,
                clock,
                clusterId,
                localPeer: this,
                indexed: false,
            });
        }
        peer.clock = clock;

        const proxyCandidate = this.peers.get(packet.message.responderPeerId);

        if (opts.attempts >= 2) {
            this._onDebug('<- CONNECTION (source=intro)');
            await this._onConnection(
                packet,
                peer.peerId,
                peerPort,
                peerAddress,
                proxyCandidate,
            );
            if (proxyCandidate) {
                this._onDebug('++ INTRO FALLBACK PROXY STRATEGY');
            }
            return false;
        }

        // already introduced in the laste minute, just drop the packet
        if (
            opts.attempts === 0 &&
            this.gate.has(peerId + peerAddress + peerPort)
        ) {
            return;
        }
        this.gate.set(peerId + peerAddress + peerPort, 2);

        // a mutex per inbound peer to ensure that it's not connecting concurrently,
        // the check of the attempts ensures its allowed to recurse before failing so
        // it can still fall back
        const mutexKey = [
            'CONN',
            peer.peerId,
            packet.message.responderPeerId,
        ].join(':');
        if (this.gate.has(mutexKey) && opts.attempts === 0) {
            return;
        }
        this.gate.set(mutexKey, 1);

        const cid = clusterId.toString('base64');
        const scid = subclusterId.toString('base64');

        this._onDebug(
            '<- INTRO (' +
                `isRendezvous=${packet.message.isRendezvous}, ` +
                `from=${address}:${port}, ` +
                `to=${packet.message.address}:${packet.message.port}, ` +
                `clusterId=${cid.slice(0, 6)}, ` +
                `subclusterId=${scid.slice(0, 6)}` +
                ')',
        );

        const pingId = Buffer.from(randomBytes(6))
            .toString('hex')
            .padStart(12, '0');
        const { hash } = await this.cache.summarize('', this.cachePredicate());

        const props = {
            clusterId,
            subclusterId,
            message: {
                natType: this.natType,
                isConnection: true,
                cacheSummaryHash: hash,
                pingId: packet.message.pingId,
                requesterPeerId: this.peerId,
            },
        };

        const strategy = NAT.connectionStrategy(
            this.natType,
            packet.message.natType,
        );

        setTimeout(() => {
            if (this.peers.get(peer.peerId)) {
                this._onDebug(
                    `<- TIMEOUT INTRO FOR PEER WE KNOW ABOUT ... should we abort here?`,
                );
                // return;
            }
            opts.attempts = 2;
            this._onIntro(packet, port, address, _, opts).catch((err) =>
                console.error('_onIntro', err),
            );
        }, 1024 * 2);

        if (packet.message.isRendezvous) {
            this._onDebug(
                `<- JOIN INTRO FROM RENDEZVOUS (to=${packet.message.address}:${packet.message.port}, dest=${packet.message.requesterPeerId.slice(0, 6)}, via=${address}:${port}, strategy=${NAT.toStringStrategy(strategy)})`,
            );
        }

        this._onDebug(
            `++ JOIN INTRO (strategy=${NAT.toStringStrategy(strategy)}, from=${this.address}:${this.port} [${NAT.toString(this.natType)}], to=${packet.message.address}:${packet.message.port} [${NAT.toString(packet.message.natType)}])`,
        );

        if (strategy === NAT.STRATEGY_TRAVERSAL_CONNECT) {
            this._onDebug(
                `## NAT CONNECT (from=${this.address}:${this.port}, to=${peerAddress}:${peerPort}, pingId=${pingId})`,
            );

            let i = 0;
            if (!this.socketPool) {
                this.socketPool = Array.from({ length: 256 }, (_, _index) => {
                    return this.createSocket({ type: 'udp4' }).unref();
                });
            }

            // A probes 1 target port on B from 1024 source ports
            //   (this is 1.59% of the search clusterId)
            // B probes 256 target ports on A from 1 source port
            //   (this is 0.40% of the search clusterId)
            //
            // Probability of successful traversal: 98.35%
            //
            const interval = setInterval(async () => {
                // send messages until we receive a message from them. giveup after sending ±1024
                // packets and fall back to using the peer that sent this as the initial proxy.
                if (i++ >= 1024) {
                    clearInterval(interval);

                    opts.attempts++;
                    await this._onIntro(packet, port, address, _, opts);
                    return false;
                }

                const p = {
                    clusterId,
                    subclusterId,
                    message: {
                        requesterPeerId: this.peerId,
                        cacheSummaryHash: hash,
                        natType: this.natType,
                        uptime: this.uptime,
                        isConnection: true,
                        timestamp: Date.now(),
                        pingId,
                    },
                };

                const data = await Packet.encode(new PacketPing(p));

                const rand = () => Math.random() - 0.5;
                const pooledSocket = (this.socketPool || [])
                    .sort(rand)
                    .find((s: any) => !s.active);
                if (!pooledSocket) {
                    console.warn('no pooled socket available');
                    return;
                } // TODO recover from exausted socket pool

                // mark socket as active & deactivate it after timeout
                (pooledSocket as any).active = true;
                (pooledSocket as any).reclaim = setTimeout(() => {
                    (pooledSocket as any).active = false;
                    pooledSocket.removeAllListeners();
                }, 1024);

                pooledSocket.on('message', async (msg, rinfo) => {
                    // if (rinfo.port !== peerPort || rinfo.address !== peerAddress) return

                    // cancel scheduled events
                    clearInterval(interval);
                    clearTimeout((pooledSocket as any).reclaim);

                    // remove any events currently bound on the socket
                    pooledSocket.removeAllListeners();
                    pooledSocket.on('message', (msg, rinfo) => {
                        this._onMessage(msg, rinfo).catch((err) =>
                            console.error('on-message-err', err),
                        );
                    });

                    this._onDebug('<- CONNECTION (source=intro)');
                    await this._onConnection(
                        packet,
                        peer.peerId,
                        rinfo.port,
                        rinfo.address,
                        undefined,
                        pooledSocket,
                    );

                    const p = {
                        clusterId,
                        subclusterId,
                        clock: this.clock,
                        message: {
                            requesterPeerId: this.peerId,
                            natType: this.natType,
                            isConnection: true,
                        },
                    };

                    const data = await Packet.encode(new PacketPing(p));

                    pooledSocket
                        .send(data as any, rinfo.port, rinfo.address)
                        .catch((err) => console.error('send-error', err));

                    // create a new socket to replace it in the pool
                    const pool = this.socketPool || [];
                    const oldIndex = pool.findIndex((s) => s === pooledSocket);
                    pool[oldIndex] = this.createSocket({
                        type: 'udp4',
                    }).unref();
                    this.socketPool = pool;

                    this._onMessage(msg, rinfo).catch((err) =>
                        console.error('_onMessage', err),
                    );
                });

                try {
                    await pooledSocket.send(data as any, peerPort, peerAddress);
                } catch (err) {
                    console.error('STRATEGY_TRAVERSAL_CONNECT error', err);
                }
            }, 10);

            return;
        }

        if (strategy === NAT.STRATEGY_PROXY) {
            this._onDebug('<- CONNECTION (source=proxy)');
            await this._onConnection(
                packet,
                peer.peerId,
                peerPort,
                peerAddress,
                proxyCandidate,
            );
            this._onDebug('++ INTRO CHOSE PROXY STRATEGY');
        }

        if (strategy === NAT.STRATEGY_TRAVERSAL_OPEN) {
            console.log('XXX DEBUG: NAT STRATEGY_TRAVERSAL_OPEN DISABLED');
            return;
            // peer.opening = Date.now();

            // const portsCache = new Set<number>();

            // if (!this.bdpCache.length) {
            //     globalThis.bdpCache = this.bdpCache = Array.from(
            //         { length: 1024 },
            //         () => getRandomPort(portsCache),
            //     );
            // }

            // for (const port of this.bdpCache) {
            //     this.socket.send(
            //         Buffer.from([0x1]),
            //         port,
            //         packet.message.address,
            //     );
            // }

            // return;
        }

        if (strategy === NAT.STRATEGY_DIRECT_CONNECT) {
            this._onDebug('++ NAT STRATEGY_DIRECT_CONNECT');
        }

        if (strategy === NAT.STRATEGY_DEFER) {
            this._onDebug('++ NAT STRATEGY_DEFER');
        }

        return this.ping(peer, true, props);
    }

    /**
     * Received an Join Packet
     */
    async _onJoin(packet, port, address, _data) {
        this.metrics.i[packet.type]++;

        const pid = packet.packetId.toString('hex');
        if (packet.message.requesterPeerId === this.peerId) {
            return;
        } // from self?
        if (this.gate.has(pid)) {
            return;
        }
        if (packet.clusterId.length !== 32) {
            return;
        }

        this.lastUpdate = Date.now();

        const peerId = packet.message.requesterPeerId;
        const rendezvousDeadline = packet.message.rendezvousDeadline;
        const clusterId = packet.clusterId;
        const subclusterId = packet.subclusterId;
        const peerAddress = packet.message.address;
        const peerPort = packet.message.port;

        // a rendezvous isn't relevant if it's too old, just drop the packet
        if (rendezvousDeadline && rendezvousDeadline < Date.now()) {
            return;
        }

        // register peer's interest in the subcluster
        const cid: string = clusterId.toString('base64');
        const scid: string = subclusterId.toString('base64');
        let subs = this.peerMapping.get(peerId);
        if (!subs) {
            subs = new Set();
            this.peerMapping.set(peerId, subs);
        }
        subs.add(scid);

        this._onDebug(
            '<- JOIN (' +
                `peerId=${peerId.slice(0, 6)}, ` +
                `clock=${packet.clock}, ` +
                `hops=${packet.hops}, ` +
                `clusterId=${cid.slice(0, 6)}, ` +
                `subclusterId=${scid.slice(0, 6)}, ` +
                `address=${address}:${port})`,
        );

        //
        // This packet represents a peer who wants to join the network and is a
        // member of our cluster. The packet was replicated though the network
        // and contains the details about where the peer can be reached, in this
        // case we want to ping that peer so we can be introduced to them.
        //
        if (rendezvousDeadline && !this.indexed && this.cid === cid) {
            if (!packet.message.rendezvousRequesterPeerId) {
                const pid = packet.packetId.toString('hex');
                this.gate.set(pid, 2);

                // TODO it would tighten up the transition time between dropped peers
                // if we check strategy from (packet.message.natType, this.natType) and
                // make introductions that create more mutually known peers.
                this._onDebug(
                    `<- JOIN RENDEZVOUS RECV (dest=${packet.message.requesterPeerId?.slice(0, 6)}, to=${peerAddress}:${peerPort},  via=${packet.message.rendezvousAddress}:${packet.message.rendezvousPort})`,
                );

                const joinPacket = new PacketJoin({
                    clock: packet.clock,
                    subclusterId: packet.subclusterId,
                    clusterId: packet.clusterId,
                    message: {
                        requesterPeerId: this.peerId,
                        natType: this.natType,
                        address: this.address,
                        port: this.port,
                        rendezvousType: packet.message.natType,
                        rendezvousRequesterPeerId:
                            packet.message.requesterPeerId,
                    },
                });
                const data = await Packet.encode(joinPacket);

                this.send(
                    data,
                    joinPacket,
                    packet.message.rendezvousPort,
                    packet.message.rendezvousAddress,
                );

                this._onDebug(
                    `-> JOIN RENDEZVOUS SEND ( to=${packet.message.rendezvousAddress}:${packet.message.rendezvousPort})`,
                );
            }
        }

        const filter = (p) =>
            p.connected && // you can't intro peers who aren't connected
            p.peerId !== packet.message.requesterPeerId &&
            p.peerId !== packet.message.rendezvousRequesterPeerId &&
            !p.indexed;

        let peers = this.getPeers(packet, [{ port, address }], filter);

        //
        // A peer who belongs to the same cluster as the peer who's replicated
        // join was discovered, sent us a join that has a specification for who
        // they want to be introduced to.
        //
        if (
            packet.message.rendezvousRequesterPeerId &&
            this.peerId === packet.message.rendezvousPeerId
        ) {
            const peer = this.peers.get(
                packet.message.rendezvousRequesterPeerId,
            );
            if (!peer) {
                this._onDebug('<- INTRO FROM RENDEZVOUS FAILED', packet);
                return;
            }

            // peer.natType = packet.message.rendezvousType
            peers = [peer];

            this._onDebug(
                `<- JOIN EXECUTING RENDEZVOUS (from=${packet.message.address}:${packet.message.port}, to=${peer.address}:${peer.port})`,
            );
        }

        for (const peer of peers) {
            const message1 = {
                requesterPeerId: peer.peerId,
                responderPeerId: this.peerId,
                isRendezvous: !!packet.message.rendezvousPeerId,
                natType: peer.natType,
                address: peer.address,
                port: peer.port,
            };

            const message2 = {
                requesterPeerId: packet.message.requesterPeerId,
                responderPeerId: this.peerId,
                isRendezvous: !!packet.message.rendezvousPeerId,
                natType: packet.message.natType,
                address: packet.message.address,
                port: packet.message.port,
            };

            const opts = {
                hops: packet.hops + 1,
                clusterId,
                subclusterId,
                usr1: String(Date.now()),
            };

            const intro1Packet = new PacketIntro({
                ...opts,
                message: message1,
            });
            const intro2Packet = new PacketIntro({
                ...opts,
                message: message2,
            });
            const [intro1, intro2] = await Promise.all([
                Packet.encode(intro1Packet),
                Packet.encode(intro2Packet),
            ]);

            //
            // Send intro1 to the peer described in the message
            // Send intro2 to the peer in this loop
            //
            this._onDebug(
                `>> INTRO SEND (from=${peer.address}:${peer.port}, to=${packet.message.address}:${packet.message.port})`,
            );
            this._onDebug(
                `>> INTRO SEND (from=${packet.message.address}:${packet.message.port}, to=${peer.address}:${peer.port})`,
            );

            peer.lastRequest = Date.now();

            this.send(intro2, intro2Packet, peer.port, peer.address);
            this.send(
                intro1,
                intro1Packet,
                packet.message.port,
                packet.message.address,
            );

            this.gate.set(
                (Packet.decode(intro1) as any).packetId.toString('hex'),
                2,
            );
            this.gate.set(
                (Packet.decode(intro2) as any).packetId.toString('hex'),
                2,
            );
        }

        this.gate.set(packet.packetId.toString('hex'), 2);

        if (packet.hops >= this.maxHops) {
            return;
        }
        if (this.indexed && !packet.clusterId) {
            return;
        }

        if (
            packet.hops === 1 &&
            this.natType === NAT.UNRESTRICTED &&
            !packet.message.rendezvousDeadline
        ) {
            packet.message.rendezvousAddress = this.address;
            packet.message.rendezvousPort = this.port;
            packet.message.rendezvousType = this.natType;
            packet.message.rendezvousPeerId = this.peerId;
            packet.message.rendezvousDeadline = Date.now() + this.keepalive * 4;
        }

        this._onDebug(
            `-> JOIN RELAY (peerId=${peerId.slice(0, 6)}, from=${peerAddress}:${peerPort})`,
        );
        await this.mcast(packet, [
            { port, address },
            { port: peerPort, address: peerAddress },
        ]);

        if (packet.hops <= 1) {
            this._onDebug('<- CONNECTION (source=join)');
            await this._onConnection(
                packet,
                packet.message.requesterPeerId,
                port,
                address,
            );
        }
    }

    // another peer has told us to stop talking to them
    async _onNoRoute(packet: Packet, port: number, address: string, _data) {
        const targetPeerId = packet.usr1.toString('hex');
        const targetPeer = this.peers.get(targetPeerId);
        if (!targetPeer) {
            // don't know the target so moot
            return;
        }
        const proxyPeer = Array.from(this.peers.values()).find(
            (p) => p.address === address && p.port === port,
        );
        if (!proxyPeer) {
            // don't know the proxy so moot
            return;
        }
        // remove the proxy from the target's list of proxies
        // peer pruning should take care of the rest
        targetPeer.proxies.delete(proxyPeer.peerId);
        this._onDebug(
            `<- REMOVED PROXY PEER (dest=${targetPeer.peerId.slice(0, 6)}, proxy=${proxyPeer.peerId.slice(0, 6)})`,
        );
    }

    /**
     * Received an Publish Packet
     */
    async _onPublish(packet, port, address, _data, isProxied: boolean) {
        this.metrics.i[packet.type]++;

        // only cache if this packet if i am part of this subclusterId
        // const cluster = this.clusters.get(packet.clusterId)
        // if (cluster && cluster[packet.subclusterId]) {

        const pid = packet.packetId.toString('hex');
        const cid = packet.clusterId.toString('base64');
        const scid = packet.subclusterId.toString('base64');

        if (cid !== this.cid) {
            this.metrics.i.DROPPED++;
            this._onDebug(
                `<- DROP IGNORED CID (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
            );
            return;
        }

        // if (!this.subclusters.has(scid)) {
        //     this.metrics.i.DROPPED++;
        //     this._onDebug(
        //         `<- DROP IGNORED SCID (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
        //     );
        //     return;
        // }

        if (this.gate.has(pid)) {
            this.metrics.i.DROPPED++;
            // this._onDebug(
            //     `<- DROP GATE (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
            // );
            return;
        }
        this.gate.set(pid, 6);

        // this message might not be for us
        if (isProxied) {
            const recipientId = packet.usr3.toString('hex');
            if (!recipientId) {
                this.metrics.i.DROPPED++;
                this._onDebug(
                    `<- DROP PROXIED NO RECIPIENT (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
                );
                return;
            }

            const recipient = this.peers.get(recipientId);
            if (!recipient) {
                this.metrics.i.DROPPED++;
                this._onDebug(
                    `<- DROP PROXIED NO PATH (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
                );
                // tell them to stop bothering us as we can't help proxy this
                const noRoutePacket = new PacketNoRoute({
                    usr1: packet.usr3,
                });
                this.send(
                    await Packet.encode(noRoutePacket),
                    noRoutePacket,
                    port,
                    address,
                );
                return;
            }
            if (recipient.address === address && recipient.port === port) {
                this.metrics.i.DROPPED++;
                this._onDebug(
                    `<- DROP PROXIED LOOP (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
                );
                return;
            }
            packet.type = 5; // convert to a normal publish and send it on
            this._onDebug(
                `>> PROXY PASS (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
            );
            this.send(
                await Packet.encode(packet),
                packet,
                recipient.port,
                recipient.address,
            );
            return;
        }

        if (this.cache.has(pid)) {
            this.metrics.i.DROPPED++;
            this._onDebug(
                `<- DROP CACHED (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
            );
            return;
        }
        await this.cacheInsert(packet);

        // const ignorelist = [{ address, port }];

        if (!this.indexed && this.encryption.has(scid)) {
            const p = packet;

            if (p.index > -1) {
                this._onDebug(
                    `<- DROP REQUIRES COMPOSE (packetId=${pid.slice(0, 6)}, index=${p.index}, from=${address}:${port})`,
                );
                return;
                // this._onDebug(
                //     `<- PUBLISH REQUIRES COMPOSE (packetId=${pid.slice(0, 6)}, index=${p.index}, from=${address}:${port})`,
                // );

                // p = await this.cache.compose(p);
                // if (p?.isComposed) {
                //     this._onDebug(
                //         `<- PUBLISH COMPOSED (packetId=${pid.slice(0, 6)}, from=${address}:${port})`,
                //     );
                // }
            }

            if (p?.index === -1) {
                this._onDebug(
                    `<- PUBLISH (packetId=${pid.slice(0, 6)}, from=${address}:${port})`,
                );
                await this.processSubclusterPacket(p);
            }
        } else {
            // TODO: what to do here?, allow some hops?
            this._onDebug(
                `<- PUBLISH IGNORE (packetId=${pid.slice(0, 6)}, index=${packet.index}, from=${address}:${port})`,
            );
        }

        if (packet.hops >= this.maxHops) {
            return;
        }
        // await this.mcast(packet, ignorelist);

        // }
    }

    private async processSubclusterPacket(b: Buffer) {
        const packet = Packet.from(b);
        if (!packet) {
            console.warn('ignoring invalid packet');
            return;
        }
        if (packet.clusterId.compare(this.clusterId) !== 0) {
            console.warn('ignoring wrong cluster');
            return;
        }
        const scid = packet.subclusterId.toString('base64');
        for (const [_, subcluster] of this.subclusters) {
            if (subcluster.scid !== scid) {
                continue;
            }
            await subcluster.onPacket(packet);
        }
    }

    /**
     * Received any packet on the probe port to determine the firewall:
     * are you port restricted, host restricted, or unrestricted.
     */
    _onProbeMessage(data, { port, address }) {
        clearTimeout(this.probeReflectionTimeout);

        const packet: any = Packet.decode(data);
        if (!packet || packet.version !== VERSION) {
            return;
        }
        if (packet?.type !== PacketPong.type) {
            return;
        }

        const pid = packet.packetId.toString('hex');
        if (this.gate.has(pid)) {
            return;
        }
        this.gate.set(pid, 1);

        const { reflectionId } = packet.message;
        this._onDebug(
            `<- NAT PROBE (from=${address}:${port}, stage=${this.reflectionStage}, id=${reflectionId})`,
        );

        if (this.reflectionId !== reflectionId || !this.reflectionId) {
            return;
        }

        // reflection stage is encoded in the last hex char of the reflectionId, or 0 if not available.
        // const reflectionStage = reflectionId ? parseInt(reflectionId.slice(-1), 16) : 0

        if (this.reflectionStage === 1) {
            this._onDebug(
                '<- NAT REFLECT - STAGE1: probe received',
                reflectionId,
            );
            if (!packet.message?.port) {
                return;
            } // message must include a port number

            // successfully discovered the probe socket external port
            this.probeExternalPort = packet.message.port;

            // move to next reflection stage
            this.reflectionStage = 1;
            this.reflectionId = null;
            return this.requestReflection();
        }

        if (this.reflectionStage === 2) {
            this._onDebug(
                '<- NAT REFLECT - STAGE2: probe received',
                reflectionId,
            );

            // if we have previously sent an outbount message to this peer on the probe port
            // then our NAT will have a mapping for their IP, but not their IP+Port.
            if (!NAT.isFirewallDefined(this.nextNatType)) {
                this.nextNatType |= NAT.FIREWALL_ALLOW_KNOWN_IP;
                this._onDebug(
                    `<> PROBE STATUS: NAT.FIREWALL_ALLOW_KNOWN_IP (${packet.message.port} -> ${this.nextNatType})`,
                );
            } else {
                this.nextNatType |= NAT.FIREWALL_ALLOW_ANY;
                this._onDebug(
                    `<> PROBE STATUS: NAT.FIREWALL_ALLOW_ANY (${packet.message.port} -> ${this.nextNatType})`,
                );
            }

            // wait for all messages to arrive
        }
    }

    /**
     * When a packet is received it is decoded, the packet contains the type
     * of the message. Based on the message type it is routed to a function.
     * like WebSockets, don't answer queries unless we know its another SRP peer.
     */
    async _onMessage(
        data: Buffer | Uint8Array,
        { port, address }: { port: number; address: string },
    ) {
        const peer = Array.from(this.peers.values()).find(
            (p) => p.address === address && p.port === port,
        );
        if (peer) {
            peer.lastSeen = Date.now();
        }

        const packet = Packet.decode(Buffer.from(data));
        if (!packet) {
            console.log(`XXX invalid packet failed decode`, data);
            return;
        }
        if (packet.version !== VERSION) {
            console.log(
                `XXX invalid packet version want=${VERSION} got=${packet.version}`,
            );
            return;
        }

        const scid = Buffer.from(packet.subclusterId).toString('base64');

        // this._onDebug(
        //     `<- RECV MESSAGE type=${packet.type} from=${address}:${port}`,
        // );
        if (!this.limitExempt) {
            const subcluster = this.subclusters.get(scid);
            if (
                rateLimit(
                    this.rates,
                    packet.type,
                    port,
                    address,
                    subcluster?.rateLimit,
                )
            ) {
                this._onDebug(
                    `XX RATE LIMIT HIT (from=${address}, type=${packet.type})`,
                );
                this.metrics.i.DROPPED++;
                return;
            }
            if (this.onLimit && !this.onLimit(packet, port, address)) {
                return;
            }
        }

        switch (packet.type) {
            case PacketPing.type:
                return this._onPing(packet, port, address, data);
            case PacketPong.type:
                return this._onPong(packet, port, address, data);
        }

        if (!this.natType && !this.indexed) {
            return;
        }

        switch (packet.type) {
            case PacketIntro.type:
                return this._onIntro(packet, port, address, data);
            case PacketJoin.type:
                return this._onJoin(packet, port, address, data);
            case PacketPublish.type:
                return this._onPublish(packet, port, address, data, false);
            case PacketPublishProxied.type:
                return this._onPublish(packet, port, address, data, true);
            case PacketNoRoute.type:
                return this._onNoRoute(packet, port, address, data);
        }
    }

    /**
     * Test a peerID is valid
     */
    static isValidPeerId(pid: string): boolean {
        return typeof pid === 'string' && PEERID_REGEX.test(pid);
    }

    /**
     * Test a reflectionID is valid
     */
    static isValidReflectionId(rid: string) {
        return typeof rid === 'string' && /^[A-Fa-f0-9]{12}$/.test(rid);
    }

    /**
     * Test a pingID is valid
     */
    static isValidPingId(pid: string) {
        return typeof pid === 'string' && /^[A-Fa-f0-9]{12,13}$/.test(pid);

        // the above line is provided for backwards compatibility due to a breaking change introduced in:
        // https://github.com/socketsupply/latica/commit/f02db9e37ad3ed476cebc7f6269738f4e0c9acaf
        // once all peers have received that commit we can enforce an exact length of 12 hex chars:
        // return typeof pid === 'string' && /^[A-Fa-f0-9]{12}$/.test(pid)
    }

    /**
     * Returns the online status of the browser, else true.
     *
     * note: globalThis.navigator was added to node in v22.
     */
    static onLine() {
        return globalThis.navigator?.onLine !== false;
    }
}

export default Peer;
