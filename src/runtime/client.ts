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
import { Packet, PacketType, TransportEmitOpts } from './transport';
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
    enableSync?: boolean;
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
    parentParent: Message | null = null;
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
        ttl: 1000 * 60,
    });
    recentlyRequestedMessage = new LRUCache<string, boolean>({
        max: 10,
        ttl: 1000,
    });
    verifiedHeight: Map<string, number> = new Map();
    _ready: null | Promise<void>;
    enableSync: boolean;

    constructor(config: ClientConfig) {
        this.id = config.keys.publicKey;
        this.peerId = Buffer.from(this.id).toString('hex');
        this.shortId = this.peerId.slice(0, 8);
        this.key = config.keys.privateKey;
        this.db = database.open(config.dbname);
        this.enableSync = config.enableSync !== false;
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
        // setup network
        this.debug('configuring-network');
        this.net = await createSocketCluster({
            db: this.db,
            keys: config.keys,
            network: config.network,
            clusterId: config.clusterId,
            config: config.config,
        });
        // this.net.socket.on('#disconnect', this.onPeerDisconnect);
        this.debug('starting-head-reporter');
        // on channel
        if (this.enableSync) {
            this.threads.push(
                setPeriodic(async () => {
                    await this.emitHeads();
                }, 1000),
            );
            this.debug('starting-ch-sync');
            this.threads.push(
                setPeriodic(async () => {
                    await this.syncChannels();
                }, 2000),
            );
        }
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
            return; // FIXME: ignore leaves for now
            // const peer = this.peers.get(peerId);
            // if (!peer) {
            //     return;
            // }
            // peer.sockets.delete(channel.id);
            // peer.channels.delete(channel.id);
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
                        playerName: '',
                    };
                    await this.db.peers.put(info);
                }
                peer = new Peer({
                    pk,
                    sockets: new Map(),
                    channels: new Map(),
                    client: this,
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
        // include the parent too for good measure, double the bandwidth, double the fun
        acks.forEach((ack) => {
            this.recentlyAckedMessage.set(
                Buffer.from(ack).toString('hex'),
                true,
            );
        });
        // if (this.parentParent) {
        //     this.send(
        //         {
        //             type: PacketType.MESSAGE,
        //             msgs: [this.parentParent],
        //         },
        //         {
        //             ttl: 1000,
        //         },
        //     );
        // }
        // if (this.parent) {
        //     this.send(
        //         {
        //             type: PacketType.MESSAGE,
        //             msgs: [this.parent],
        //         },
        //         {
        //             ttl: 1000,
        //         },
        //     );
        // }
        this.send(
            {
                type: PacketType.MESSAGE,
                msgs: [signed],
            },
            {
                ttl: 1000,
            },
        );
        this.parentParent = this.parent;
        this.parent = signed;
        setTimeout(() => {
            this.send(
                {
                    type: PacketType.MESSAGE,
                    msgs: [signed],
                },
                {
                    ttl: 500,
                },
            );
        }, 40);
        return signed;
    }

    async sign(msg: PresignedMessage): Promise<Message> {
        // const hash = await this.hash(msg);
        // const sig = sodium.crypto_sign_detached(
        //     Buffer.from(hash),
        //     Buffer.from(this.key),
        // );
        const sig = Buffer.from(`${this.shortId}-${msg.height}`);
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

    async verify(_msg: Message): Promise<boolean> {
        return true;
        // try {
        //     const { sig, ...unsigned } = msg;
        //     const hash = await this.hash(unsigned);
        //     const pk = msg.peer;
        //     return sodium.crypto_sign_verify_detached(sig, hash, pk);
        // } catch (err) {
        //     console.error(`
        //         verify-error
        //         msg=${msg}
        //         err=${err}
        //     `);
        //     return false;
        // }
    }

    async hash(msg: PresignedMessage): Promise<Uint8Array> {
        const values = [
            msg.peer,
            msg.parent,
            msg.height,
            msg.type,
            msg.acks,
            (msg as any).data || 0,
            (msg as any).round || 0,
            (msg as any).channel || 0,
        ];
        const data = JSON.stringify(values);
        // FIXME: is "BYTES_MIN" enough?
        return sodium.crypto_generichash(
            sodium.crypto_generichash_BYTES_MIN,
            data,
        );
    }

    private onPacket = async (packet: Packet) => {
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
    };

    onMessages = async (msgs: Message[]): Promise<Message[]> => {
        for (const msg of msgs) {
            await this.onMessage(msg);
        }
        return msgs;
    };

    onMessage = async (msg: Message): Promise<void> => {
        // ignore messages we have seen recently
        const msgId = Buffer.from(msg.sig).toString('hex');
        const seen = this.recentlyProcessedMessage.get(msgId);
        if (seen) {
            // this.debug('drop-message-recently-seen', msgId.slice(0, 8));
            return;
        }
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
            this.recentlyProcessedMessage.set(msgId, true);
        }

        // do we have this message's parent?
        const parentSig = msg.parent;
        if (parentSig) {
            const parent = await this.db.messages.get(parentSig);
            if (!parent) {
                this.requestMissingParent(msg).catch((err) =>
                    console.error('quick-req-missing-parent-error', err),
                );
            }
        }

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
        // if channel peers has changed update it
        if (
            channel.peers.length !== msg.peers.length ||
            !msg.peers.every((p) =>
                channel.peers.includes(Buffer.from(p).toString('hex')),
            )
        ) {
            await this.db.channels.update(channel.id, {
                peers: msg.peers.map((p) => Buffer.from(p).toString('hex')),
            });
        }
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
        this.debug(
            `req-missing asking=everyone missing=${parentId.slice(0, 8)}`,
        );
        this.recentlyRequestedMessage.set(parentId, true);
        await this.rpc({
            name: 'requestMessagesBySig',
            timestamp: Date.now(),
            args: {
                sig: child.parent,
            },
        });
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
        for (const head of heads) {
            // tell everyone about the heads
            // console.log('peersendhead', ch.shortId);
            this.send(
                {
                    type: PacketType.MESSAGE,
                    msgs: [head],
                },
                { ttl: 1000 },
            );
        }
        this.debug(`emit-peer-heads count=${heads.length}`);
    }

    private checkChain = async (peerId: string) => {
        const pk = Buffer.from(peerId, 'hex');
        this.debug(`checking-chain peer=${peerId.slice(0, 8)}`);
        let child = await this.db.messages
            .where(['peer', 'height'])
            .between([pk, Dexie.minKey], [pk, Dexie.maxKey])
            .last();
        if (!child) {
            this.debug(`no-chain-yet peer=${peerId.slice(0, 8)}`);
            return;
        }
        const prevVerified = this.verifiedHeight.get(peerId) || -1;
        const tip = child.height;
        for (;;) {
            if (!child) {
                throw new Error('invalid value for child');
            }
            if (!child.parent) {
                this.debug(`full-chain-ok! peer=${peerId.slice(0, 8)}`);
                this.verifiedHeight.set(peerId, tip);
                await this.db.peers.update(peerId, {
                    validHeight: tip,
                });
                return;
            }
            if (child.height <= prevVerified) {
                this.debug(`updated-chain-ok! peer=${peerId.slice(0, 8)}`);
                this.verifiedHeight.set(peerId, tip);
                await this.db.peers.update(peerId, {
                    validHeight: tip,
                });
                return;
            }
            const parent = await this.db.messages.get(child.parent);
            if (!parent) {
                this.debug(
                    `chain-broken at=${child.height - 1} peer=${peerId.slice(0, 8)}`,
                );
                await this.requestMissingParent(child);
                return;
            }
            child = parent;
        }
    };

    private async syncChannels() {
        for (const [_, ch] of this.channels) {
            if (typeof ch.id !== 'string') {
                console.warn('ignoring invalid channel id', ch);
                continue;
            }
            // send channel keep alive
            // see channel.ts ... this is a workaround for a bug
            // and also how player names get broadcasted... (lol)

            const connectedPeers = (await this.db.peers.toArray()).filter(
                (p) => p.lastSeen > Date.now() - 6000,
            );
            const settings = await this.db.settings.get(1);
            await ch.emit(
                'bytes',
                Buffer.from(
                    cbor.encode({
                        type: PacketType.KEEP_ALIVE,
                        peer: this.id,
                        timestamp: Date.now(),
                        sees: connectedPeers.map((p) =>
                            Buffer.from(p.peerId.slice(0, 8), 'hex'),
                        ),
                        playerName: settings?.name || '',
                    }),
                ),
                {
                    ttl: 1000,
                },
            );
            // this.debug('keep-alive');
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
                    ).catch((err) => {
                        console.error('emit-genesis-error', err);
                    });
                }
            }
            const socketPeers = Array.from(ch.socket.peers.keys())
                .map((peerId) => peerId.slice(0, 8))
                .sort()
                .join(',');
            const ourPeers = connectedPeers
                .map((p) => p.peerId.slice(0, 8))
                .sort()
                .join(',');
            const alivePeers = Array.from(ch.alivePeerIds.keys())
                .map((peerId) => peerId.slice(0, 8))
                .sort()
                .join(',');
            const lastKnowPeers = Array.from(ch.lastKnowPeers.keys())
                .map((peerId) => peerId.slice(0, 8))
                .sort()
                .join(',');
            const netPeers = Array.from(this.net.socket._peer.peers.keys())
                .map((peerId) => peerId.slice(0, 8))
                .sort()
                .join(',');
            this.debug(`
                peer-info
                socketPeers=${socketPeers}
                ourPeers=${ourPeers}
                alivePeers=${alivePeers}
                lastKnowPeers=${lastKnowPeers}
                netPeers=${netPeers}
            `);
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
                    } else {
                        this.debug('no-set-peers', ch.id);
                    }
                }
                // check we have the peer set
            } else {
                this.debug('NO CHANNEL FOR ID', ch.id);
            }
            // check each channel peer chain
            if (info?.peers) {
                for (const peerId of info.peers) {
                    await this.checkChain(peerId);
                }
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
        req: Omit<SocketRPCRequest, 'sender'>,
    ): Promise<any> => {
        const r: SocketRPCGetMessagesByHeight = {
            ...req,
            sender: this.peerId,
        };
        for (const [_, ch] of this.channels) {
            await ch.emit(`rpc`, Buffer.from(cbor.encode(r)), {
                ttl: 1000,
            });
        }
    };

    private onRPCRequest = bufferedCall(async (b: Uint8Array) => {
        const req = cbor.decode(Buffer.from(b)) as SocketRPCRequest;
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
        await handler(req.args as any);
    }, 5);

    private getRequestHandler = (name: SocketRPCRequest['name']) => {
        switch (name) {
            case 'requestMessagesBySig':
                return this.requestMessagesBySig;
            default:
                return null;
        }
    };

    private requestMessagesBySig = async ({
        sig,
    }: {
        sig: Uint8Array;
    }): Promise<number> => {
        const msg = await this.db.messages.get(sig);
        if (!msg) {
            return 0;
        }
        this.debug(
            `res-missing sent=${Buffer.from(msg.sig).toString('hex').slice(0, 8)}`,
        );
        this.send(
            {
                type: PacketType.MESSAGE,
                msgs: [msg],
            },
            { ttl: 1000 },
        );
        return 1;
    };

    send = (packet: Packet, opts?: TransportEmitOpts) => {
        for (const [_, ch] of this.channels) {
            ch.send(packet, opts).catch((err) => {
                console.error('send-err:', err);
            });
        }
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
