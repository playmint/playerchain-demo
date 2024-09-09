import * as cbor from 'cbor-x';
import Dexie from 'dexie';
import { LRUCache } from 'lru-cache';
import type { Buffer } from 'socket:buffer';
import { Channel } from './channels';
import type { Client } from './client';
import { SocketPeer } from './network';
import { sleep } from './timers';
import { Packet, TransportEmitOpts } from './transport';
import { CancelFunction, bufferedCall, setPeriodic } from './utils';

export interface PeerConfig {
    pk: Uint8Array;
    sockets: Map<string, SocketPeer>;
    channels: Map<string, Channel>;
    client: Client;
    validHeight: number;
    knownHeight: number;
    lastSeen: number;
    onPacket?: (p: Packet) => void;
    Buffer: typeof Buffer;
}

export class Peer {
    pk: Uint8Array;
    id: string;
    client: Client;
    shortId: string;
    validHeight: number;
    knownHeight: number;
    requests: Map<number, (count: number) => void> = new Map();
    responses = new LRUCache<string, boolean>({
        max: 500,
        ttl: 1000 * 60 * 5,
    });
    threads: CancelFunction[] = [];
    sockets: Map<string, SocketPeer> = new Map();
    channels: Map<string, Channel> = new Map();
    Buffer: typeof Buffer;
    _onPacket?: (p: Packet) => void;

    constructor({
        pk,
        sockets,
        client,
        validHeight,
        knownHeight,
        onPacket,
        Buffer,
    }: PeerConfig) {
        this.Buffer = Buffer;
        this.pk = pk;
        this.id = Buffer.from(pk).toString('hex');
        this.shortId = this.id.slice(0, 8);
        this.validHeight = validHeight;
        this.knownHeight = knownHeight;
        this.client = client;
        this._onPacket = onPacket;
        this.sockets = sockets;
        this.threads.push(setPeriodic(this.save, 10000));
        this.threads.push(setPeriodic(this.checkChain, 1000));
    }

    private checkChain = async () => {
        const highest = await this.client.db.messages
            .where(['peer', 'height'])
            .between([this.pk, Dexie.minKey], [this.pk, Dexie.maxKey])
            .last();
        if (!highest) {
            // we are missing everything but somehow know about this peer?
            return;
        }
        this.knownHeight = highest.height;
        if (this.validHeight === highest.height) {
            return;
        }
        await this.repairPeerChain();
        await this.save();
    };

    private async repairPeerChain() {
        let breaks = 0;
        let validHeight = this.validHeight ?? -1;
        // get all the unconfirmed messages from this peer
        const [firstBlock, ...unconfirmed] = await this.client.db.messages
            .where(['peer', 'height'])
            .between([this.pk, validHeight], [this.pk, Dexie.maxKey])
            .toArray();
        if (!firstBlock) {
            // no messages to process, nothing to do
            console.log(`no-messages-to-repair peer=${this.shortId})}`);
            return;
        }
        // check we have the peer's genesis message
        if (validHeight <= 0) {
            if (firstBlock.parent == null) {
                validHeight = 0;
            } else {
                // we have a gap at the start of the chain
                console.log(
                    `${this.client.shortId} has gap-at-chain-start for peer=${this.shortId} missingheight=${0}`,
                );
                breaks++;
                await this.client.requestMissingParent(firstBlock);
            }
        }
        // walk the chain of parents until we get stuck
        let last = firstBlock;
        for (const msg of unconfirmed) {
            const prev = this.Buffer.from(last.sig).toString('hex');
            const parent = this.Buffer.from(msg.parent).toString('hex');
            if (parent !== prev) {
                // we have a gap in the chain
                // request the missing message
                breaks++;
                console.log(
                    `${this.client.shortId} has gap-in-peer-chain for peer=${this.shortId} missingheight=${(msg as any).height - 1}`,
                );
                await this.client.requestMissingParent(msg);
            } else if (breaks === 0 && msg.height !== last.height + 1) {
                // we have a gap in the chain height that wasn't caused by a missing parent
                // this is a serious error and likely means this chain/peer must be
                // ignored, since it cannot be repaired
                console.error(
                    `peer ${this.shortId} chain is fatally broken
                     expected msg.height=${msg.height} to be ${last.height + 1}
                     we have not implemented how to handle this case`,
                );
                // breaks++;
            }

            last = msg;
            if (breaks === 0) {
                validHeight = msg.height;
            }
        }
        // update the peer with the new valid height
        if (validHeight !== this.validHeight) {
            this.validHeight = validHeight;
            console.log(
                `new-valid-height peer=${this.shortId} height=${validHeight}`,
            );
        }
    }

    send = bufferedCall(
        async (packet: Packet, opts?: TransportEmitOpts) => {
            const buf = this.Buffer.from(cbor.encode(packet));
            return this.stream('bytes', buf, opts);
        },
        500,
        'send1',
    );

    // send2 and stream2 are used to seperate the rpc calls from the main data stream
    send2 = bufferedCall(
        async (packet: Packet, opts?: TransportEmitOpts) => {
            const buf = this.Buffer.from(cbor.encode(packet));
            return this.stream2('bytes2', buf, opts);
        },
        100,
        'send2',
    );

    stream = async (evt: string, buf: Buffer, opts?: TransportEmitOpts) => {
        for (const [_channelId, socket] of this.sockets) {
            // console.log(
            //     `SEND ${this.client.shortId} -> ${this.shortId} (${(buf as any).length}b) via ${channelId.slice(0, 8)}`,
            // );
            await socket.emit(evt, buf as any, opts);
            await sleep(1);
            return;
        }
    };

    stream2 = async (
        evt: string,
        buf: Uint8Array,
        opts?: TransportEmitOpts,
    ) => {
        for (const [_channelId, socket] of this.sockets) {
            // console.log(
            //     `SEND2 ${(buf as any).length} bytes to peer via ${channelId}`,
            // );
            await socket.emit(evt, buf as any, opts);
            await sleep(5);
            return;
        }
    };

    getSocket(): SocketPeer | undefined {
        return Array.from(this.sockets.values())[0];
    }

    private save = async () => {
        await this.client.db.peers.update(this.id, {
            validHeight: this.validHeight,
            knownHeight: this.knownHeight,
            channels: Array.from(this.sockets.keys()),
        });
    };

    async destroy() {
        this.threads.forEach((cancel) => cancel());
    }
}
