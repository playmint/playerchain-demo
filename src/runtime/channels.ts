import * as cbor from 'cbor-x';
import { Buffer } from 'socket:buffer';
import { Client } from './client';
import { Base64ID } from './messages';
import { SocketPeer, SocketSubcluster } from './network';
import {
    KeepAlivePacket,
    Packet,
    PacketType,
    TransportEmitOpts,
    unknownToPacket,
} from './transport';
import { CancelFunction, bufferedCall, setPeriodic } from './utils';

export type ChannelConfig = {
    id: string;
    name: string;
    socket: SocketSubcluster;
    onPeerJoin: (
        peer: SocketPeer,
        status: PeerStatus,
        channel: Channel,
    ) => void;
    onPeerLeave: (peerId: string, channel: Channel) => void;
    onPacket?: (packet: Packet) => void;
    client: Client;
    Buffer: typeof Buffer;
};

export interface ChannelInfo {
    id: Base64ID; // base64ified id that matches the commitment id of the CREATE_CHANNEL message
    name: string;
    creator: string; // peer id of the creator
    peers: string[];
}

export type PeerStatus = {
    connected: boolean;
    proxy: boolean;
};

export class Channel {
    id: string;
    shortId: string;
    client: Client;
    name: string = '';
    Buffer: typeof Buffer;
    socket: SocketSubcluster;
    threads: CancelFunction[] = [];
    _onPeerJoin?: (
        peer: SocketPeer,
        status: PeerStatus,
        channel: Channel,
    ) => void;
    _onPeerLeave?: (peerId: string, channel: Channel) => void;
    _onPacket?: (packet: Packet) => void;
    lastKnowPeers = new Map<string, PeerStatus>();
    alivePeerIds: Map<string, KeepAlivePacket> = new Map();

    constructor({
        id,
        client,
        socket,
        name,
        onPeerJoin,
        onPeerLeave,
        onPacket,
        Buffer,
    }: ChannelConfig) {
        this.Buffer = Buffer;
        this.id = id;
        this.shortId = id.slice(0, 8);
        this.name = name;
        this._onPeerJoin = onPeerJoin;
        this._onPeerLeave = onPeerLeave;
        this._onPacket = onPacket;
        this.socket = socket;
        this.client = client;
        socket.on('bytes', this.onChannelBytes);
        socket.on('bytes2', this.onChannelBytes2);
        // socket.on('#join', this.onPeerJoin); // this is broken
        this.threads.push(setPeriodic(this.updatePeers, 1000));
    }

    private updatePeers = async () => {
        // remove old alive tags
        for (const [peerId, keepAlive] of this.alivePeerIds.entries()) {
            if (Date.now() - keepAlive.timestamp > 6000) {
                this.alivePeerIds.delete(peerId);
            }
        }
        // check for removed peers
        for (const [peerId, _] of this.lastKnowPeers) {
            if (!this.socket.peers.has(peerId)) {
                this.lastKnowPeers.delete(peerId);
                this.onPeerLeave(peerId);
            }
        }
        // check for added peers
        for (const [_, peer] of this.socket.peers) {
            // since we can't trust the peer list from the network
            // we track keep alives to filter out invalid peers
            if (!this.alivePeerIds.has(peer.peerId)) {
                continue;
            }
            const connected = !!peer._peer?.connected;
            const proxy = !!peer._peer?.proxy;
            let status = this.lastKnowPeers.get(peer.peerId);
            if (!status) {
                status = { connected, proxy };
                this.lastKnowPeers.set(peer.peerId, status);
                this.onPeerJoin(peer, status);
            } else if (
                connected !== status.connected ||
                proxy !== status.proxy
            ) {
                this.onPeerJoin(peer, status);
            }
            // TODO: detect if peer has gone offline and call onPeerLeave?

            // console.log(`PEERINFO -->
            //     ${this.client.shortId}  <--[${this.id.slice(0, 4).toUpperCase()}]--> ${peer.peerId.slice(0, 8)}
            //         connected=${!!peer._peer?.connected}
            //         proxy=${!!peer._peer?.proxy}
            // `);
        }
    };

    private onPeerLeave = (peerId: string) => {
        if (!this._onPeerLeave) {
            return;
        }
        this._onPeerLeave(peerId, this);
    };

    private onPeerJoin = (peer: SocketPeer, status: PeerStatus) => {
        const ppp: any = peer;
        if (!ppp.__listening) {
            // peer.on('bytes', this.onChannelBytes);
            // peer.on('bytes2', this.onChannelBytes2);
            ppp.__listening = true;
        }
        if (!this._onPeerJoin) {
            return;
        }
        this._onPeerJoin(peer, status, this);
    };

    private onChannelBytes = bufferedCall(
        async (b: Uint8Array) => {
            if (!this._onPacket) {
                return;
            }
            const p = unknownToPacket(cbor.decode(this.Buffer.from(b)));
            if (p.type === PacketType.KEEP_ALIVE) {
                const peerId = Buffer.from(p.peer).toString('hex');
                const prev = this.alivePeerIds.get(peerId);
                if (prev && p.timestamp < prev.timestamp) {
                    console.log('IGNORING OLDER KEEPALIVE FOR PEER', peerId);
                    return;
                }
                // console.log('UPDATE ALIVE PEER', peerId);
                this.alivePeerIds.set(peerId, p);
                this.client.db.peers
                    .update(peerId, {
                        lastSeen: p.timestamp,
                        sees: p.sees.map((s) => Buffer.from(s).toString('hex')),
                    })
                    .catch((err) => {
                        console.error('update-peer-err:', err);
                    });
            } else {
                this._onPacket(p);
            }
        },
        1000,
        'onChannelBytes',
    );

    private onChannelBytes2 = bufferedCall(
        async (b: Uint8Array) => {
            if (!this._onPacket) {
                return;
            }
            const p = unknownToPacket(cbor.decode(this.Buffer.from(b)));
            this._onPacket(p);
        },
        1000,
        'onChannelBytes2',
    );

    send = bufferedCall(
        async (packet: Packet, opts?: TransportEmitOpts) => {
            const bytes = this.Buffer.from(cbor.encode(packet));
            this.socket.emit('bytes', bytes, opts).catch((err) => {
                console.error('send-err:', err);
            });
        },
        100,
        'channelSend',
    );

    destroy() {
        this.threads.forEach((cancel) => cancel());
        this.socket.off('bytes', this.onChannelBytes);
        this.socket.off('#join', this.onPeerJoin);
    }
}