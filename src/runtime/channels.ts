import { Buffer } from 'socket:buffer';
import { Client } from './client';
import {
    KeepAliveMessage,
    Message,
    MessageType,
    decodeMessage,
    encodeMessage,
} from './messages';
import { SocketEmitOpts } from './network';
import { Subcluster } from './network/Subcluster';
import { CancelFunction, setPeriodic } from './utils';

export type ChannelConfig = {
    id: string;
    name: string;
    subcluster: Subcluster;
    onMsg?: (m: Message, channelId: string) => void;
    client: Client;
    Buffer: typeof Buffer;
};

export interface ChannelInfo {
    id: string; // base64ified id that matches the commitment id of the CREATE_CHANNEL message
    scid: string; // cluster id
    name: string;
    creator: string; // peer id of the creator
    peers: string[];
}

export type PeerStatus = {
    connected: number;
    proxy: boolean;
};

export interface EmitOpts extends SocketEmitOpts {
    // list of peer ids to send to (implies direct=true)
    peers?: string[];
    // list of channel ids to send to (will honor direct flag)
    channels?: string[];
    // if direct is true, message will only be emitted to currently connected peers
    direct?: boolean;
}

export class Channel {
    id: string;
    shortId: string;
    client: Client;
    name: string = '';
    Buffer: typeof Buffer;
    subcluster: Subcluster;
    threads: CancelFunction[] = [];
    _onMsg?: (m: Message, channelId: string) => void;
    lastKnowPeers = new Map<string, PeerStatus>();
    alivePeerIds: Map<string, KeepAliveMessage> = new Map();
    peerNames: Map<string, string> = new Map();

    constructor({
        id,
        client,
        subcluster,
        name,
        onMsg,
        Buffer,
    }: ChannelConfig) {
        this.Buffer = Buffer;
        this.id = id;
        this.shortId = id.slice(0, 8);
        this.name = name;
        this._onMsg = onMsg;
        this.subcluster = subcluster;
        this.client = client;
        subcluster.onMsg = this.onChannelMsg;
        this.threads.push(setPeriodic(this.updatePeers, 1000));
    }

    private updatePeers = async () => {
        // tell channels peers we exist
        await this.sendKeepAlive();
        // check for removed peers
        const peers = this.subcluster.peers();
        for (const [peerId, _] of this.lastKnowPeers) {
            if (!peers.some((p) => p.peerId === peerId)) {
                this.lastKnowPeers.delete(peerId);
                // this.onPeerLeave(peerId);
                await this.updatePeer(peerId, {
                    connected: 0,
                    proxy: false,
                });
            }
        }
        // check for added peers
        for (const peer of peers) {
            const connected = peer.connected ? 1 : 0;
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
            return this.client.db.peers.update(peerId, {
                connected: status.connected,
                proxy: status.proxy,
                sees: status.connected ? existing.sees : [],
            });
        } else {
            return this.client.db.peers.put({
                peerId: peerId,
                connected: status.connected,
                proxy: status.proxy,
                lastSeen: 0,
                validHeight: 0,
                knownHeight: 0,
                sees: [],
                channels: [this.id],
            });
        }
    }

    private onChannelMsg = async (b: Buffer) => {
        if (!this._onMsg) {
            return;
        }
        const m = decodeMessage(b);
        if (m.type === MessageType.KEEP_ALIVE) {
            return this.handleKeepAlive(m);
        } else {
            this._onMsg(m, this.id);
        }
    };

    // this really should not be in channel, but that's where the logic
    // for peer updates is currently so it's here for now
    handleKeepAlive = async (m: KeepAliveMessage) => {
        const peerId = Buffer.from(m.peer).toString('hex');
        const prev = this.alivePeerIds.get(peerId);
        if (prev && m.timestamp < prev.timestamp) {
            // console.log('IGNORING OLDER KEEPALIVE FOR PEER', peerId);
            return;
        }
        // console.log('UPDATE ALIVE PEER', peerId);
        this.alivePeerIds.set(peerId, m);
        this.client.db.peers
            .update(peerId, {
                lastSeen: Date.now(),
                sees: m.sees.map((s) => Buffer.from(s).toString('hex')),
            })
            .catch((err) => {
                console.error('update-peer-err:', err);
            });
        if (!this.peerNames.has(peerId)) {
            console.log('setitng peer name', peerId, m.name);
            this.client.db.peerNames
                .put({
                    peerId: peerId,
                    name: m.name,
                })
                .catch((err) => {
                    console.error('update-peer-name-err:', err);
                });
            this.peerNames.set(peerId, m.name);
        }
    };

    sendKeepAlive = async () => {
        const subclusterPeers = this.subcluster.peers();
        const peerName = await this.client.db.peerNames.get(this.client.peerId);
        const msg: KeepAliveMessage = {
            type: MessageType.KEEP_ALIVE,
            peer: this.client.id,
            timestamp: Date.now(),
            sees: subclusterPeers.map(
                (p) =>
                    Buffer.from(
                        p.peerId.slice(0, 8),
                        'hex',
                    ) as unknown as Uint8Array,
            ),
            name: peerName?.name || '',
        };
        const opts = { ttl: 60 * 1000 };
        await this.send(msg, opts);
    };

    send = async (m: Message, opts?: EmitOpts) => {
        const bytes = encodeMessage(m);
        this.emit('msg', bytes, opts).catch((err) => {
            console.error('send-err:', err);
        });
    };

    emit = async (evt: string, buf: Uint8Array, opts?: EmitOpts) => {
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
    }
}
