/**
 * @module network
 * @status Experimental
 *
 * This module provides primitives for creating a p2p network.
 */
import { Buffer } from 'socket:buffer';
import { randomBytes, sodium } from 'socket:crypto';
import { isBufferLike } from 'socket:util';
import { RemotePeer } from './RemotePeer';
import { Cache } from './cache';
import { Encryption } from './encryption';
import * as NAT from './nat';
import {
    Packet,
    PacketIntro,
    PacketJoin,
    PacketPing,
    PacketPong,
    PacketPublish,
    PacketSync,
    VERSION,
    sha256,
} from './packets';

export { Packet, sha256, Cache, Encryption, NAT };

/**
 * Retry delay in milliseconds for ping.
 * @type {number}
 */
export const PING_RETRY = 500;

/**
 * Probe wait timeout in milliseconds.
 * @type {number}
 */
export const PROBE_WAIT = 512;

/**
 * Default keep alive timeout.
 * @type {number}
 */
export const DEFAULT_KEEP_ALIVE = 30_000;

/**
 * Default rate limit threshold in milliseconds.
 * @type {number}
 */
export const DEFAULT_RATE_LIMIT_THRESHOLD = 8000;

const PRIV_PORTS = 1024;
const MAX_PORTS = 65535 - PRIV_PORTS;
const MAX_BANDWIDTH = 1024 * 32;

const PEERID_REGEX = /^([A-Fa-f0-9]{2}){32}$/;

/**
 * Port generator factory function.
 * @param {object} ports - the cache to use (a set)
 * @param {number?} p - initial port
 * @return {number}
 */
export const getRandomPort = (ports = new Set(), p?) => {
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
 *
 * @param {Map} rates
 * @param {number} type
 * @param {number} port
 * @param {string} address
 * @return {boolean}
 */
export function rateLimit(rates, type, port, address, subclusterIdQuota) {
    const R = isReplicatable(type);
    const key = (R ? 'R' : 'C') + ':' + address + ':' + port;
    const quota = subclusterIdQuota || (R ? 1024 : 1024 * 1024);
    const time = Math.floor(Date.now() / 60000);
    const rate = rates.get(key) || { time, quota, used: 0 };

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
    if (rate.used >= rate.quota) {
        return true;
    }
}

export class Peer {
    port = null;
    address = null;
    natType = NAT.UNKNOWN;
    nextNatType = NAT.UNKNOWN;
    clusters: Record<string, any> = {};
    syncs = {};
    reflectionId = null;
    reflectionTimeout: any = null;
    probeReflectionTimeout: any = null;
    reflectionStage = 0;
    reflectionRetry = 1;
    reflectionFirstResponder: any = null;
    reflectionFirstResponderTimeout: any = null;
    peerId = '';
    isListening = false;
    ctime = Date.now();
    lastUpdate = 0;
    lastSync = 0;
    closing = false;
    clock = 0;
    unpublished = {};
    cache: Cache;
    uptime = 0;
    maxHops = 16;
    bdpCache: number[] = [];
    indexed: boolean = false;
    clusterId?: Uint8Array;
    sendTimeout?: any;
    mainLoopTimer?: any;

    dgram: typeof import('node:dgram');
    config: any;

    onListening?: () => void;
    onDelete?: (packet: Packet) => void;

    sendQueue: any[] = [];
    // firewall = null;
    rates = new Map();
    streamBuffer = new Map();
    gate = new Map();
    returnRoutes = new Map();
    encryption: Encryption;

    socket: import('node:dgram').Socket;
    socketPool?: import('node:dgram').Socket[];
    probeSocket: import('node:dgram').Socket;

    _onError: (err: Error) => void;

    onDebug?: (peerId: string, ...args: any[]) => void;
    onInterval?: () => void;
    onMulticast?: (packet: Packet) => void;
    onState?: () => void;
    onSend?: (packet: Packet, port: number, address: string) => void;
    onError?: (err: Error) => void;
    onDisconnection?: (peer: RemotePeer) => void;
    onConnecting?: (status: { code: number; status: string }) => void;
    onReady?: (info: object) => void;
    onProbeMessage?: (msg: Buffer, rinfo: any) => void;
    onMessage?: (msg: Buffer, rinfo: any) => void;
    onProbe?: (...args: any[]) => void;
    onPacket?: (...args: any[]) => void;
    onSyncStart?: (packet: PacketSync, port: number, address: string) => void;
    onSyncFinished?: (...args: any[]) => void;
    onSync?: (...args: any[]) => void;
    onData?: (...args: any[]) => void;
    onLimit?: (...args: any[]) => boolean | undefined;
    onStream?: (...args: any[]) => void;
    onIntro?: (...args: any[]) => void;
    onNat?: (...args: any[]) => void;
    onAnswer?: (...args: any[]) => void;
    onQuery?: (...args: any[]) => void;
    onClose?: () => void;
    onJoin?: (...args: any[]) => void;
    onConnection?: (...args: any[]) => void;

    metrics = {
        i: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, DROPPED: 0 },
        o: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 },
    };

    peers: RemotePeer[] = JSON.parse(
        /* snapshot_start=1691579150299, filter=easy,static */ `
    [{"address":"44.213.42.133","port":10885,"peerId":"4825fe0475c44bc0222e76c5fa7cf4759cd5ef8c66258c039653f06d329a9af5","natType":31,"indexed":true},{"address":"107.20.123.15","port":31503,"peerId":"2de8ac51f820a5b9dc8a3d2c0f27ccc6e12a418c9674272a10daaa609eab0b41","natType":31,"indexed":true},{"address":"54.227.171.107","port":43883,"peerId":"7aa3d21ceb527533489af3888ea6d73d26771f30419578e85fba197b15b3d18d","natType":31,"indexed":true},{"address":"54.157.134.116","port":34420,"peerId":"1d2315f6f16e5f560b75fbfaf274cad28c12eb54bb921f32cf93087d926f05a9","natType":31,"indexed":true},{"address":"184.169.205.9","port":52489,"peerId":"db00d46e23d99befe42beb32da65ac3343a1579da32c3f6f89f707d5f71bb052","natType":31,"indexed":true},{"address":"35.158.123.13","port":31501,"peerId":"4ba1d23266a2d2833a3275c1d6e6f7ce4b8657e2f1b8be11f6caf53d0955db88","natType":31,"indexed":true},{"address":"3.68.89.3","port":22787,"peerId":"448b083bd8a495ce684d5837359ce69d0ff8a5a844efe18583ab000c99d3a0ff","natType":31,"indexed":true},{"address":"3.76.100.161","port":25761,"peerId":"07bffa90d89bf74e06ff7f83938b90acb1a1c5ce718d1f07854c48c6c12cee49","natType":31,"indexed":true},{"address":"3.70.241.230","port":61926,"peerId":"1d7ee8d965794ee286ac425d060bab27698a1de92986dc6f4028300895c6aa5c","natType":31,"indexed":true},{"address":"3.70.160.181","port":41141,"peerId":"707c07171ac9371b2f1de23e78dad15d29b56d47abed5e5a187944ed55fc8483","natType":31,"indexed":true},{"address":"3.122.250.236","port":64236,"peerId":"a830615090d5cdc3698559764e853965a0d27baad0e3757568e6c7362bc6a12a","natType":31,"indexed":true},{"address":"18.130.98.23","port":25111,"peerId":"ba483c1477ab7a99de2d9b60358d9641ff6a6dc6ef4e3d3e1fc069b19ac89da4","natType":31,"indexed":true},{"address":"13.42.10.247","port":2807,"peerId":"032b79de5b4581ee39c6d15b12908171229a8eb1017cf68fd356af6bbbc21892","natType":31,"indexed":true},{"address":"18.229.140.216","port":36056,"peerId":"73d726c04c05fb3a8a5382e7a4d7af41b4e1661aadf9020545f23781fefe3527","natType":31,"indexed":true}]
  ` /* snapshot_end=1691579150299 */,
    ).map(
        (/** @type {object} */ o) =>
            new RemotePeer({ ...o, indexed: true }, this),
    );

    constructor(persistedState: any, dgram: typeof import('node:dgram')) {
        if (!dgram) {
            throw new Error(
                'dgram implementation required in constructor as second argument',
            );
        }

        this.dgram = dgram;

        const config = persistedState?.config ?? persistedState ?? {};

        this.encryption = new Encryption();

        if (!config.peerId) {
            throw new Error('constructor expected .peerId');
        }
        if (!Peer.isValidPeerId(config.peerId)) {
            throw new Error(`invalid .peerId (${config.peerId})`);
        }

        //
        // The purpose of this.config is to seperate transitioned state from initial state.
        //
        this.config = {
            // TODO(@heapwolf): Object.freeze this maybe
            keepalive: DEFAULT_KEEP_ALIVE,
            ...config,
        };

        let cacheData;

        if (persistedState?.data?.length > 0) {
            cacheData = new Map(persistedState.data);
        }

        this.cache = new Cache(cacheData, config.siblingResolver);
        this.cache.onEjected = (p) => this.mcast(p);

        this.unpublished = persistedState?.unpublished || {};
        this._onError = (err) => this.onError && this.onError(err);

        Object.assign(this, config);

        if (!this.indexed && !this.clusterId) {
            throw new Error('constructor expected .clusterId');
        }
        if (typeof this.peerId !== 'string') {
            throw new Error('peerId should be of type string');
        }

        this.port = config.port || null;
        this.natType = config.natType || null;
        this.address = config.address || null;

        this.socket = this.dgram.createSocket({ type: 'udp4' });
        this.probeSocket = this.dgram.createSocket({ type: 'udp4' }).unref();

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

    _onDebug(...args) {
        if (this.onDebug) {
            this.onDebug(this.peerId, ...args);
        }
    }

    /**
     * A method that encapsulates the listing procedure
     * @return {undefined}
     * @ignore
     */
    async _listen() {
        await sodium.ready;

        this.socket.removeAllListeners();
        this.probeSocket.removeAllListeners();

        this.socket.on('message', (...args) => this._onMessage(...args));
        this.socket.on('error', (...args) => this._onError(...args));
        this.probeSocket.on('message', (...args) =>
            this._onProbeMessage(...args),
        );
        this.probeSocket.on('error', (...args) => this._onError(...args));

        this.socket.setMaxListeners(2048);
        this.probeSocket.setMaxListeners(2048);

        const listening = Promise.all([
            new Promise((resolve) => this.socket.on('listening', resolve)),
            new Promise((resolve) => this.probeSocket.on('listening', resolve)),
        ]);

        this.socket.bind(this.config.port || 0);
        this.probeSocket.bind(this.config.probeInternalPort || 0);

        await listening;

        this.config.port = this.socket.address().port;
        this.config.probeInternalPort = this.probeSocket.address().port;

        if (this.onListening) {
            this.onListening();
        }
        this.isListening = true;

        this._onDebug(
            `++ INIT (config.internalPort=${this.config.port}, config.probeInternalPort=${this.config.probeInternalPort})`,
        );
    }

    /*
     * This method will bind the sockets, begin pinging known peers, and start
     * the main program loop.
     * @return {Any}
     */
    async init() {
        if (!this.isListening) {
            await this._listen();
        }

        await this._mainLoop(Date.now());
        this.mainLoopTimer = setInterval(
            (ts) => this._mainLoop(ts),
            this.config.keepalive,
        );

        if (this.indexed && this.onReady) {
            return this.onReady(await this.getInfo());
        }
    }

    /**
     * Continuously evaluate the state of the peer and its network
     * @return {undefined}
     * @ignore
     */
    async _mainLoop(ts) {
        if (this.closing) {
            return clearInterval(this.mainLoopTimer);
        }

        if (!Peer.onLine()) {
            if (this.onConnecting) {
                this.onConnecting({ code: -2, status: 'Offline' });
            }
            return true;
        }

        if (!this.reflectionId) {
            await this.requestReflection();
        }
        if (this.onInterval) {
            this.onInterval();
        }

        this.uptime += this.config.keepalive;

        // heartbeat
        for (const [, peer] of Object.entries(this.peers)) {
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
            const p: any = Packet.from(packet);
            if (!p) {
                continue;
            }
            if (!p.timestamp) {
                p.timestamp = ts;
            }
            const clusterId = p.clusterId.toString('base64');

            const mult = this.clusters[clusterId] ? 2 : 1;
            const ttl = p.ttl < Packet.ttl ? p.ttl : Packet.ttl * mult;
            const deadline = p.timestamp + ttl;

            if (deadline <= ts) {
                if (p.hops < this.maxHops) {
                    await this.mcast(p);
                }
                this.cache.delete(k);
                this._onDebug('-- DELETE', k, this.cache.size);
                if (this.onDelete) {
                    this.onDelete(p);
                }
            }
        }

        for (const [k, v] of this.gate.entries()) {
            if (v === 1) {
                this.gate.delete(k);
            } else {
                this.gate.set(k, v - 1);
            }
        }

        for (const [k, v] of this.returnRoutes.entries()) {
            if (v === 1) {
                this.returnRoutes.delete(k);
            } else {
                this.returnRoutes.set(k, v - 1);
            }
        }

        // prune peer list
        for (const [i, peer] of Object.entries(this.peers)) {
            if (peer.indexed) {
                continue;
            }
            const expired =
                peer.lastUpdate + this.config.keepalive < Date.now();
            if (expired) {
                // || !NAT.isValid(peer.natType)) {
                const p = this.peers.splice(Number(i), 1);
                if (this.onDisconnection) {
                    this.onDisconnection(p[0]);
                }
                continue;
            }
        }

        // if this peer has previously tried to join any clusters, multicast a
        // join messages for each into the network so we are always searching.
        for (const cluster of Object.values(this.clusters)) {
            for (const subcluster of Object.values(cluster)) {
                await this.join(
                    (subcluster as any).sharedKey,
                    subcluster as any,
                );
            }
        }
        return true;
    }

    /**
     * Enqueue packets to be sent to the network
     * @param {Buffer} data - An encoded packet
     * @param {number} port - The desination port of the remote host
     * @param {string} address - The destination address of the remote host
     * @param {Socket=this.socket} socket - The socket to send on
     * @return {undefined}
     * @ignore
     */
    send(data, port, address, socket = this.socket) {
        this.sendQueue.push({ data, port, address, socket });
        this._scheduleSend();
    }

    /**
     * @private
     */
    async stream(peerId, sharedKey, args) {
        const p = this.peers.find((p) => p.peerId === peerId);
        if (p) {
            return p.write(sharedKey, args);
        }
    }

    /**
     * @private
     */
    _scheduleSend() {
        if (this.sendTimeout) {
            clearTimeout(this.sendTimeout);
        }
        this.sendTimeout = setTimeout(() => {
            this._dequeue();
        });
    }

    /**
     * @private
     */
    _dequeue() {
        if (!this.sendQueue.length) {
            return;
        }
        const { data, port, address, socket } = this.sendQueue.shift();

        socket.send(data, port, address, (err) => {
            if (this.sendQueue.length) {
                this._scheduleSend();
            }
            if (err) {
                return this._onError(err);
            }

            const packet: any = Packet.decode(data);
            if (!packet) {
                return;
            }

            this.metrics.o[packet.type]++;
            delete this.unpublished[packet.packetId.toString('hex')];
            if (this.onSend && packet.type) {
                this.onSend(packet, port, address);
            }
            this._onDebug(
                `>> SEND (from=${this.address}:${this.port}, to=${address}:${port}, type=${packet.type})`,
            );
        });
    }

    /**
     * Send any unpublished packets
     * @return {undefined}
     * @ignore
     */
    async sendUnpublished() {
        for (const [packetId] of Object.entries(this.unpublished)) {
            const packet = this.cache.get(packetId);

            if (!packet) {
                // it may have been purged already
                delete this.unpublished[packetId];
                continue;
            }

            await this.mcast(packet);
            this._onDebug(`-> RESEND (packetId=${packetId})`);
            if (this.onState) {
                this.onState();
            }
        }
    }

    /**
     * Get the serializable state of the peer (can be passed to the constructor or create method)
     * @return {undefined}
     */
    getState() {
        this.config.clock = this.clock; // save off the clock

        const peers = this.peers.map((p) => {
            const p2: any = { ...p };
            delete p2.localPeer;
            return p2;
        });

        return {
            peers,
            syncs: this.syncs,
            config: this.config,
            data: [...this.cache.data.entries()],
            unpublished: this.unpublished,
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
        const p: any = Packet.from(packet);
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
        this.peers.push(new RemotePeer(info));
    }

    async reconnect() {
        for (const cluster of Object.values(this.clusters)) {
            for (const subcluster of Object.values(cluster)) {
                await this.join(
                    (subcluster as any).sharedKey,
                    subcluster as any,
                );
            }
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
     * @return {Array<RemotePeer>}
     * @ignore
     */
    getPeers(packet, peers, ignorelist, filter = (o) => o) {
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
            if (p.lastUpdate < Date.now() - this.config.keepalive * 4) {
                return false;
            }
            if (this.peerId === p.peerId) {
                return false;
            } // same as me
            if (packet.message.requesterPeerId === p.peerId) {
                return false;
            } // same as requester - @todo: is this true in all cases?
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

        const clusterId = packet.clusterId.toString('base64');
        const friends = candidates.filter(
            (p) => p.clusters && p.clusters[clusterId] && !list.includes(p),
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
     * @return {undefined}
     * @ignore
     */
    async mcast(packet, ignorelist: any[] = []) {
        const peers = this.getPeers(packet, this.peers, ignorelist);
        const pid = packet.packetId.toString('hex');

        packet.hops += 1;

        for (const peer of peers) {
            this.send(await Packet.encode(packet), peer.port, peer.address);
        }

        if (this.onMulticast) {
            this.onMulticast(packet);
        }
        if (this.gate.has(pid)) {
            return;
        }
        this.gate.set(pid, 1);
    }

    /**
     * The process of determining this peer's NAT behavior (firewall and dependentness)
     * @return {undefined}
     * @ignore
     */
    async requestReflection() {
        if (this.closing || this.indexed || this.reflectionId) {
            this._onDebug('<> REFLECT ABORTED', this.reflectionId);
            return;
        }

        if (
            this.natType &&
            this.lastUpdate > 0 &&
            Date.now() - this.config.keepalive < this.lastUpdate
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
        if (this.onConnecting) {
            this.onConnecting({
                code: -1,
                status: `Entering reflection (lastUpdate ${Date.now() - this.lastUpdate}ms)`,
            });
        }

        const peers = [...this.peers]
            .filter((p) => p.lastUpdate !== 0)
            .filter(
                (p) =>
                    p.natType === NAT.UNRESTRICTED ||
                    p.natType === NAT.ADDR_RESTRICTED ||
                    p.indexed,
            );

        if (peers.length < 2) {
            if (this.onConnecting) {
                this.onConnecting({
                    code: -1,
                    status: 'Not enough pingable peers',
                });
            }
            this._onDebug(
                'XX REFLECT NOT ENOUGH PINGABLE PEERS - RETRYING',
                peers,
            );

            // tell all well-known peers that we would like to hear from them, if
            // we hear from any we can ask for the reflection information we need.
            for (const peer of this.peers
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
                () => this.requestReflection(),
                this.reflectionRetry * 256,
            );
        }

        this.reflectionRetry = 1;

        const requesterPeerId = this.peerId;
        const opts: any = { requesterPeerId, isReflection: true };

        this.reflectionId = opts.reflectionId = randomBytes(6)
            .toString('hex')
            .padStart(12, '0');

        if (this.onConnecting) {
            this.onConnecting({
                code: 0.5,
                status: `Found ${peers.length} elegible peers for reflection`,
            });
        }
        //
        // # STEP 1
        // The purpose of this step is strictily to discover the external port of
        // the probe socket.
        //
        if (this.reflectionStage === 0) {
            if (this.onConnecting) {
                this.onConnecting({
                    code: 1,
                    status: 'Discover External Port',
                });
            }
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
                if (this.onConnecting) {
                    this.onConnecting({ code: 1, status: 'Timeout' });
                }

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
            const { probeExternalPort } = this.config;
            if (this.onConnecting) {
                this.onConnecting({ code: 1.5, status: 'Discover NAT' });
            }

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
                if (this.onConnecting) {
                    this.onConnecting({
                        code: 1.5,
                        status: 'Insufficent Peers',
                    });
                }
                return setTimeout(() => this.requestReflection(), 256);
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

            if (this.onConnecting) {
                this.onConnecting({
                    code: 2,
                    status: `Requesting reflection from ${peer1.address}`,
                });
                this.onConnecting({
                    code: 2,
                    status: `Requesting reflection from ${peer2.address}`,
                });
            }

            if (this.reflectionTimeout) {
                clearTimeout(this.reflectionTimeout);
                this.reflectionTimeout = null;
            }

            this.reflectionTimeout = setTimeout(() => {
                this.reflectionTimeout = null;
                if (this.reflectionStage !== 2) {
                    return;
                }
                if (this.onConnecting) {
                    this.onConnecting({ code: 2, status: 'Timeout' });
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
    }

    /**
     * Ping another peer
     * @return {PacketPing}
     * @ignore
     */
    async ping(peer: any, withRetry: any, props: any, socket?: any) {
        if (!peer) {
            return;
        }

        props.message.requesterPeerId = this.peerId;
        props.message.uptime = this.uptime;
        props.message.timestamp = Date.now();
        props.clusterId = this.config.clusterId;

        const packet = new PacketPing(props);
        const data = await Packet.encode(packet);

        const send = async () => {
            if (this.closing) {
                return false;
            }

            const p = this.peers.find((p) => p.peerId === peer.peerId);
            // if (p?.reflectionId && p.reflectionId === packet.message.reflectionId) {
            //  return false
            // }

            this.send(data, peer.port, peer.address, socket);
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
     * Get a peer
     * @return {RemotePeer}
     * @ignore
     */
    getPeer(id) {
        return this.peers.find((p) => p.peerId === id);
    }

    /**
     * This should be called at least once when an app starts to multicast
     * this peer, and starts querying the network to discover peers.
     * @param {object} keys - Created by `Encryption.createKeyPair()`.
     * @param {object=} args - Options
     * @param {number=MAX_BANDWIDTH} args.rateLimit - How many requests per second to allow for this subclusterId.
     * @return {RemotePeer}
     */
    async join(sharedKey, args: any = { rateLimit: MAX_BANDWIDTH }) {
        const keys = await Encryption.createKeyPair(sharedKey);
        this.encryption.add(keys.publicKey, keys.privateKey);

        if (!this.port || !this.natType) {
            return;
        }

        args.sharedKey = sharedKey;

        const clusterId = args.clusterId || this.config.clusterId;
        const subclusterId = keys.publicKey;

        const cid = Buffer.from(clusterId || '').toString('base64');
        const scid = Buffer.from(subclusterId || '').toString('base64');

        this.clusters[cid] ??= {};
        this.clusters[cid][scid] = args;

        this.clock += 1;

        const packet: any = new PacketJoin({
            clock: this.clock,
            clusterId,
            subclusterId,
            message: {
                requesterPeerId: this.peerId,
                natType: this.natType,
                address: this.address,
                port: this.port,
                key: [cid, scid].join(':'),
            },
        });

        this._onDebug(
            `-> JOIN (clusterId=${cid.slice(0, 6)}, subclusterId=${scid.slice(0, 6)}, clock=${packet.clock}/${this.clock})`,
        );
        if (this.onState) {
            this.onState();
        }

        await this.mcast(packet);
        this.gate.set(packet.packetId.toString('hex'), 1);
    }

    /**
     * @param {Packet} T - The constructor to be used to create packets.
     * @param {Any} message - The message to be split and packaged.
     * @return {Array<Packet<T>>}
     * @ignore
     */
    async _message2packets(T, message, args) {
        const {
            clusterId,
            subclusterId,
            packet,
            nextId,
            meta = {},
            usr1,
            usr2,
            sig,
        } = args;

        let messages = [message];
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
            messages = [
                {
                    meta,
                    ts: Date.now(),
                    size: message.length,
                    indexes: Math.ceil(message.length / 1024),
                },
            ];
            let pos = 0;
            while (pos < message.length) {
                messages.push(message.slice(pos, (pos += 1024)));
            }
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

            if (packets[i + 1]) {
                packets[i + 1].packetId = await sha256(
                    Buffer.concat([
                        await sha256(packets[i].packetId, { bytes: true }),
                        await sha256(packets[i + 1].message, { bytes: true }),
                    ]),
                    { bytes: true },
                );

                packets[i].nextId = Buffer.from(packets[i + 1].packetId);
            }
        }

        return packets;
    }

    /**
     * Sends a packet into the network that will be replicated and buffered.
     * Each peer that receives it will buffer it until TTL and then replicate
     * it provided it has has not exceeded their maximum number of allowed hops.
     *
     * @param {object} keys - the public and private key pair created by `Encryption.createKeyPair()`.
     * @param {object} args - The arguments to be applied.
     * @param {Buffer} args.message - The message to be encrypted by keys and sent.
     * @param {Packet<T>=} args.packet - The previous packet in the packet chain.
     * @param {Buffer} args.usr1 - 32 bytes of arbitrary clusterId in the protocol framing.
     * @param {Buffer} args.usr2 - 32 bytes of arbitrary clusterId in the protocol framing.
     * @return {Array<PacketPublish>}
     */
    async publish(sharedKey, args) {
        // wtf to do here, we need subclusterId and the actual user keys
        if (!sharedKey) {
            throw new Error(
                '.publish() expected "sharedKey" argument in first position',
            );
        }
        if (!isBufferLike(args.message)) {
            throw new Error(
                '.publish() will only accept a message of type buffer',
            );
        }

        const keys = await Encryption.createKeyPair(sharedKey);

        args.subclusterId = keys.publicKey;
        args.clusterId = args.clusterId || this.config.clusterId;

        const cache = new Map();
        const message = this.encryption.seal(args.message, keys);
        const packets = await this._message2packets(
            PacketPublish,
            message,
            args,
        );

        for (let packet of packets) {
            packet = Packet.from(packet);
            cache.set(packet.packetId.toString('hex'), packet);
            await this.cacheInsert(packet);

            if (this.onPacket && packet.index === -1) {
                this.onPacket(packet, this.port, this.address, true);
            }

            this.unpublished[packet.packetId.toString('hex')] = Date.now();
            if (!Peer.onLine()) {
                continue;
            }

            await this.mcast(packet);
        }

        const head = [...cache.values()][0];
        // if there is a head, we can recompose the packets, this gives this
        // peer a consistent view of the data as it has been published.
        if (this.onPacket && head && head.index === 0) {
            const p: any = await this.cache.compose(head, cache);
            if (p) {
                this.onPacket(p, this.port, this.address, true);
                this._onDebug(
                    `-> PUBLISH (multicasted=true, packetId=${p.packetId.toString('hex').slice(0, 8)})`,
                );
                return [p];
            }
        }

        return packets;
    }

    /**
     * @return {undefined}
     */
    async sync(peer, ptime = Date.now()) {
        if (typeof peer === 'string') {
            peer = this.peers.find((p) => p.peerId === peer);
        }

        const rinfo = peer?.proxy || peer;

        this.lastSync = Date.now();
        const summary = await this.cache.summarize(
            '',
            this.cachePredicate(ptime),
        );

        this._onDebug(
            `-> SYNC START (dest=${peer.peerId.slice(0, 8)}, to=${rinfo.address}:${rinfo.port})`,
        );
        if (this.onSyncStart) {
            this.onSyncStart(peer, rinfo.port, rinfo.address);
        }

        // if we are out of sync send our cache summary
        const data = await Packet.encode(
            new PacketSync({
                message: Cache.encodeSummary(summary),
                usr4: Buffer.from(String(ptime)),
            }),
        );

        this.send(data, rinfo.port, rinfo.address, peer.socket);
    }

    close() {
        clearInterval(this.mainLoopTimer);

        if (this.closing) {
            return;
        }

        this.closing = true;
        this.socket.close();
        this.probeSocket.close();

        if (this.onClose) {
            this.onClose();
        }
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
     *
     * @return {undefined}
     * @ignore
     */
    async _onConnection(packet, peerId, port, address, proxy?, socket?) {
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

        const cid = packet.clusterId.toString('base64');
        const scid = packet.subclusterId.toString('base64');

        let peer: any = this.getPeer(peerId);
        const firstContact = !peer;

        if (firstContact) {
            peer = new RemotePeer({ peerId });

            if (this.peers.length >= 256) {
                // TODO evicting an older peer definitely needs some more thought.
                const oldPeerIndex = this.peers.findIndex(
                    (p) => !p.lastUpdate && !p.indexed,
                );
                if (oldPeerIndex > -1) {
                    this.peers.splice(oldPeerIndex, 1);
                }
            }

            this._onDebug(
                `<- CONNECTION ADDING PEER (id=${peer.peerId}, address=${address}:${port})`,
            );
            this.peers.push(peer);
        }

        peer.connected = true;
        peer.lastUpdate = Date.now();
        peer.port = port;
        peer.natType = natType;
        peer.address = address;
        //peer.clusters ??= {}; // feels wrong

        if (proxy) {
            peer.proxy = proxy;
        }
        if (socket) {
            peer.socket = socket;
        }

        if (cid) {
            peer.clusters[cid] ??= {};
        }

        if (cid && scid) {
            const cluster = peer.clusters[cid];
            cluster[scid] = { rateLimit: MAX_BANDWIDTH };
        }

        if (!peer.localPeer) {
            peer.localPeer = this;
        }

        this._onDebug(
            '<- CONNECTION (' +
                `peerId=${peer.peerId.slice(0, 6)}, ` +
                `address=${address}:${port}, ` +
                `type=${packet.type}, ` +
                `clusterId=${cid.slice(0, 6)}, ` +
                `subclusterId=${scid.slice(0, 6)})`,
        );

        // THIS ONE CAUSES WRONG PEERS IN THE SUBCLUSTER LIST
        // BUT REMOVING IT BREAKS EVERYTHING
        if (this.onJoin && this.clusters[cid]) {
            this.onJoin(packet, peer, port, address);
        }

        if (firstContact && this.onConnection) {
            this.onConnection(packet, peer, port, address);

            const now = Date.now();
            const key = [peer.address, peer.port].join(':');
            let first = false;

            //
            // If you've never sync'd before, you can ask for 6 hours of data from
            // other peers. If we have synced with a peer before we can just ask for
            // data that they have seen since then, this will avoid the risk of
            // spamming them and getting rate-limited.
            //
            if (!this.syncs[key]) {
                this.syncs[key] = now - 1000;
                first = true;
            }

            const lastSyncSeconds = (now - this.syncs[key]) / 1000;
            const syncWindow = this.config.syncWindow ?? 6000;

            if (first || now - this.syncs[key] > syncWindow) {
                await this.sync(peer.peerId, this.syncs[key]);
                this._onDebug(
                    `-> SYNC SEND (peerId=${peer.peerId.slice(0, 6)}, address=${key}, since=${lastSyncSeconds} seconds ago)`,
                );
                this.syncs[key] = now;
            }
        }
    }

    /**
     * Received a Sync Packet
     * @return {undefined}
     * @ignore
     */
    async _onSync(packet, port, address, _data) {
        this.metrics.i[packet.type]++;

        this.lastSync = Date.now();
        const pid = packet.packetId.toString('hex');

        let ptime = Date.now();

        if (packet.usr4.byteLength > 8 || packet.usr4.byteLength < 16) {
            const usr4 = parseInt(Buffer.from(packet.usr4).toString(), 10);
            ptime = Math.min(ptime - Packet.ttl, usr4);
        }

        if (!isBufferLike(packet.message)) {
            return;
        }
        if (this.gate.has(pid)) {
            return;
        }

        this.gate.set(pid, 1);

        const remote = Cache.decodeSummary(packet.message);
        const local = await this.cache.summarize(
            remote.prefix,
            this.cachePredicate(ptime),
        );

        if (
            !remote ||
            !remote.hash ||
            !local ||
            !local.hash ||
            local.hash === remote.hash
        ) {
            if (this.onSyncFinished) {
                this.onSyncFinished(packet, port, address);
            }
            return;
        }

        if (this.onSync) {
            this.onSync(packet, port, address, { remote, local });
        }

        const remoteBuckets = remote.buckets.filter(Boolean).length;
        this._onDebug(
            `<- ON SYNC (from=${address}:${port}, local=${local.hash.slice(0, 8)}, remote=${remote.hash.slice(0, 8)} remote-buckets=${remoteBuckets})`,
        );

        for (let i = 0; i < local.buckets.length; i++) {
            // continue; //--------------------------------- HACKY SKIP

            //
            // nothing to send/sync, expect peer to send everything they have
            //
            if (!local.buckets[i] && !remote.buckets[i]) {
                continue;
            }

            //
            // you dont have any of these, im going to send them to you
            //
            if (!remote.buckets[i]) {
                for (const [key, p] of this.cache.data.entries()) {
                    if (!key.startsWith(local.prefix + i.toString(16))) {
                        continue;
                    }

                    const packet: any = Packet.from(p);
                    if (!this.cachePredicate(ptime)(packet)) {
                        continue;
                    }

                    const pid = packet.packetId.toString('hex');
                    this._onDebug(
                        `-> SYNC SEND PACKET (type=data, packetId=${pid.slice(0, 8)}, to=${address}:${port})`,
                    );

                    this.send(await Packet.encode(packet), port, address);
                }
            } else {
                //
                // need more details about what exactly isn't synce'd
                //
                const nextLevel = await this.cache.summarize(
                    local.prefix + i.toString(16),
                    this.cachePredicate(ptime),
                );
                const data = await Packet.encode(
                    new PacketSync({
                        message: Cache.encodeSummary(nextLevel),
                        usr4: Buffer.from(String(Date.now())),
                    }),
                );
                this.send(data, port, address);
            }
        }
    }

    /**
     * Received a Ping Packet
     * @return {undefined}
     * @ignore
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

        this.send(buf, port, address);

        if (probeExternalPort) {
            message.port = probeExternalPort;
            const packetPong = new PacketPong({ message });
            const buf = await Packet.encode(packetPong);
            this.send(buf, probeExternalPort, address, this.probeSocket);
        }
    }

    /**
     * Received a Pong Packet
     * @return {undefined}
     * @ignore
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
        const peer = this.getPeer(responderPeerId);
        if (!peer) {
            throw new Error('peer not found');
        }

        if (packet.message.isConnection) {
            if (pingId) {
                peer.pingId = pingId;
            }
            this._onDebug('<- CONNECTION (source=pong)');
            await this._onConnection(packet, responderPeerId, port, address);
            return;
        }

        if (!peer) {
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
                if (this.onConnecting) {
                    this.onConnecting({
                        code: 2.5,
                        status: `Received reflection from ${address}:${port}`,
                    });
                }
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
                if (this.onConnecting) {
                    this.onConnecting({
                        code: 2.5,
                        status: `Received reflection from ${address}:${port}`,
                    });
                }
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
                        for (const peer of this.peers) {
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

                        if (this.onNat) {
                            this.onNat(this.natType);
                        }

                        this._onDebug(
                            `++ NAT (type=${NAT.toString(this.natType)})`,
                        );
                        await this.sendUnpublished();

                        if (this.onConnecting) {
                            this.onConnecting({
                                code: 3,
                                status: `Discovered! (nat=${NAT.toString(this.natType)})`,
                            });
                        }
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
     * @return {undefined}
     * @ignore
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
        if (!isNaN(ts) && ts + this.config.keepalive < Date.now()) {
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

        // already introduced in the laste minute, just drop the packet
        if (
            opts.attempts === 0 &&
            this.gate.has(peerId + peerAddress + peerPort)
        ) {
            return;
        }
        this.gate.set(peerId + peerAddress + peerPort, 2);

        // we already know this peer, and we're even connected to them!
        let peer = this.getPeer(peerId);
        if (!peer) {
            peer = new RemotePeer({
                peerId,
                natType,
                port: peerPort,
                address: peerAddress,
                clock,
                clusterId,
                subclusterId,
            });
        }
        if (peer.connected) {
            return;
        } // already connected
        if (clock > 0 && clock < peer.clock) {
            return;
        }
        peer.clock = clock;

        // a mutex per inbound peer to ensure that it's not connecting concurrently,
        // the check of the attempts ensures its allowed to recurse before failing so
        // it can still fall back
        if (this.gate.has('CONN' + peer.peerId) && opts.attempts === 0) {
            return;
        }
        this.gate.set('CONN' + peer.peerId, 1);

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

        if (this.onIntro) {
            this.onIntro(packet, peer, peerPort, peerAddress);
        }

        const pingId = randomBytes(6).toString('hex').padStart(12, '0');
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
        const proxyCandidate = this.peers.find(
            (p) => p.peerId === packet.message.responderPeerId,
        );

        if (opts.attempts >= 2) {
            this._onDebug('<- CONNECTION (source=intro)');
            await this._onConnection(
                packet,
                peer.peerId,
                peerPort,
                peerAddress,
                proxyCandidate,
            );
            return false;
        }

        setTimeout(() => {
            if (this.getPeer(peer.peerId)) {
                return;
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
                    return this.dgram.createSocket({ type: 'udp4' }).unref();
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

                    pooledSocket.send(data as any, rinfo.port, rinfo.address);

                    // create a new socket to replace it in the pool
                    const pool = this.socketPool || [];
                    const oldIndex = pool.findIndex((s) => s === pooledSocket);
                    pool[oldIndex] = this.dgram
                        .createSocket({ type: 'udp4' })
                        .unref();
                    this.socketPool = pool;

                    this._onMessage(msg, rinfo).catch((err) =>
                        console.error('_onMessage', err),
                    );
                });

                try {
                    pooledSocket.send(data as any, peerPort, peerAddress);
                } catch (err) {
                    console.error('STRATEGY_TRAVERSAL_CONNECT error', err);
                }
            }, 10);

            return;
        }

        if (strategy === NAT.STRATEGY_PROXY && !peer.proxy) {
            // TODO could allow multiple proxies
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
            peer.opening = Date.now();

            const portsCache = new Set();

            if (!this.bdpCache.length) {
                globalThis.bdpCache = this.bdpCache = Array.from(
                    { length: 1024 },
                    () => getRandomPort(portsCache),
                );
            }

            for (const port of this.bdpCache) {
                this.send(Buffer.from([0x1]), port, packet.message.address);
            }

            return;
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
     * @return {undefined}
     * @ignore
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

        // prevents premature pruning; a peer is not directly connecting
        const peer = this.peers.find((p) => p.peerId === peerId);
        if (peer) {
            peer.lastUpdate = Date.now();
        }

        // a rendezvous isn't relevant if it's too old, just drop the packet
        if (rendezvousDeadline && rendezvousDeadline < Date.now()) {
            return;
        }

        const cid = clusterId.toString('base64');
        const scid = subclusterId.toString('base64');

        this._onDebug(
            '<- JOIN (' +
                `peerId=${peerId.slice(0, 6)}, ` +
                `clock=${packet.clock}, ` +
                `hops=${packet.hops}, ` +
                `clusterId=${cid.slice(0, 6)}, ` +
                `subclusterId=${scid.slice(0, 6)}, ` +
                `address=${address}:${port})`,
        );

        // THIS ONE DOESN"T RESULT IN PEERS SHOWING UP IN THE CONNECTED SET?
        if (this.onJoin && this.clusters[cid]) {
            this.onJoin(packet, peer, port, address);
        }

        //
        // This packet represents a peer who wants to join the network and is a
        // member of our cluster. The packet was replicated though the network
        // and contains the details about where the peer can be reached, in this
        // case we want to ping that peer so we can be introduced to them.
        //
        if (rendezvousDeadline && !this.indexed && this.clusters[cid]) {
            if (!packet.message.rendezvousRequesterPeerId) {
                const pid = packet.packetId.toString('hex');
                this.gate.set(pid, 2);

                // TODO it would tighten up the transition time between dropped peers
                // if we check strategy from (packet.message.natType, this.natType) and
                // make introductions that create more mutually known peers.
                this._onDebug(
                    `<- JOIN RENDEZVOUS RECV (dest=${packet.message.requesterPeerId?.slice(0, 6)}, to=${peerAddress}:${peerPort},  via=${packet.message.rendezvousAddress}:${packet.message.rendezvousPort})`,
                );

                const data = await Packet.encode(
                    new PacketJoin({
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
                    }),
                );

                this.send(
                    data,
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

        let peers = this.getPeers(
            packet,
            this.peers,
            [{ port, address }],
            filter,
        );

        //
        // A peer who belongs to the same cluster as the peer who's replicated
        // join was discovered, sent us a join that has a specification for who
        // they want to be introduced to.
        //
        if (
            packet.message.rendezvousRequesterPeerId &&
            this.peerId === packet.message.rendezvousPeerId
        ) {
            const peer = this.peers.find(
                (p) => p.peerId === packet.message.rendezvousRequesterPeerId,
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

            const [intro1, intro2] = await Promise.all([
                Packet.encode(new PacketIntro({ ...opts, message: message1 })),
                Packet.encode(new PacketIntro({ ...opts, message: message2 })),
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

            this.send(intro2, peer.port, peer.address);
            this.send(intro1, packet.message.port, packet.message.address);

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
            packet.message.rendezvousDeadline =
                Date.now() + this.config.keepalive;
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

    /**
     * Received an Publish Packet
     * @return {undefined}
     * @ignore
     */
    async _onPublish(packet, port, address, _data) {
        this.metrics.i[packet.type]++;

        // only cache if this packet if i am part of this subclusterId
        // const cluster = this.clusters[packet.clusterId]
        // if (cluster && cluster[packet.subclusterId]) {

        const pid = packet.packetId.toString('hex');
        const cid = packet.clusterId.toString('base64');
        const scid = packet.subclusterId.toString('base64');

        if (this.gate.has(pid)) {
            this.metrics.i.DROPPED++;
            return;
        }

        this.gate.set(pid, 6);

        if (this.cache.has(pid)) {
            this.metrics.i.DROPPED++;
            this._onDebug(
                `<- DROP (packetId=${pid.slice(0, 6)}, clusterId=${cid.slice(0, 6)}, subclueterId=${scid.slice(0, 6)}, from=${address}:${port}, hops=${packet.hops})`,
            );
            return;
        }

        await this.cacheInsert(packet);

        const ignorelist = [{ address, port }];

        if (!this.indexed && this.encryption.has(scid)) {
            let p = packet.copy();

            if (p.index > -1) {
                this._onDebug(
                    `<- PUBLISH REQUIRES COMPOSE (packetId=${pid.slice(0, 6)}, index=${p.index}, from=${address}:${port})`,
                );

                p = await this.cache.compose(p);
                if (p?.isComposed) {
                    this._onDebug(
                        `<- PUBLISH COMPOSED (packetId=${pid.slice(0, 6)}, from=${address}:${port})`,
                    );
                }
            }

            if (p?.index === -1 && this.onPacket) {
                this._onDebug(
                    `<- PUBLISH (packetId=${pid.slice(0, 6)}, from=${address}:${port})`,
                );
                this.onPacket(p, port, address);
            }
        } else {
            this._onDebug(
                `<- PUBLISH (packetId=${pid.slice(0, 6)}, index=${packet.index}, from=${address}:${port})`,
            );
        }

        if (packet.hops >= this.maxHops) {
            return;
        }

        await this.mcast(packet, ignorelist);

        // }
    }

    /**
     * Received an Stream Packet
     * @return {undefined}
     * @ignore
     */
    async _onStream(packet, port, address, _data) {
        this.metrics.i[packet.type]++;

        const pid = packet.packetId.toString('hex');

        const streamTo = packet.usr3.toString('hex');
        const streamFrom = packet.usr4.toString('hex');

        // only help packets with a higher hop count if they are in our cluster
        // if (packet.hops > 2 && !this.clusters[packet.cluster]) return

        this._onDebug(
            `<- STREAM (from=${address}:${port}, pid=${pid}, hops=${packet.hops}, to=${streamTo}, from=${streamFrom})`,
        );

        // stream message is for this peer
        if (streamTo === this.peerId) {
            if (this.gate.has(pid)) {
                return;
            }
            this.gate.set(pid, 1);

            this._onDebug(
                `<- STREAM ACCEPTED (received=true, from=${address}:${port})`,
            );
            const scid = packet.subclusterId.toString('base64');

            if (this.encryption.has(scid)) {
                let p = packet.copy(); // clone the packet so it's not modified

                if (packet.index > -1) {
                    // if it needs to be composed...
                    if (packet.index === 0) {
                        this.streamBuffer.clear();
                    }
                    p.timestamp = Date.now();
                    this.streamBuffer.set(pid, p); // cache the partial

                    p = await this.cache.compose(p, this.streamBuffer); // try to compose
                    if (!p) {
                        return;
                    } // could not compose

                    this._onDebug(
                        `<- STREAM COMPOSED (pid=${pid.slice(0, 6)}, bufsize=${this.streamBuffer.size})`,
                    );

                    const previousId =
                        p.index === 0 ? p.packetId : p.previousId;
                    const parentId = previousId.toString('hex');

                    this.streamBuffer.forEach((v, k) => {
                        if (k === parentId) {
                            this.streamBuffer.delete(k);
                        }
                        if (v.previousId.compare(previousId) === 0) {
                            this.streamBuffer.delete(k);
                        }
                    });
                }

                this._onDebug(
                    `<- STREAM COMPLETE (pid=${pid.slice(0, 6)}, bufsize=${this.streamBuffer.size})`,
                );

                if (this.onStream) {
                    const peerFrom = this.peers.find(
                        (p) => p.peerId === streamFrom,
                    );
                    if (peerFrom) {
                        this.onStream(p, peerFrom, port, address);
                    }
                }
            }

            return;
        }

        // stream message is for another peer
        const peerTo = this.peers.find((p) => p.peerId === streamTo);
        if (!peerTo) {
            this._onDebug(
                `XX STREAM RELAY FORWARD DESTINATION NOT REACHABLE (to=${streamTo})`,
            );
            return;
        }

        if (packet.hops >= this.maxHops) {
            this._onDebug(`XX STREAM RELAY MAX HOPS EXCEEDED (to=${streamTo})`);
            return;
        }

        this._onDebug(
            `>> STREAM RELAY (to=${peerTo.address}:${peerTo.port}, id=${peerTo.peerId.slice(0, 6)})`,
        );
        // I am the proxy!
        this.send(await Packet.encode(packet), peerTo.port, peerTo.address);

        //
        // What % of packets hit the server.
        //

        // if (packet.hops === 1 && this.natType === NAT.UNRESTRICTED) {
        //   this.mcast(packet, [{ port, address }, { port: peerFrom.port, address: peerFrom.address }])
        // }
    }

    /**
     * Received any packet on the probe port to determine the firewall:
     * are you port restricted, host restricted, or unrestricted.
     * @return {undefined}
     * @ignore
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

        if (this.onProbe) {
            this.onProbe(data, port, address);
        }
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
            this.config.probeExternalPort = packet.message.port;

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
     *
     * @param {Buffer|Uint8Array} data
     * @param {{ port: number, address: string }} info
     */
    async _onMessage(data, { port, address }) {
        const packet: any = Packet.decode(data);
        if (!packet || packet.version !== VERSION) {
            return;
        }

        const peer = this.peers.find(
            (p) => p.address === address && p.port === port,
        );
        if (peer) {
            peer.lastUpdate = Date.now();
        }

        const cid = Buffer.from(packet.clusterId).toString('base64');
        const scid = Buffer.from(packet.subclusterId).toString('base64');

        // onDebug('<- PACKET', packet.type, port, address)
        const clusters = this.clusters[cid];
        const subcluster = clusters && clusters[scid];

        if (!this.config.limitExempt) {
            if (rateLimit(this.rates, packet.type, port, address, subcluster)) {
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

        const args: any[] = [packet, port, address, data];

        // if (this.firewall) {
        //     if (!this.firewall(...args)) {
        //         return;
        //     }
        // }
        if (this.onData) {
            this.onData(...args);
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
                return this._onPublish(packet, port, address, data);
            case PacketSync.type:
                return this._onSync(packet, port, address, data);
            // case PacketQuery.type:
            //     return this._onQuery(packet, port, address, data);
        }
    }

    /**
     * Test a peerID is valid
     *
     * @param {string} pid
     * @returns boolean
     */
    static isValidPeerId(pid) {
        return typeof pid === 'string' && PEERID_REGEX.test(pid);
    }

    /**
     * Test a reflectionID is valid
     *
     * @param {string} rid
     * @returns boolean
     */
    static isValidReflectionId(rid) {
        return typeof rid === 'string' && /^[A-Fa-f0-9]{12}$/.test(rid);
    }

    /**
     * Test a pingID is valid
     *
     * @param {string} pid
     * @returns boolean
     */
    static isValidPingId(pid) {
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
     *
     * @returns boolean
     */
    static onLine() {
        return globalThis.navigator?.onLine !== false;
    }
}

export default Peer;
