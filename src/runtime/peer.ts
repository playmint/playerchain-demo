import * as cbor from 'cbor-x';
import { LRUCache } from 'lru-cache';
import type { Buffer } from 'socket:buffer';
import { Channel } from './channels';
import type { Client } from './client';
import { SocketPeer } from './network';
import { sleep } from './timers';
import { Packet, TransportEmitOpts } from './transport';
import { CancelFunction, bufferedCall } from './utils';

export interface PeerConfig {
    pk: Uint8Array;
    sockets: Map<string, SocketPeer>;
    channels: Map<string, Channel>;
    client: Client;
    lastSeen: number;
    onPacket?: (p: Packet) => void;
    Buffer: typeof Buffer;
}

export class Peer {
    pk: Uint8Array;
    id: string;
    client: Client;
    shortId: string;
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

    constructor({ pk, sockets, client, onPacket, Buffer }: PeerConfig) {
        this.Buffer = Buffer;
        this.pk = pk;
        this.id = Buffer.from(pk).toString('hex');
        this.shortId = this.id.slice(0, 8);
        this.client = client;
        this._onPacket = onPacket;
        this.sockets = sockets;
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

    async destroy() {
        this.threads.forEach((cancel) => cancel());
    }
}
