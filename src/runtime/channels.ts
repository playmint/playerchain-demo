import * as cbor from 'cbor-x';
import { Buffer } from 'socket:buffer';
import { Client } from './client';
import { Base64ID } from './messages';
import { Subcluster } from './network/Subcluster';
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
    subcluster: Subcluster;
    onPacket?: (packet: Packet) => void;
    client: Client;
    Buffer: typeof Buffer;
};

export interface ChannelInfo {
    id: Base64ID; // base64ified id that matches the commitment id of the CREATE_CHANNEL message
    scid: string; // cluster id
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
    subcluster: Subcluster;
    threads: CancelFunction[] = [];
    _onPacket?: (packet: Packet) => void;
    lastKnowPeers = new Map<string, PeerStatus>();
    alivePeerIds: Map<string, KeepAlivePacket> = new Map();

    constructor({
        id,
        client,
        subcluster,
        name,
        onPacket,
        Buffer,
    }: ChannelConfig) {
        this.Buffer = Buffer;
        this.id = id;
        this.shortId = id.slice(0, 8);
        this.name = name;
        this._onPacket = onPacket;
        this.subcluster = subcluster;
        this.client = client;
        subcluster.onBytes = this.onChannelBytes;
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
        const peers = this.subcluster.peers();
        for (const [peerId, _] of this.lastKnowPeers) {
            if (!peers.some((p) => p.peerId === peerId)) {
                this.lastKnowPeers.delete(peerId);
                // this.onPeerLeave(peerId);
                await this.updatePeer(peerId, {
                    connected: false,
                    proxy: false,
                });
            }
        }
        // check for added peers
        for (const peer of peers) {
            // since we can't trust the peer list from the network
            // we track keep alives to filter out invalid peers
            if (!this.alivePeerIds.has(peer.peerId)) {
                continue;
            }
            const connected = !!peer.connected;
            const proxy = !!peer.proxies.size;
            let status = this.lastKnowPeers.get(peer.peerId);
            if (!status) {
                status = { connected, proxy };
                this.lastKnowPeers.set(peer.peerId, status);
                await this.updatePeer(peer.peerId, status);
            } else if (
                connected !== status.connected ||
                proxy !== status.proxy
            ) {
                await this.updatePeer(peer.peerId, status);
            }
        }
    };

    private async updatePeer(peerId: string, status: PeerStatus) {
        const existing = await this.client.db.peers.get(peerId);
        if (existing) {
            await this.client.db.peers.update(peerId, {
                connected: status.connected,
                proxy: status.proxy,
                sees: status.connected ? existing.sees : [],
            });
        } else {
            await this.client.db.peers.put({
                peerId: peerId,
                connected: status.connected,
                proxy: status.proxy,
                lastSeen: 0,
                validHeight: 0,
                knownHeight: 0,
                sees: [],
                channels: [this.id],
                playerName: '',
            });
        }
    }

    private onChannelBytes = bufferedCall(
        async (b: Buffer) => {
            if (!this._onPacket) {
                return;
            }
            const p = unknownToPacket(cbor.decode(this.Buffer.from(b)));
            if (p.type === PacketType.KEEP_ALIVE) {
                const peerId = Buffer.from(p.peer).toString('hex');
                const prev = this.alivePeerIds.get(peerId);
                if (prev && p.timestamp < prev.timestamp) {
                    // console.log('IGNORING OLDER KEEPALIVE FOR PEER', peerId);
                    return;
                }
                // console.log('UPDATE ALIVE PEER', peerId);
                this.alivePeerIds.set(peerId, p);
                this.client.db.peers
                    .update(peerId, {
                        lastSeen: p.timestamp,
                        playerName: p.playerName,
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

    send = async (packet: Packet, opts?: TransportEmitOpts) => {
        const bytes = this.Buffer.from(cbor.encode(packet));
        this.emit('bytes', bytes, opts).catch((err) => {
            console.error('send-err:', err);
        });
    };

    emit = async (evt: string, buf: Uint8Array, opts?: TransportEmitOpts) => {
        // const ourPeerIds = ourPeers.map((p) => p.peerId);
        if (this.subcluster.peers().length === 0) {
            console.log(`${this.client.shortId} USING CRAPPY SEND`);
            return this.subcluster.publish(evt, buf, opts);
        } else {
            return this.subcluster.stream(evt, buf, opts);
            // for (const [peerId, peer] of this.socket.peers) {
            // if (ourPeers.length > 0 && !ourPeerIds.includes(peerId)) {
            //     continue;
            // }
            // console.log(
            //     `${this.client.shortId} ---> ${peerId.slice(0, 8)}`,
            // );
            //     return peer.emit(evt, buf, opts);
            // }
        }
    };

    destroy() {
        this.threads.forEach((cancel) => cancel());
        // this.socket.off('bytes', this.onChannelBytes);
        // this.socket.off('#join', this.onPeerJoin);
    }
}
