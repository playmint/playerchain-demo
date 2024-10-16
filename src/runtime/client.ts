import * as cbor from 'cbor-x';
import * as Comlink from 'comlink';
import Dexie from 'dexie';
import _sodium from 'libsodium-wrappers';
import { Buffer } from 'socket:buffer';
import { Encryption } from 'socket:latica';
import { Channel, ChannelInfo, EmitOpts } from './channels';
import database, {
    DB,
    StoredChainMessage,
    StoredMessage,
    Tape,
    fromStoredChainMessage,
    toStoredChainMessage,
} from './db';
import {
    ChainMessage,
    CreateChannelMessage,
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
import { CancelFunction, setPeriodic } from './utils';

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

const DEFAULT_TTL = 60 * 1000; // people's clocks are really bad, this is less of a TTL and more of an acceptable range of clock skew

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
    parent: string | null = null;
    committing: boolean = false;
    channels: Map<string, Channel> = new Map();
    threads: CancelFunction[] = [];
    verifiedHeight: Map<string, number> = new Map();
    _ready: null | Promise<void>;
    enableSync: boolean;
    missingGate: Map<string, number> = new Map();
    channelPeerIds: string[] = [];

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
            // dgram: config.dgram,
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
                    await this.sync();
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
                .between(
                    [this.peerId, Dexie.minKey],
                    [this.peerId, Dexie.maxKey],
                )
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
            parent: this.parent
                ? (Buffer.from(this.parent, 'base64') as unknown as Uint8Array)
                : null,
        };
        const [signed, id] = await this.sign(attest);
        await this.onMsg(signed, id, channelId);
        this.send(signed, {
            ttl: DEFAULT_TTL,
        });
        setTimeout(() => {
            this.send(signed, {
                ttl: DEFAULT_TTL,
            });
        }, 10);
        if (typeof signed.height !== 'number') {
            throw new Error('signed-invalid-height');
        }
        this.height = signed.height + 1;
        this.parent = id;
        return signed;
    }

    commitQueue: [ChainMessage, string | null][] = [];
    commitTimer: null | any = null;
    async enqueue(msg: ChainMessage, channelId: string | null) {
        this.commitQueue.push([msg, channelId]);
        this.dequeueCommit();
        return this.commitQueue.length;
    }
    dequeueCommit() {
        if (this.commitQueue.length === 0) {
            return;
        }
        if (this.commitTimer) {
            return;
        }
        this.commitTimer = setTimeout(async () => {
            const queue = [...this.commitQueue];
            this.commitQueue = [];
            for (const [msg, channelId] of queue) {
                try {
                    await this.commit(msg, channelId);
                } catch (err) {
                    console.error('enqueue-commit-error', err);
                }
            }
            this.commitTimer = null;
            if (this.commitQueue.length > 0) {
                this.dequeueCommit();
            }
        }, 0);
    }

    // returns the signed message and the id
    async sign(msg: ChainMessage): Promise<[ChainMessage, string]> {
        await _sodium.ready;
        const sodium = _sodium;
        const hash = await this.hash(msg);
        const id = Buffer.from(hash.slice(0, 8)).toString('base64');
        const sig = sodium.crypto_sign_detached(
            Buffer.from(hash) as unknown as Uint8Array,
            Buffer.from(this.key) as unknown as Uint8Array,
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
    async verify(msg: ChainMessage): Promise<[true, string] | [false, null]> {
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
            const id = Buffer.from(hash.slice(0, 8)).toString('base64');
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
            Buffer.from(msg.peer).toString('hex'),
            msg.parent ? Buffer.from(msg.parent).toString('base64') : null,
            msg.height,
            msg.type,
            msg.acks
                ? msg.acks.map((a) => Buffer.from(a).toString('base64'))
                : [],
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

    messageQueue: [Message, string, string | null][] = [];
    messageTimer: null | any = null;
    enqueueMessage(m: Message, id: string, channelId: string | null) {
        if (!this.messageQueue.some((q) => q[1] === id)) {
            this.messageQueue.push([m, id, channelId]);
        }
        this.dequeueMessage();
    }
    dequeueMessage() {
        if (this.messageQueue.length === 0) {
            return;
        }
        if (this.messageTimer) {
            return;
        }
        this.messageTimer = setTimeout(async () => {
            if (this.channelPeerIds.length === 0) {
                this.debug('not ready to process messages yet');
            } else {
                const queue = [...this.messageQueue];
                this.messageQueue = [];
                await this.processMessages(queue);
            }
            this.messageTimer = null;
            if (this.messageQueue.length > 0) {
                this.dequeueMessage();
            }
        }, 10);
    }

    ackQueue: [StoredChainMessage, string, string][] = [];
    ackTimer: null | any = null;
    enqueueAck(m: StoredChainMessage, id: string, channelId: string) {
        if (!this.ackQueue.some((q) => q[1] === id)) {
            this.ackQueue.push([m, id, channelId]);
        }
        this.dequeueAck();
    }
    dequeueAck() {
        if (this.ackQueue.length === 0) {
            return;
        }
        if (this.ackTimer) {
            return;
        }
        this.ackTimer = setTimeout(async () => {
            if (this.channelPeerIds.length === 0) {
                this.debug('not ready to process acks yet');
            } else {
                const queue = [...this.ackQueue];
                this.ackQueue = [];
                const tapes = [];
                for (const [m, id, channelId] of queue) {
                    await this.updateAcks(m, id, channelId, tapes);
                }
            }
            this.ackTimer = null;
            if (this.ackQueue.length > 0) {
                this.dequeueAck();
            }
        }, 100);
    }

    async getMessage(id: string, messages?: StoredMessage[]) {
        const m = messages?.find((m) => m.id === id);
        if (m) {
            return m;
        }
        return this.db.messages.get(id);
    }

    private onMsg = async (
        m: Message,
        id: string,
        channelId: string | null,
    ) => {
        if (m.type === MessageType.KEEP_ALIVE) {
            return;
        } else if (m.type === MessageType.CREATE_CHANNEL) {
            await this.db.messages.put(
                toStoredChainMessage(
                    m,
                    id,
                    this.nextSequenceNumber(),
                    channelId,
                ),
            );
            await this.onCreateChannel(m);
        } else if (m.type === MessageType.SET_PEERS) {
            if (!channelId) {
                return;
            }
            await this.db.messages.put(
                toStoredChainMessage(
                    m,
                    id,
                    this.nextSequenceNumber(),
                    channelId,
                ),
            );
            await this.onSetPeers(m, channelId);
        } else {
            this.enqueueMessage(m, id, channelId);
        }
    };

    private processMessages = async (
        queue: [Message, string, string | null][],
    ) => {
        const messages: StoredMessage[] = [];
        for (const [m, id, channelId] of queue) {
            // ignore keep alive messages
            // these are (weirdly) being handled in the channel
            if (m.type === MessageType.KEEP_ALIVE) {
                continue;
            }
            messages.push(
                toStoredChainMessage(
                    m,
                    id,
                    this.nextSequenceNumber(),
                    channelId,
                    // [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                ),
            );
            // process it
            switch (m.type) {
                case MessageType.INPUT:
                    if (!channelId) {
                        this.debug('input-missing-channel-id', m);
                        continue;
                    }
                    // do we have this message's parent?
                    if (m.parent) {
                        const parentId = Buffer.from(m.parent).toString(
                            'base64',
                        );
                        const parent = await this.getMessage(
                            parentId,
                            messages,
                        );
                        if (!parent) {
                            setTimeout(async () => {
                                let gap = 0;
                                if (typeof m.height === 'number') {
                                    const peerId = Buffer.from(m.peer).toString(
                                        'hex',
                                    );
                                    const messageAfterGap =
                                        await this.db.messages
                                            .where(['peer', 'height'])
                                            .between(
                                                [peerId, Dexie.minKey],
                                                [peerId, m.height],
                                            )
                                            .last();
                                    gap = messageAfterGap
                                        ? m.height - 2 - messageAfterGap.height
                                        : 0;
                                }
                                this.requestMissingParent(parentId, gap).catch(
                                    (err) =>
                                        console.error(
                                            'quick-req-missing-parent-error',
                                            err,
                                        ),
                                );
                            }, 0);
                        }
                    }
                    break;
                case MessageType.CREATE_CHANNEL:
                    await this.onCreateChannel(m);
                    break;
                case MessageType.SET_PEERS:
                    if (!channelId) {
                        this.debug('set-peers-missing-channel-id', m);
                        continue;
                    }
                    await this.onSetPeers(m, channelId);
                    break;
                default:
                    this.debug('unhandled-msg', m);
                    return;
            }
        }
        // write in bulk
        if (messages.length > 0) {
            // this.debug('write-messages', messages);
            await this.db.messages.bulkPut(messages);
        }
        // process the tapes
        const tapes: Tape[] = [];
        for (const m of messages) {
            if (m.type === MessageType.INPUT && m.channel) {
                await this.processTapes(m, m.id, m.channel, tapes);
            }
        }
        if (tapes.length > 0) {
            // this.debug('write-tapes', tapes);
            await this.db.tapes.bulkPut(
                tapes.map((t) => {
                    t.updated = this.nextSequenceNumber();
                    return t;
                }),
            );
        }
    };

    async processTapes(
        m: StoredChainMessage,
        id: string,
        channelId: string,
        updatedTapes: Tape[],
    ): Promise<Tape[]> {
        if (m.type !== MessageType.INPUT) {
            return [];
        }
        if (this.channelPeerIds.length === 0) {
            throw new Error('channel-peers-not-set-yet');
        }
        let needsUpdate = false;
        let tape = updatedTapes.find(
            (t) => t.round === m.round && t.channel === channelId,
        );
        if (!tape) {
            tape = await this.db.tapes
                .where(['channel', 'round'])
                .equals([channelId, m.round])
                .first();
        }
        if (!tape) {
            tape = {
                channel: channelId,
                round: m.round,
                ids: new Array(this.channelPeerIds.length)
                    .fill(null)
                    .map(() => ''),
                inputs: new Array(this.channelPeerIds.length).fill(-1),
                acks: new Array(this.channelPeerIds.length)
                    .fill(null)
                    .map(() => []),
                final: false,
                updated: 0,
            };
            needsUpdate = true;
        }
        // update the tape with the new input
        if (this.channelPeerIds.length !== tape.ids.length) {
            throw new Error('invalid-tape-length');
        }
        const peerIndex = this.channelPeerIds.indexOf(m.peer);
        if (peerIndex === -1) {
            this.debug('input-from-unknown-peer', m.peer);
            return updatedTapes;
        }
        if (tape.ids[peerIndex] !== id) {
            tape.ids[peerIndex] = id;
            tape.inputs[peerIndex] = m.data;
            needsUpdate = true;
        }
        if (needsUpdate && !updatedTapes.some((t) => t === tape)) {
            updatedTapes.push(tape);
        }
        // does this message ack a message in another tape
        if (m.acks) {
            await this.updateAcks(m, id, channelId, updatedTapes);
        }
        return updatedTapes;
    }

    async updateAcks(
        m: StoredChainMessage,
        id: string,
        channelId: string,
        updatedTapes: Tape[],
    ) {
        if (!m.acks) {
            return;
        }
        for (const ackId of m.acks) {
            let needsUpdate = false;
            const acked = await this.db.messages.get(ackId);
            if (!acked) {
                this.debug('enqueuing-ack-as-target-not-available', ackId);
                this.enqueueAck(m, id, channelId);
                continue;
            }
            if (acked.type !== MessageType.INPUT) {
                continue;
            }
            let tape = updatedTapes.find(
                (t) => t.round === acked.round && t.channel === channelId,
            );
            if (!tape) {
                tape = await this.db.tapes
                    .where(['channel', 'round'])
                    .equals([channelId, acked.round])
                    .first();
            }
            if (!tape) {
                tape = {
                    channel: channelId,
                    round: acked.round,
                    ids: new Array(this.channelPeerIds.length)
                        .fill(null)
                        .map(() => ''),
                    inputs: new Array(this.channelPeerIds.length).fill(-1),
                    acks: new Array(this.channelPeerIds.length)
                        .fill(null)
                        .map(() => []),
                    final: false,
                    updated: 0,
                };
                needsUpdate = true;
            }
            const ackedIndex = this.channelPeerIds.indexOf(acked.peer);
            if (ackedIndex === -1) {
                this.debug('ack-from-unknown-peer', acked.peer);
                continue;
            }
            if (!tape.acks[ackedIndex].some((a) => a === id)) {
                tape.acks[ackedIndex].push(id);
                needsUpdate = true;
            }
            if (needsUpdate && !updatedTapes.some((t) => t === tape)) {
                updatedTapes.push(tape);
            }
        }
    }

    async onSetPeers(msg: SetPeersMessage, channelId: string) {
        // TODO: implement checking that SET_PEERS is from same peer as CREATE_CHANNEL
        const channel = await this.db.channels.get(channelId);
        if (!channel) {
            this.debug('set-peers-unknown-channel', channelId);
            return;
        }
        // if channel peers has changed update it
        this.channelPeerIds = msg.peers
            .map((p) => Buffer.from(p).toString('hex'))
            .sort((a, b) => (a < b ? -1 : 1));
        if (
            channel.peers.length !== msg.peers.length ||
            !msg.peers.every((p) =>
                channel.peers.includes(Buffer.from(p).toString('hex')),
            )
        ) {
            await this.db.channels.update(channel.id, {
                peers: this.channelPeerIds,
            });
        }
    }

    async requestMissingParent(parentId: string, gap?: number) {
        if (!parentId) {
            return;
        }
        // don't spam missing requests, gate them
        const gate = this.missingGate.get(parentId);
        if (gate) {
            return;
        }
        this.missingGate.set(parentId, 2);
        const exists = await this.db.messages.get(parentId);
        if (exists) {
            return;
        }
        this.debug(
            `req-missing asking=everyone missing=${parentId.slice(0, 8)} gap=${gap}`,
        );
        await this.rpc({
            name: 'requestMessagesById',
            timestamp: Date.now(),
            args: {
                id: parentId,
                gap: gap || 0,
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
        const peerIds = (await this.db.peers.toArray()).map((p) => p.peerId);
        peerIds.unshift(this.peerId);
        for (const peerId of peerIds) {
            const head = await this.db.messages
                .where(['peer', 'height'])
                .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
                .last();
            if (!head) {
                continue;
            }
            heads.push(fromStoredChainMessage(head));
        }
        return heads;
    }

    private async emitHeads() {
        // collect all the heads
        const heads = await this.getHeads();
        for (const head of heads) {
            // tell everyone about the heads
            this.send(head, { ttl: DEFAULT_TTL });
        }
        this.debug(`emit-peer-heads count=${heads.length}`);
    }

    private checkChain = async (peerId: string) => {
        this.debug(`checking-chain peer=${peerId.slice(0, 8)}`);
        let child = await this.db.messages
            .where(['peer', 'height'])
            .between([peerId, Dexie.minKey], [peerId, Dexie.maxKey])
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
                const messageAfterGap = await this.db.messages
                    .where(['peer', 'height'])
                    .between([peerId, Dexie.minKey], [peerId, child.height])
                    .last();
                const gap = messageAfterGap
                    ? child.height - 2 - messageAfterGap.height
                    : 0;
                this.debug(
                    `chain-broken at=${child.height - 1} gap=${gap} peer=${peerId.slice(0, 8)}`,
                );
                await this.requestMissingParent(child.parent, gap);
                return;
            }
            child = parent;
        }
    };

    private async sync() {
        // decement the gates
        for (const [k, v] of this.missingGate) {
            const gate = v - 1;
            if (gate <= 0) {
                this.missingGate.delete(k);
            } else {
                this.missingGate.set(k, gate);
            }
        }
        // update channels
        for (const [_, ch] of this.channels) {
            if (typeof ch.id !== 'string') {
                this.debug('ignoring invalid channel id', ch);
                continue;
            }
            const info = await this.db.channels.get(ch.id);
            if (info) {
                if (info.peers.length === 0) {
                    // emit the channel genesis message if we have it
                    const genesis = await this.db.messages
                        .where('sig')
                        .equals(ch.id)
                        .first();
                    if (genesis) {
                        if (genesis.type === MessageType.CREATE_CHANNEL) {
                            if (ch.name === '') {
                                ch.name = genesis.name;
                                await this.db.channels.update(ch.id, {
                                    name: genesis.name,
                                    creator: genesis.peer,
                                });
                            }
                            this.debug(
                                'emit-genesis',
                                genesis.sig.slice(0, 10),
                            );
                            ch.send(fromStoredChainMessage(genesis), {
                                channels: [ch.id],
                                ttl: DEFAULT_TTL,
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
                    if (setPeers) {
                        const msg = fromStoredChainMessage(setPeers);
                        if (msg.type === MessageType.SET_PEERS) {
                            await this.onSetPeers(msg, ch.id);
                        } else {
                            this.debug('invalid-set-peers', ch.id);
                        }
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
        if (this.channelPeerIds.length !== info.peers.length) {
            this.channelPeerIds = info.peers
                .map((p) => Buffer.from(p).toString('hex'))
                .sort((a, b) => (a < b ? -1 : 1));
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
            await subcluster.set('onRPC', Comlink.proxy(this.onRPCRequest));
            channel = new Channel({
                id: config.id,
                client: this,
                subcluster,
                name: config.name || '',
                onMsg: this.onMsg,
            });
            this.debug(`monitor-channel chid=${config.id.slice(0, 6)}`);
        }
        this.channels.set(config.id, channel);
    }

    async joinChannel(channelId: string) {
        if (typeof channelId !== 'string') {
            throw new Error('join-channel-fail: err=channel-id-must-be-string');
        }
        const cfg = await this.updateChannelConfig(channelId);
        await this.monitorChannel(cfg);
    }

    async createChannel(name: string): Promise<string> {
        const msg: CreateChannelMessage = {
            type: MessageType.CREATE_CHANNEL,
            name,
        };
        const commitment = await this.commit(msg, null);
        if (commitment.type !== MessageType.CREATE_CHANNEL) {
            throw new Error('commitment-type-mismatch');
        }
        if (!commitment.sig) {
            throw new Error('commitment-sig-missing');
        }
        const channelId = Buffer.from(commitment.sig).toString('base64');
        await this.joinChannel(channelId);
        await this.onCreateChannel(commitment);
        await this.commit(
            {
                type: MessageType.INPUT,
                round: 1, //(Date.now() + 100) / 50,
                data: 0,
            },
            channelId,
        );
        return channelId;
    }

    async setPeers(channelId: string, peers: string[]) {
        const msg: SetPeersMessage = {
            type: MessageType.SET_PEERS,
            peers: peers
                .sort()
                .map((p) => Buffer.from(p, 'hex') as unknown as Uint8Array),
        };
        await this.commit(msg, channelId);
        await this.onSetPeers(msg, channelId);
    }

    private debug(..._args: any[]) {
        // console.log(`[client/${this.shortId}]`, ..._args);
    }

    async getHeight(): Promise<number> {
        return (
            (
                await this.db.messages
                    .where(['peer', 'height'])
                    .between(
                        [this.peerId, Dexie.minKey],
                        [this.peerId, Dexie.maxKey],
                    )
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
            await ch.emit(
                `rpc`,
                Buffer.from(cbor.encode(r)) as unknown as Uint8Array,
                {
                    ttl: DEFAULT_TTL,
                },
            );
        }
    };

    private onRPCRequest = async (b: Buffer) => {
        const req = cbor.decode(
            Buffer.from(b) as unknown as Uint8Array,
        ) as SocketRPCRequest;
        if (req.sender === this.peerId) {
            // don't answer own requests!
            return;
        }
        if (!req.name) {
            this.debug('RPC: drop: invalid no name');
            return;
        }
        if (
            !req.timestamp ||
            typeof req.timestamp !== 'number' ||
            req.timestamp < Date.now() - DEFAULT_TTL
        ) {
            this.debug('RPC: drop: too old', req.timestamp);
            return;
        }
        const handler = this.getRequestHandler(req.name);
        if (!handler) {
            this.debug('RPC: drop: no handler for name ', req.name);
            return;
        }
        await handler(req.args as any);
    };

    private getRequestHandler = (name: SocketRPCRequest['name']) => {
        switch (name) {
            case 'requestMessagesById':
                return this.requestMessagesById;
            default:
                return null;
        }
    };

    private requestMessagesById = async ({
        id,
        gap,
    }: {
        id: string;
        gap: number;
    }): Promise<number> => {
        const msg = await this.db.messages.get(id);
        if (!msg) {
            return 0;
        }
        if (gap) {
            const gapMessages = await this.db.messages
                .where(['peer', 'height'])
                .between([msg.peer, msg.height - gap], [msg.peer, msg.height])
                .limit(50)
                .toArray();
            for (const gapMsg of gapMessages) {
                this.send(fromStoredChainMessage(gapMsg), { ttl: DEFAULT_TTL });
            }
        }
        this.send(fromStoredChainMessage(msg), { ttl: DEFAULT_TTL });
        return 1;
    };

    send = (m: Message, opts?: EmitOpts) => {
        for (const [_, ch] of this.channels) {
            ch.send(m, opts).catch((err) => {
                console.error('client-send-err:', err);
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
