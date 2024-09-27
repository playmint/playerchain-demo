import * as cbor from 'cbor-x';
import Dexie from 'dexie';
import _sodium from 'libsodium-wrappers';
import { Buffer } from 'socket:buffer';
import { Encryption } from 'socket:latica';
import { Channel, ChannelInfo, EmitOpts } from './channels';
import database, { DB, MessageConfirmationMatrix, StoredMessage } from './db';
import {
    ChainMessage,
    CreateChannelMessage,
    InputMessage,
    Message,
    MessageType,
    SetPeersMessage,
} from './messages';
import {
    SocketNetwork,
    SocketRPCGetMessagesByHeight,
    SocketRPCRequest,
    createSocketCluster,
} from './network';
import { PeerConfig } from './network/Peer';
import { CancelFunction, bufferedCall, setPeriodic } from './utils';

export interface ClientKeys {
    publicKey: Uint8Array;
    privateKey: Uint8Array;
}

export interface ClientConfig {
    keys: ClientKeys;
    dbname: string;
    dgram: typeof import('node:dgram');
    clusterId: Uint8Array;
    config: PeerConfig;
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
    parent: Uint8Array | null = null;
    committing: boolean = false;
    channels: Map<string, Channel> = new Map();
    threads: CancelFunction[] = [];
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
        // unconnect the peers
        await this.db.peers.where({ connected: 1 }).modify({
            connected: 0,
        });
        // setup network
        this.debug('configuring-network');
        this.net = await createSocketCluster({
            db: this.db,
            keys: config.keys,
            clusterId: config.clusterId,
            config: config.config,
            dgram: config.dgram,
        });
        // this.net.socket.on('#disconnect', this.onPeerDisconnect);
        this.debug('starting-head-reporter');
        // on channel
        if (this.enableSync) {
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
        }
        // load any existing channels we know about
        this.debug('load-channels');
        const channels = await this.db.channels.toArray();
        for (const ch of channels) {
            await this.joinChannel(ch.id);
        }
        this.debug('init-ready');
    }

    // commit will sign, store and broadcast the message
    async commit(
        msg: ChainMessage,
        channelId: string | null,
    ): Promise<ChainMessage> {
        if (this.committing) {
            throw new Error('already-committing');
        }
        this.committing = true;
        return this._commit(msg, channelId).finally(() => {
            this.committing = false;
        });
    }

    private async _commit(
        msg: ChainMessage,
        channelId: string | null,
    ): Promise<ChainMessage> {
        if (this.height === null) {
            const latest = await this.db.messages
                .where(['peer', 'height'])
                .between([this.id, Dexie.minKey], [this.id, Dexie.maxKey])
                .last();
            if (!latest) {
                this.height = 0;
                this.parent = null;
            } else {
                if (typeof latest.height !== 'number') {
                    throw new Error('latest-height-missing');
                }
                this.height = latest.height + 1;
                this.parent = latest.id;
            }
        }
        // build the msg to attest to
        const attest: ChainMessage = {
            ...msg,
            peer: this.id,
            height: this.height,
            acks: msg.acks ?? [], // TODO: ask consensus system what to do
            parent: this.parent ? this.parent : null,
        };
        const [signed, id] = await this.sign(attest);
        const stored: StoredMessage = {
            ...signed,
            id,
            updated: this.nextSequenceNumber(),
            channel: channelId,
            confirmations: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        };
        await this.db.transaction(
            'rw',
            [this.db.messages, this.db.acks],
            async () => {
                await this.db.messages.add(stored);
                if (attest.acks) {
                    await this.updateAcks(attest, id);
                }
            },
        );
        if (typeof signed.height !== 'number') {
            throw new Error('signed-invalid-height');
        }
        this.height = signed.height + 1;
        this.send(signed, {
            ttl: 1000,
        });
        this.parent = id;
        setTimeout(() => {
            this.send(signed, {
                ttl: 1000,
            });
        }, 15);
        return signed;
    }

    // returns the signed message and the id
    async sign(msg: ChainMessage): Promise<[ChainMessage, Uint8Array]> {
        await _sodium.ready;
        const sodium = _sodium;
        const hash = await this.hash(msg);
        const id = hash.slice(0, 8);
        const sig = sodium.crypto_sign_detached(
            Buffer.from(hash),
            Buffer.from(this.key),
        );
        // const sig = Buffer.from(`${this.shortId}-${msg.height}`);
        // console.log('-----SIGN>', {
        //     sig: Buffer.from(sig).toString('hex'),
        //     hsh: Buffer.from(hash).toString('hex'),
        //     pub: Buffer.from(msg.peer).toString('hex'),
        // });
        return [
            {
                ...msg,
                sig,
            },
            id,
        ];
    }

    // verified the message and produce the message id
    // returns [true, id] if the message is verified
    // returns [false, null] if the message is not verified
    async verify(
        msg: ChainMessage,
    ): Promise<[true, Uint8Array] | [false, null]> {
        await _sodium.ready;
        const sodium = _sodium;
        // return true;
        try {
            const { sig, ...unsigned } = msg;
            if (!sig) {
                throw new Error('no-sig');
            }
            const hash = await this.hash(unsigned);
            const pk = msg.peer;
            if (!pk) {
                throw new Error('no-pk');
            }
            const ok = sodium.crypto_sign_verify_detached(sig, hash, pk);
            if (!ok) {
                return [false, null];
            }
            // 64bits of the hash is the id
            // FIXME: we should think about this carefully!
            // this truncation does not affect the signature, but it does affect
            // the acks which are based on the id ... the pool of ids is not global
            // as it is per peer set, so _some_ truncation here can be tollerated
            // but it is possible for collisions in the db, so we may need to
            // store the with a composite key of peer and id
            const id = hash.slice(0, 8);
            return [true, id];
        } catch (err) {
            console.error(`
                verify-error
                msg=${msg}
                err=${err}
            `);
            return [false, null];
        }
    }

    async hash(msg: ChainMessage): Promise<Uint8Array> {
        await _sodium.ready;
        const sodium = _sodium;
        const values = [
            msg.peer,
            msg.parent,
            msg.height,
            msg.type,
            msg.acks,
            (msg as any).data || 0,
            (msg as any).round || 0,
        ];
        const data = JSON.stringify(values);
        // FIXME: is "BYTES_MIN" enough?
        return sodium.crypto_generichash(
            sodium.crypto_generichash_BYTES_MIN,
            data,
        );
    }

    private onMsg = async (m: Message, channelId: string) => {
        // ignore keep alive messages
        // these are (weirdly) being handled in the channel
        if (m.type === MessageType.KEEP_ALIVE) {
            return;
        }
        // ignore own messages, assume we took care of those
        if (Buffer.from(m.peer).toString('hex') === this.peerId) {
            return;
        }
        // verify it
        const [verified, id] = await this.verify(m);
        if (!verified) {
            this.debug(
                'drop-message-verification-fail',
                Buffer.from(m.sig).toString('hex'),
            );
            return;
        }
        if (!id) {
            this.debug(
                'drop-message-no-id',
                Buffer.from(m.sig).toString('hex'),
            );
            return;
        }
        if (!m.sig) {
            this.debug(
                'drop-message-no-id',
                Buffer.from(m.sig).toString('hex'),
            );
            return;
        }
        if (m.type !== MessageType.INPUT) {
            // store it
            const existing = await this.db.messages.get(id);
            if (!existing) {
                await this.db.messages.put({
                    ...m,
                    updated: this.nextSequenceNumber(),
                    id,
                    channel: channelId,
                    confirmations: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                });
            }
        }
        // process it
        switch (m.type) {
            case MessageType.INPUT:
                await this.onInputMessage(m, channelId, id);
                return;
            case MessageType.CREATE_CHANNEL:
                await this.onCreateChannel(m);
                return;
            case MessageType.SET_PEERS:
                await this.onSetPeers(m, channelId);
                return;
            default:
                console.warn('unhandled-msg', m);
                return;
        }
    };

    async onInputMessage(
        msg: InputMessage,
        channelId: string,
        id: Uint8Array,
    ): Promise<void> {
        await this.db.transaction(
            'rw',
            [this.db.messages, this.db.acks],
            async () => {
                // store it
                const existing = await this.db.messages.get(id);
                if (!existing) {
                    await this.db.messages.put({
                        ...msg,
                        updated: this.nextSequenceNumber(),
                        id,
                        channel: channelId,
                        confirmations:
                            await this.calculateMessageConfirmations(id),
                    });
                }
                // do we have this message's parent?
                if (msg.parent) {
                    const parent = await this.db.messages.get(msg.parent);
                    if (!parent) {
                        this.requestMissingParent(msg).catch((err) =>
                            console.error(
                                'quick-req-missing-parent-error',
                                err,
                            ),
                        );
                    }
                }
                // updated acks
                // TODO: don't just blindly trust the acks are valid, ensure that each ack does not ack a message before a previous ack
                if (msg.acks) {
                    await this.updateAcks(msg, id);
                }
            },
        );
    }

    async updateAcks(msg: ChainMessage, id: Uint8Array) {
        if (!msg.acks) {
            return;
        }
        // write the acks to db
        await this.db.acks.bulkPut(
            msg.acks.map((ackId) => ({ from: id, to: ackId })),
        );
        // recalculate the confirmations for each acked message
        await Promise.all(
            msg.acks.map(async (ackId) => {
                const ackee = await this.updateMessageConfirmations(ackId);
                if (!ackee) {
                    return Promise.resolve(null);
                }
                // if the ackee confirmaiton changed, update the ackee's acks too
                if (ackee.acks) {
                    await Promise.all(
                        ackee.acks.map(
                            (ackAckId) =>
                                this.updateMessageConfirmations(ackAckId),
                            [] as Promise<StoredMessage>[],
                        ),
                    );
                }
            }),
        );
    }

    async updateMessageConfirmations(
        id: Uint8Array,
    ): Promise<StoredMessage | null> {
        const ackee = await this.db.messages.get(id);
        if (!ackee) {
            return null;
        }
        const confirmations = await this.calculateMessageConfirmations(id);
        if (ackee.confirmations.join(',') === confirmations.join(',')) {
            return ackee;
        }
        const updated: StoredMessage = {
            ...ackee,
            updated: this.nextSequenceNumber(),
            confirmations,
        };
        await this.db.messages.put(updated);
        return updated;
    }

    async calculateMessageConfirmations(
        id: Uint8Array,
    ): Promise<MessageConfirmationMatrix> {
        // lookup who acked this message
        const ackedBy = await Promise.all(
            (await this.db.acks.where('to').equals(id).toArray()).map(
                async (ack) => ({
                    from: ack.from,
                    to: ack.to,
                    acks: await this.db.acks
                        .where('to')
                        .equals(ack.from)
                        .count(),
                }),
            ),
        );
        // TODO: we MUST check that the ack is for the correct interlace

        // build a matrix of confirmation counts
        // a "confirmation" is an ack that is acked by another ack
        // ...but this is a weird structure isn't it...
        // we do not know what the "right" number of confirmations is
        // so instead we count a range of potential confirmations
        // confirmations[1] is the number of acks that are acked at least once
        // confirmation[2] is the number of acks that are acked at least twice
        // etc
        // this can be used later to decide if the message is accepted or rejected
        // for a given required number of confirmations (up to a group of 10)
        // everything caps out at 10 for other reasons so this is enough for now
        return (ackedBy || []).reduce(
            (c, ack) => {
                c[1] += ack.acks > 0 ? 1 : 0;
                c[2] += ack.acks > 1 ? 1 : 0;
                c[3] += ack.acks > 2 ? 1 : 0;
                c[4] += ack.acks > 3 ? 1 : 0;
                c[5] += ack.acks > 4 ? 1 : 0;
                c[6] += ack.acks > 5 ? 1 : 0;
                c[7] += ack.acks > 6 ? 1 : 0;
                c[8] += ack.acks > 7 ? 1 : 0;
                c[9] += ack.acks > 8 ? 1 : 0;
                return c;
            },
            [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as MessageConfirmationMatrix,
        );
    }

    async onSetPeers(msg: SetPeersMessage, channelId: string) {
        // TODO: implement checking that SET_PEERS is from same peer as CREATE_CHANNEL
        const channel = await this.db.channels.get(channelId);
        if (!channel) {
            console.warn('set-peers-unknown-channel', channelId);
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

    async requestMissingParent(child: ChainMessage) {
        if (!child.parent) {
            return;
        }
        const exists = await this.db.messages.get(child.parent);
        if (exists) {
            return;
        }
        const parentId = Buffer.from(child.parent).toString('hex');
        this.debug(
            `req-missing asking=everyone missing=${parentId.slice(0, 8)}`,
        );
        await this.rpc({
            name: 'requestMessagesBySig',
            timestamp: Date.now(),
            args: {
                id: child.parent,
            },
        });
    }

    // this is used to tag the order messages are received in
    // only guarentee is that it is larger than the last one
    // there may be gaps
    private nextSequenceNumber(): number {
        if (!this.seqNum) {
            this.seqNum = Date.now();
        }
        this.seqNum++;
        return this.seqNum;
    }

    private async onCreateChannel(msg: CreateChannelMessage) {
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

    private async emitHeads() {
        // collect all the heads
        const heads = await this.getHeads();
        for (const head of heads) {
            // tell everyone about the heads
            this.send(head, { ttl: 500 });
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
        if (typeof tip !== 'number') {
            throw new Error('invalid height');
        }
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
            if (typeof child.height !== 'number') {
                throw new Error('invalid height');
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

            const subclusterPeers = ch.subcluster.peers();
            const peerName = await this.db.peerNames.get(this.peerId);
            await ch.send(
                {
                    type: MessageType.KEEP_ALIVE,
                    peer: this.id,
                    timestamp: Date.now(),
                    sees: subclusterPeers.map((p) =>
                        Buffer.from(p.peerId.slice(0, 8), 'hex'),
                    ),
                    name: peerName?.name || '',
                },
                {
                    ttl: 1000,
                },
            );
            // sync channel name with genesis and rebroadcast it
            // const subclusterPeerIds = subclusterPeers
            //     .map((p) => p.peerId.slice(0, 8))
            //     .sort()
            //     .join(',');
            // const dbPeers = (await this.db.peers.toArray())
            //     .map((p) => p.peerId.slice(0, 8))
            //     .sort()
            //     .join(',');
            // const alivePeers = Array.from(ch.alivePeerIds.keys())
            //     .map((peerId) => peerId.slice(0, 8))
            //     .sort()
            //     .join(',');
            // const lastKnowPeers = Array.from(ch.lastKnowPeers.keys())
            //     .map((peerId) => peerId.slice(0, 8))
            //     .sort()
            //     .join(',');
            // const netPeers = Array.from(this.net.socket.peers.keys())
            //     .map((peerId) => peerId.slice(0, 8))
            //     .sort()
            //     .join(',');
            // this.debug(`
            //     peer-info
            //     subclusterPeers=${subclusterPeerIds}
            //     lastKnowPeers=${lastKnowPeers}
            //     alivePeers=${alivePeers}
            // `);
            const info = await this.db.channels.get(ch.id);
            if (info) {
                if (info.peers.length === 0) {
                    const channelSig = Uint8Array.from(atob(ch.id), (c) =>
                        c.charCodeAt(0),
                    );
                    // emit the channel genesis message if we have it
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
                                    creator: Buffer.from(genesis.peer).toString(
                                        'hex',
                                    ),
                                });
                            }
                            this.debug(
                                'emit-genesis',
                                Buffer.from(genesis.sig)
                                    .toString('hex')
                                    .slice(0, 10),
                            );
                            ch.send(genesis, {
                                channels: [ch.id],
                                ttl: 1000,
                            }).catch((err) => {
                                console.error('emit-genesis-error', err);
                            });
                        }
                    }
                    // try to find the SetPeers message
                    const setPeers = await this.db.messages
                        .where(['channel', 'type'])
                        .between(
                            [ch.id, MessageType.SET_PEERS],
                            [ch.id, MessageType.SET_PEERS],
                        )
                        .last();
                    if (setPeers && setPeers.type === MessageType.SET_PEERS) {
                        await this.onSetPeers(setPeers, ch.id);
                    } else {
                        this.debug('no-set-peers', ch.id);
                    }
                }
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
            const sharedKey = await Encryption.createSharedKey(id);
            const signingKeys = await Encryption.createKeyPair(sharedKey);
            const subclusterId = signingKeys.publicKey;
            const scid = Buffer.from(subclusterId).toString('base64');
            info = { id, name: '', peers: [], creator: '', scid };
            await this.db.channels.put(info);
        }
        return info;
    }

    private async monitorChannel(config: ChannelInfo) {
        let channel = this.channels.get(config.id);
        if (!channel) {
            this.debug('creating-channel', config.id);
            const sharedKey = await Encryption.createSharedKey(config.id);
            const subcluster = await this.net.socket.join({
                sharedKey,
            });
            subcluster.onRPC = this.onRPCRequest;
            channel = new Channel({
                id: config.id,
                client: this,
                subcluster,
                name: config.name || '',
                onMsg: this.onMsg,
                Buffer: Buffer,
            });
            this.debug(
                `monitor-channel chid=${config.id.slice(0, 6)} scid=${subcluster.scid.slice(0, 6)}`,
            );
        }
        this.channels.set(config.id, channel);
    }

    async joinChannel(channelId: string) {
        if (typeof channelId !== 'string') {
            throw new Error('join-channel-fail: err=channel-id-must-be-string');
        }
        const cfg = await this.updateChannelConfig(channelId);
        await this.monitorChannel(cfg);
        // FIXME: commit an empty input message, if we don't have one
        // we currently depend on this in the simulation but we really shouldn't!!
        if ((await this.db.messages.count()) === 0) {
            await this.commit(
                {
                    type: MessageType.INPUT,
                    round: 1, //(Date.now() + 100) / 50,
                    data: 0,
                },
                channelId,
            );
        }
    }

    async createChannel(name: string): Promise<string> {
        const msg: CreateChannelMessage = {
            type: MessageType.CREATE_CHANNEL,
            name,
        };
        const commitment = await this.commit(msg, null);
        if (!commitment.sig) {
            throw new Error('commitment-sig-missing');
        }
        const channelId = Buffer.from(commitment.sig).toString('base64');
        await this.commit(
            {
                type: MessageType.INPUT,
                round: 1, //(Date.now() + 100) / 50,
                data: 0,
            },
            channelId,
        );
        await this.joinChannel(channelId);
        return channelId;
    }

    async setPeers(channelId: string, peers: string[]) {
        const msg: SetPeersMessage = {
            type: MessageType.SET_PEERS,
            peers: peers.sort().map((p) => Buffer.from(p, 'hex')),
        };
        await this.commit(msg, channelId);
        await this.onSetPeers(msg, channelId);
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
                ttl: 100,
            });
        }
    };

    private onRPCRequest = bufferedCall(
        async (b: Buffer) => {
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
                req.timestamp < Date.now() - 2000
            ) {
                // ignore old requests
                return;
            }
            const handler = this.getRequestHandler(req.name);
            if (!handler) {
                return;
            }
            await handler(req.args as any);
        },
        5,
        'onRPCRequest',
    );

    private getRequestHandler = (name: SocketRPCRequest['name']) => {
        switch (name) {
            case 'requestMessagesBySig':
                return this.requestMessagesById;
            default:
                return null;
        }
    };

    private requestMessagesById = async ({
        id,
    }: {
        id: Uint8Array;
    }): Promise<number> => {
        const msg = await this.db.messages.get(id);
        if (!msg) {
            return 0;
        }
        this.send(msg, { ttl: 1000 });
        return 1;
    };

    send = (m: Message, opts?: EmitOpts) => {
        for (const [_, ch] of this.channels) {
            ch.send(m, opts).catch((err) => {
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
        for (const ch of this.channels.values()) {
            ch.destroy();
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
