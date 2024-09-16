import { LRUCache } from 'lru-cache';
import type { Buffer } from 'socket:buffer';
import { Channel } from './channels';
import type { Client } from './client';
import { SocketPeer } from './network';
import { Packet } from './transport';
import { CancelFunction } from './utils';

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

    getSocket(): SocketPeer | undefined {
        return Array.from(this.sockets.values())[0];
    }

    async destroy() {
        this.threads.forEach((cancel) => cancel());
    }
}
