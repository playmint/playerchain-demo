import * as cbor from 'cbor-x';
import Dexie from 'dexie';
import _sodium from 'libsodium-wrappers';
import { LRUCache } from 'lru-cache';
import { Buffer } from 'socket:buffer';
import { Encryption } from 'socket:latica';
import { Channel, ChannelInfo, PeerStatus } from './channels';
import database, { DB, StoredMessage } from './db';
import {
    Base64ID,
    CreateChannelMessage,
    Message,
    MessageType,
    PresignedMessage,
    SetPeersMessage,
    UnsignedMessage,
} from './messages';
import {
    SocketClusterConstructor,
    SocketNetwork,
    SocketPeer,
    SocketPersistedState,
    SocketRPCGetMessagesByHeight,
    SocketRPCRequest,
    createSocketCluster,
} from './network';
import { Peer } from './peer';
import { sleep } from './timers';
import { Packet, PacketType } from './transport';
import { CancelFunction, bufferedCall, setPeriodic } from './utils';

await _sodium.ready;
const sodium = _sodium;

export interface ClientKeys {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

export interface ClientConfig {
    keys: ClientKeys;
    dbname: string;
    network: SocketClusterConstructor;
    clusterId: Uint8Array;
    config?: SocketPersistedState;
}

export class Client {
    id: Uint8Array;
    peerId: string;
    key: Uint8Array;
    shortId: string;
    db: DB;
    active: boolean = true;
    net!: SocketNetwork;
    syncInterval: number = 1000;
    seqNum: number | null = null;
    height: number | null = null;
    parent: Message | null = null;
    committing: boolean = false;
    peers: Map<string, Peer> = new Map();
    channels: Map<string, Channel> = new Map();
    threads: CancelFunction[] = [];
    recentlyAckedMessage = new LRUCache<string, boolean>({
        max: 500,
        ttl: 1000 * 60 * 5,
    });
    recentlyProcessedMessage = new LRUCache<string, boolean>({
        max: 500,
        ttl: 1000 * 60 * 5,
    });
    recentlyRequestedMessage = new LRUCache<string, boolean>({
        max: 10,
        ttl: 1000,
    });
    _ready: null | Promise<void>;
    _onPeersChanged?: (peers: Peer[]) => void;

    constructor(config: ClientConfig) {
        this.id = config.keys.publicKey;
        this.peerId = Buffer.from(this.id).toString('hex');
        this.shortId = this.peerId.slice(0, 8);
        this.key = config.keys.privateKey;
        this.db = database.open(config.dbname);
        this._ready = this.init(config);
    }

    static async from(config: ClientConfig): Promise<Client> {
        const c = new Client(config);
        if (c._ready) {
            await c._ready;
            c._ready = null;
        }
        return c;
    }

    async init(config: Omit<ClientConfig, 'socket'>) {
        // disconnect all the peers
        this.debug('resetting-peer-states');
        await this.db.peers.clear();
        // setup network
        this.debug('configuring-network');
        this.net = await createSocketCluster({
            db: this.db,
            keys: config.keys,
            network: config.network,
            clusterId: config.clusterId,
            config: config.config,
        });
        this.net.socket.on('#disconnect', this.onPeerDisconnect);
        this.debug('starting-head-reporter');
        // on channel
        this.threads.push(
            setPeriodic(async () => {
                await this.emitHeads();
            }, 10000),
        );
        this.debug('starting-ch-sync');
        this.threads.push(
            setPeriodic(async () => {
                await this.syncChannels();
            }, 2000),
        );
        // load any existing channels we know about
        this.debug('load-channels');
        const channels = await this.db.channels.toArray();
        for (const ch of channels) {
            await this.joinChannel(ch.id);
        }
        this.debug('init-ready');
    }

    private onPeerLeave = bufferedCall(
        async (peerId: string, channel: Channel) => {
            this.debug(
                `peer-leave peer=${peerId.slice(0, 8)} channel=${channel.id.slice(0, 8)}`,
            );
            const peer = this.peers.get(peerId);
            if (!peer) {
                return;
            }
            peer.sockets.delete(channel.id);
            peer.channels.delete(channel.id);
        },
        10,
        'onPeerLeave',
    );

    private onPeerJoin = bufferedCall(
        async (socket: SocketPeer, status: PeerStatus, channel: Channel) => {
            const pk = Buffer.from(socket.peerId, 'hex');
            this.debug(
                `peer-join peer=${socket.peerId.slice(0, 8)} channel=${channel.id.slice(0, 8)}`,
            );
            let peer = this.peers.get(socket.peerId);
            if (!peer) {
                let info = await this.db.peers.get(socket.peerId);
                if (!info) {
                    info = {
                        peerId: socket.peerId,
                        lastSeen: -1,
                        validHeight: -1,
                        knownHeight: -1,
                        channels: [channel.id],
                        proxy: status.proxy,
                        sees: [],
                    };
                    await this.db.peers.put(info);
                }
                peer = new Peer({
                    pk,
                    sockets: new Map(),
                    channels: new Map(),
                    client: this,
                    validHeight: -1,
                    knownHeight: -1,
                    lastSeen: -1,
                    onPacket: this.onPacket,
                    Buffer: Buffer,
                });
                this.peers.set(socket.peerId, peer);
            }
            // add peer to socket list
            peer.sockets.set(channel.id, socket);
            peer.channels.set(channel.id, channel);
            await this.db.peers.update(socket.peerId, {
                proxy: status.proxy,
            });
        },
        100,
        'onPeerJoin',
    );

    private onPeerDisconnect = bufferedCall(
        async (socket: SocketPeer) => {
            this.debug('peer-disconnected', socket.peerId.slice(0, 8));
            const peer = this.peers.get(socket.peerId);
            if (peer) {
                await peer.destroy();
                this.peers.delete(socket.peerId);
            }
        },
        10,
        'onPeerDisconnect',
    );

    // commit will sign, store and broadcast the message
    async commit(
        msg: UnsignedMessage,
        ackIds?: Uint8Array[] | null,
    ): Promise<Message> {
        if (this.committing) {
            throw new Error('already-committing');
        }
        this.committing = true;
        return this._commit(msg, ackIds).finally(() => {
            this.committing = false;
        });
    }

    private async _commit(
        msg: UnsignedMessage,
        ackIds?: Uint8Array[] | null,
    ): Promise<Message> {
        if (this.height === null) {
            const latest = await this.db.messages
                .where(['peer', 'height'])
                .between([this.id, Dexie.minKey], [this.id, Dexie.maxKey])
                .last();
            if (!latest) {
                this.height = 0;
                this.parent = null;
            } else {
                this.height = latest.height + 1;
                this.parent = latest;
            }
        }
        // grab the lastest heads
        const acks: Uint8Array[] =
            ackIds ||
            (
                await this.getAckable(
                    msg.type == MessageType.INPUT ? msg.round : undefined,
                    msg.type == MessageType.INPUT ? msg.channel : undefined,
                )
            )
                .map((msg) => msg.sig)
                .filter(
                    (ack) =>
                        !this.recentlyAckedMessage.has(
                            Buffer.from(ack).toString('hex'),
                        ),
                );
        // build the msg to attest to
        const attest: PresignedMessage = {
            ...msg,
            peer: this.id,
            height: this.height,
            acks, // TODO: ask consensus system what to do
            parent: this.parent ? this.parent.sig : null,
        };
        const signed = await this.sign(attest);
        const stored: StoredMessage = {
            ...signed,
            arrived: await this.nextSequenceNumber(),
        };
        await this.db.messages.add(stored);
        this.height = signed.height + 1;
        const msgs = [signed];
        // include the parent too for good measure, double the bandwidth, double the fun
        // if (this.parent) {
        //     msgs.push(this.parent);
        // }
        this.parent = signed;
        acks.forEach((ack) => {
            this.recentlyAckedMessage.set(
                Buffer.from(ack).toString('hex'),
                true,
            );
        });
        for (const [_id, ch] of this.channels) {
            ch.send(
                {
                    type: PacketType.MESSAGE,
                    msgs,
                },
                {
                    ttl: 300,
                },
            );
        }
        return signed;
    }

    async sign(msg: PresignedMessage): Promise<Message> {
        const hash = await this.hash(msg);
        const sig = sodium.crypto_sign_detached(
            Buffer.from(hash),
            Buffer.from(this.key),
        );
        // console.log('-----SIGN>', {
        //     sig: Buffer.from(sig).toString('hex'),
        //     hsh: Buffer.from(hash).toString('hex'),
        //     pub: Buffer.from(msg.peer).toString('hex'),
        // });
        return {
            ...msg,
            sig,
        };
    }

    async verify(msg: Message): Promise<boolean> {
        try {
            const { sig, ...unsigned } = msg;
            const hash = await this.hash(unsigned);
            const pk = msg.peer;
            return sodium.crypto_sign_verify_detached(sig, hash, pk);
        } catch (err) {
            console.error(`
                verify-error
                msg=${msg}
                err=${err}
            `);
            return false;
        }
    }

    async hash(msg: PresignedMessage): Promise<Uint8Array> {
        const values = Object.keys(msg)
            .sort()
            .map((k) => msg[k]);
        const data = JSON.stringify(values);
        // FIXME: is "BYTES_MIN" enough?
        return sodium.crypto_generichash(
            sodium.crypto_generichash_BYTES_MIN,
            data,
        );
    }

    private onPacket = bufferedCall(
        async (packet: Packet) => {
            switch (packet.type) {
                case PacketType.SYNC_NEED:
                    return;
                case PacketType.MESSAGE:
                    await this.onMessages(packet.msgs);
                    return;
                case PacketType.KEEP_ALIVE:
                    return;
                default:
                    console.warn('unhandled-packet', packet);
                    return;
            }
        },
        1024,
        'onPacket',
    );

    onMessages = async (msgs: Message[]): Promise<Message[]> => {
        for (const msg of msgs) {
            await this.onMessage(msg);
        }
        return msgs;
    };

    onMessage = async (msg: Message): Promise<void> => {
        // ignore messages we have seen recently
        // const msgId = Buffer.from(msg.sig).toString('hex');
        // const seen = this.recentlyProcessedMessage.get(msgId);
        // if (seen) {
        //     console.log('drop-message-recently-seen', msgId.slice(0, 8));
        //     return;
        // }
        // this.recentlyProcessedMessage.set(msgId, true);
        // ignore own messages, assume we can take care of those
        if (Buffer.from(msg.peer).toString('hex') === this.peerId) {
            return;
        }
        // FIXME: this verify requires encoding, can we do it faster
        const verified = await this.verify(msg);
        if (!verified) {
            console.warn(
                'drop-message-verification-fail',
                Buffer.from(msg.sig).toString('hex'),
            );
            return;
        }
        // TODO: validate that no acks belong to the sender

        // store it
        const existing = await this.db.messages.get(msg.sig);
        if (!existing) {
            await this.db.messages.put({
                ...msg,
                arrived: await this.nextSequenceNumber(),
            });
            // rebroadcast this with jitter since it's new to us
            // this is bandwidth inefficient, but it helps those with patchy connections
            // setTimeout(
            //     () => {
            //         for (const [_, ch] of this.channels) {
            //             ch.send(
            //                 {
            //                     type: PacketType.MESSAGE,
            //                     msgs: [msg],
            //                 },
            //                 {
            //                     ttl: 300,
            //                 },
            //             );
            //         }
            //     },
            //     Math.floor(Math.random() * 25) + 25,
            // );
        }

        // update or write a peer entry for this peer
        // const peerId = Buffer.from(msg.peer).toString('hex');
        // let peer = this.peers.get(peerId);
        // if (!peer) {
        //     let info = await this.db.peers.get(peerId);
        //     if (!info) {
        //         info = {
        //             peerId,
        //             lastSeen: -1,
        //             validHeight: -1,
        //             knownHeight: msg.height,
        //             channels: [],
        //             connected: false,
        //             proxy: null,
        //             online: false,
        //             sees:
        //         };
        //         await this.db.peers.put(info);
        //     }
        //     peer = new Peer({
        //         pk: msg.peer,
        //         sockets: new Map(),
        //         channels: new Map(),
        //         client: this,
        //         validHeight: info.validHeight,
        //         knownHeight: info.knownHeight,
        //         lastSeen: info.lastSeen,
        //         onPacket: this.onPacket,
        //         Buffer: Buffer,
        //     });
        //     this.peers.set(peerId, peer);
        // }

        // do we have this message's parent?
        const parentSig = msg.parent;
        if (parentSig) {
            const parent = await this.db.messages.get(parentSig);
            if (!parent) {
                // start search for parent shortly, not immediately
                // the packets may already be on the way
                setTimeout(() => {
                    (async () => {
                        for (;;) {
                            try {
                                await this.requestMissingParent(msg);
                                await sleep(100);
                                const parent =
                                    await this.db.messages.get(parentSig);
                                if (parent) {
                                    return;
                                }
                            } catch (err) {
                                console.error('mark-missing-loop-err', err);
                                await sleep(1000);
                            }
                        }
                    })().catch((err) =>
                        console.error('mark-missing-parent-err', err),
                    );
                }, 0);
            }
        }

        // if this msg in the missing list, remove it

        switch (msg.type) {
            case MessageType.CREATE_CHANNEL:
                await this.onCreateChannel(msg);
                return;
            case MessageType.SET_PEERS:
                await this.onSetPeers(msg);
                return;
            case MessageType.INPUT:
                // TODO: pass to consensus
                return;
        }
    };

    async onSetPeers(msg: SetPeersMessage) {
        this.debug('SETTING PEERS', msg);
        // TODO: implement checking that SET_PEERS is from same peer as CREATE_CHANNEL
        const channel = await this.db.channels.get(msg.channel);
        if (!channel) {
            console.warn('set-peers-unknown-channel', msg.channel);
            return;
        }
        await this.db.channels.update(channel.id, {
            peers: msg.peers.map((p) => Buffer.from(p).toString('hex')),
        });
    }

    async requestMissingParent(child: Message) {
        if (child.parent === null) {
            return;
        }
        const exists = await this.db.messages.get(child.parent);
        if (exists) {
            return;
        }
        const parentId = Buffer.from(child.parent).toString('hex');
        if (this.recentlyRequestedMessage.has(parentId)) {
            return;
        }
        this.recentlyRequestedMessage.set(parentId, true);
        // if this one is missing, then there are probably more
        // check if there is a big gap after this one
        const nextKnownMessage = await this.db.messages
            .where(['peer', 'height'])
            .between([child.peer, Dexie.minKey], [child.peer, child.height])
            .last();
        const missingHeight = child.height;
        const missingCount = nextKnownMessage
            ? child.height - nextKnownMessage.height
            : child.height;
        const peerId = Buffer.from(child.peer).toString('hex');
        try {
            this.debug(
                `req-missing asking=everyone missingpeer=${peerId.slice(0, 8)} missingheight=${missingHeight} count=${missingCount}`,
            );
            await this.rpc({
                name: 'requestMessagesByHeight',
                timestamp: Date.now(),
                args: {
                    peerId: this.peerId,
                    fromHeight: missingHeight - missingCount,
                    toHeight: missingHeight,
                },
            });
            return;
        } catch (err) {
            console.error(`req-missing-err asking=everyone err=${err}`);
        }
    }

    // this is used to tag the order messages are received in
    // only guarentee is that it is larger than the last one
    // there may be gaps
    private async nextSequenceNumber(): Promise<number> {
        if (!this.seqNum) {
            this.seqNum = Date.now();
        }
        this.seqNum++;
        return this.seqNum;
    }

    private async onCreateChannel(msg: Message) {
        if (msg.type !== MessageType.CREATE_CHANNEL) {
            throw new Error('expected-create-channel');
        }
        // FIXME: this is just overwriting the channel name with whatever
        // message comes last, it should check if consensus is formed around it
        // but there is no way to change the name right now so it's fine
        const chid = Buffer.from(msg.sig).toString('base64');
        const ch = await this.db.channels.get(chid);
        if (ch) {
            return this.db.channels.update(ch.id, {
                name: msg.name,
                creator: Buffer.from(msg.peer).toString('hex'),
            });
        }
    }

    private async getHeads(): Promise<Message[]> {
        const heads: Message[] = [];
        // emit the head of each peer we know (including ourselves)
        const peerIds = (await this.db.peers.toArray()).map((p) =>
            Buffer.from(p.peerId, 'hex'),
        );
        peerIds.unshift(this.id);
        for (const peerId of peerIds) {
            const head = await this.db.messages
                .where(['peer', 'height'])
                .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
                .last();
            if (!head) {
                continue;
            }
            heads.push(head);
        }
        return heads;
    }

    private async getAckable(
        round?: number,
        channelId?: string,
    ): Promise<Message[]> {
        const heads: Message[] = [];
        const peerIds = (await this.db.peers.toArray()).map((p) =>
            Buffer.from(p.peerId, 'hex'),
        );
        for (const peerId of peerIds) {
            const messages = await this.db.messages
                .where(['peer', 'height'])
                .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
                .reverse()
                .limit(2)
                .toArray();
            for (const m of messages) {
                // never ack same round
                if (round) {
                    if (m.type === MessageType.INPUT && m.round === round) {
                        continue;
                    }
                }
                // if channel given, then skip non channel acks
                if (channelId) {
                    if (
                        m.type === MessageType.INPUT &&
                        m.channel !== channelId
                    ) {
                        continue;
                    }
                }
                heads.push(m);
                break;
            }
        }
        return heads;
    }

    private async emitHeads() {
        // collect all the heads
        const heads = await this.getHeads();
        // tell everyone about the heads
        for (const [_, ch] of this.channels) {
            // console.log('peersendhead', ch.shortId);
            ch.send(
                {
                    type: PacketType.MESSAGE,
                    msgs: heads,
                },
                { ttl: 10000 },
            );
        }
        this.debug(`emit-peer-heads count=${heads.length}`);
    }

    private async syncChannels() {
        for (const [_, ch] of this.channels) {
            if (typeof ch.id !== 'string') {
                console.warn('ignoring invalid channel id', ch);
                continue;
            }
            // send channel keep alive
            // see channel.ts ... this is a workaround for a bug

            const connectedPeers = await this.db.peers.toArray();
            ch.send(
                {
                    type: PacketType.KEEP_ALIVE,
                    peer: this.id,
                    timestamp: Date.now(),
                    sees: connectedPeers.map((p) =>
                        Buffer.from(p.peerId, 'hex'),
                    ),
                },
                {
                    channels: [ch.id],
                    ttl: 1000,
                },
            );
            // send channel join
            if (ch.socket) {
                ch.socket.join();
            }
            // sync channel name with genesis and rebroadcast it
            const channelSig = Uint8Array.from(atob(ch.id), (c) =>
                c.charCodeAt(0),
            );
            const genesis = await this.db.messages
                .where('sig')
                .equals(channelSig)
                .first();
            if (genesis) {
                if (genesis.type === MessageType.CREATE_CHANNEL) {
                    if (ch.name === '') {
                        ch.name = genesis.name;
                        await this.db.channels.update(ch.id, {
                            name: genesis.name,
                            creator: Buffer.from(genesis.peer).toString('hex'),
                        });
                    }
                    this.debug(
                        'emit-genesis',
                        Buffer.from(genesis.sig).toString('hex').slice(0, 10),
                    );
                    ch.send(
                        {
                            type: PacketType.MESSAGE,
                            msgs: [genesis],
                        },
                        {
                            channels: [ch.id],
                            ttl: 1000,
                        },
                    );
                }
            }
            // sync channel peers and rebroadcast it
            const info = await this.db.channels.get(ch.id);
            if (info) {
                if (info.peers.length === 0) {
                    // try to find the SetPeers message
                    const setPeers = await this.db.messages
                        .where(['channel', 'type'])
                        .between(
                            [ch.id, MessageType.SET_PEERS],
                            [ch.id, MessageType.SET_PEERS],
                        )
                        .last();
                    if (setPeers && setPeers.type === MessageType.SET_PEERS) {
                        await this.onSetPeers(setPeers);
                    }
                }
                // check we have the peer set
            }
        }
    }

    private async updateChannelConfig(id: string): Promise<ChannelInfo> {
        let info = await this.db.channels.get(id);
        if (!info) {
            info = { id, name: '', peers: [], creator: '' };
            await this.db.channels.put(info);
        }
        return info;
    }

    private async monitorChannel(config: ChannelInfo) {
        let channel = this.channels.get(config.id);
        if (!channel) {
            this.debug('creating-channel', config.id);
            const sharedKey = await Encryption.createSharedKey(config.id);
            const socket = await this.net.socket.subcluster({
                sharedKey,
            });
            socket.on(`rpc`, this.onRPCRequest);
            channel = new Channel({
                id: config.id,
                client: this,
                socket,
                name: config.name || '',
                onPeerJoin: this.onPeerJoin,
                onPeerLeave: this.onPeerLeave,
                onPacket: this.onPacket,
                Buffer: Buffer,
            });
            this.debug('monitor-channel', channel.shortId, socket.subclusterId);
        }
        this.channels.set(config.id, channel);
        channel.socket.join();
    }

    async joinChannel(channelId: Base64ID) {
        if (typeof channelId !== 'string') {
            throw new Error('join-channel-fail: err=channel-id-must-be-string');
        }
        const cfg = await this.updateChannelConfig(channelId);
        await this.monitorChannel(cfg);
        // FIXME: commit an empty input message, if we don't have one
        // we currently depend on this in the simulation but we really shouldn't!!
        if ((await this.db.messages.count()) === 0) {
            await this.commit({
                type: MessageType.INPUT,
                round: 1, //(Date.now() + 100) / 50,
                channel: channelId,
                data: 0,
            });
        }
    }

    async createChannel(name: string): Promise<Base64ID> {
        const msg: CreateChannelMessage = {
            type: MessageType.CREATE_CHANNEL,
            name,
        };
        const commitment = await this.commit(msg);
        const channelId = Buffer.from(commitment.sig).toString('base64');
        await this.joinChannel(channelId);
        return channelId;
    }

    async setPeers(channelId: Base64ID, peers: string[]) {
        const msg: SetPeersMessage = {
            type: MessageType.SET_PEERS,
            channel: channelId,
            peers: peers.sort().map((p) => Buffer.from(p, 'hex')),
        };
        await this.commit(msg);
        await this.onSetPeers(msg);
    }

    private debug(...args: any[]) {
        console.log(`[client/${this.shortId}]`, ...args);
    }

    async getHeight(): Promise<number> {
        return (
            (
                await this.db.messages
                    .where(['peer', 'height'])
                    .between([this.id, Dexie.minKey], [this.id, Dexie.maxKey])
                    .last()
            )?.height || 0
        );
    }

    private rpc = async (
        req: Omit<Omit<SocketRPCRequest, 'id'>, 'sender'>,
    ): Promise<any> => {
        const r: SocketRPCGetMessagesByHeight = {
            ...req,
            id: 'x',
            sender: this.peerId,
        };
        for (const [_, ch] of this.channels) {
            ch.socket
                .emit(`rpc`, Buffer.from(cbor.encode(r)), {
                    ttl: 1000,
                })
                .catch((err) => {
                    console.log('rpc-err', err);
                });
        }
    };

    private onRPCRequest = bufferedCall(async (b: Uint8Array) => {
        const req = cbor.decode(Buffer.from(b)) as SocketRPCRequest;
        if (!req.id) {
            return;
        }
        if (!req.sender) {
            return;
        }
        if (req.sender === this.peerId) {
            // don't answer own requests!
            return;
        }
        if (!req.name) {
            return;
        }
        if (
            !req.timestamp ||
            typeof req.timestamp !== 'number' ||
            req.timestamp < Date.now() - 1000
        ) {
            // ignore old requests
            return;
        }
        const handler = this.getRequestHandler(req.name);
        if (!handler) {
            return;
        }
        console.log('GOT RPC REQUEST FROM', req.sender);
        await handler(req.args as any);
    }, 5);

    private getRequestHandler = (name: SocketRPCRequest['name']) => {
        switch (name) {
            case 'requestMessagesByHeight':
                return this.requestMessagesByHeight;
            default:
                return null;
        }
    };

    private requestMessagesByHeight = async ({
        fromHeight,
        toHeight,
    }: {
        peerId: string;
        fromHeight: number;
        toHeight: number;
    }): Promise<number> => {
        // const peer = this.peers.get(peerId);
        // if (!peer) {
        //     throw new Error(`unknown-peer ${peerId}`);
        // }
        const msgs = await this.db.messages
            .where(['peer', 'height'])
            .between([this.id, fromHeight], [this.id, toHeight + 1])
            .limit(10)
            .toArray();
        for (const msg of msgs) {
            for (const [_, ch] of this.channels) {
                ch.send(
                    {
                        type: PacketType.MESSAGE,
                        msgs: [msg],
                    },
                    { ttl: 500 },
                );
            }
        }
        return msgs.length;
    };

    // call this if you never want to use this instance again
    // does not delete the database
    async shutdown() {
        for (const cancel of this.threads) {
            cancel();
        }
        if (this.net.socket) {
            this.net.socket.off('#disconnect', this.onPeerDisconnect);
        }
        for (const ch of this.channels.values()) {
            ch.destroy();
        }
        for (const peer of this.peers.values()) {
            await peer.destroy();
        }
        if (this.active) {
            this.active = false;
            this.debug('shutdown');
        }
        this.net.shutdown();
    }

    // WARNING: this will brick the client and drop all the data, this is very likely
    // irrecovarable and should only be used for testing
    async destroy() {
        await this.shutdown();
        if (await Dexie.exists(this.db.name)) {
            await Dexie.delete(this.db.name);
        }
        this.debug('destroyed');
    }
}
