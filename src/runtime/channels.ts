import * as Comlink from 'comlink';
import { config as socketConfig } from 'socket:application';
import { Buffer } from 'socket:buffer';
import { v6 as uuidv6 } from 'uuid';
import { Client } from './client';
import { StoredChatMessage } from './db';
import {
    ChatMessage,
    KeepAliveMessage,
    Message,
    MessageType,
    encodeMessage,
} from './messages';
import { SocketEmitOpts } from './network';
import { Subcluster } from './network/Subcluster';
import { getVersionStringFromConfig } from './utils';

export type ChannelConfig = {
    id: string;
    name: string;
    subcluster: Comlink.Remote<Subcluster>;
    onMsg?: (m: Message, id: string, channelId: string) => void;
    client: Client;
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
    subcluster: Comlink.Remote<Subcluster>;
    _onMsg?: (m: Message, id: string, channelId: string) => void;
    lastKnowPeers = new Map<string, PeerStatus>();
    alivePeerIds: Map<string, KeepAliveMessage> = new Map();
    peerNames: Map<string, string> = new Map();
    loopTimer: NodeJS.Timeout | null = null;
    looping = false;

    constructor({ id, client, subcluster, name, onMsg }: ChannelConfig) {
        this.id = id;
        this.shortId = id.slice(0, 8);
        this.name = name;
        this._onMsg = onMsg;
        this.subcluster = subcluster;
        this.client = client;
        subcluster
            .set('onMsg', Comlink.proxy(this.onChannelMsg))
            .catch((err) => console.error('set-on-msg-err:', err));
        this.loopTimer = setInterval(this.loop, 1000);
    }

    private loop = () => {
        if (this.looping) {
            return;
        }
        this.looping = true;
        this.updatePeers()
            .catch((err) => console.error('update-peers-err:', err))
            .finally(() => {
                this.looping = false;
            });
    };

    private updatePeers = async () => {
        // tell channels peers we exist
        await this.sendKeepAlive();
        // check for removed peers
        const peers = await this.subcluster.getPeerInfo();
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
            const proxy = !!peer.proxy;
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

    private onChannelMsg = async (m: Message, id) => {
        if (!this._onMsg) {
            return;
        }
        if (m.type === MessageType.KEEP_ALIVE) {
            return this.handleKeepAlive(m);
        } else if (m.type === MessageType.CHAT) {
            return this.handleChatMessage(m);
        } else {
            this._onMsg(m, id, this.id);
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
        const subclusterPeers = await this.subcluster.getPeerInfo();
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
            version: getVersionStringFromConfig(socketConfig),
        };
        const opts = { ttl: 60 * 1000 };
        await this.send(msg, opts);
    };

    sendChatMessage = async (txt: string) => {
        const msg: ChatMessage = {
            type: MessageType.CHAT,
            id: uuidv6(),
            peer: this.client.id,
            msg: txt,
        };
        const opts = { ttl: 60 * 1000 };
        await this.send(msg, opts);
        await this.send(msg, opts);
        this.handleChatMessage(msg).catch((err) => {
            console.error('handle-self-chat-err:', err);
        });
    };

    handleChatMessage = async (m: ChatMessage) => {
        const peerId = Buffer.from(m.peer).toString('hex');
        const chat: StoredChatMessage = {
            id: m.id,
            peer: peerId,
            msg: m.msg,
            arrived: Date.now(),
        };
        this.client.db.chat.put(chat).catch((err) => {
            console.error('put-chat-err:', err);
        });
    };

    send = async (m: Message, opts?: EmitOpts) => {
        const bytes = encodeMessage(m);
        return this.emit('msg', bytes, opts);
    };

    emit = async (evt: string, buf: Uint8Array, opts?: EmitOpts) => {
        // const ourPeerIds = ourPeers.map((p) => p.peerId);
        const subclusterPeers = await this.subcluster.getPeerInfo();
        if (subclusterPeers.length === 0) {
            console.log(`${this.client.shortId} USING CRAPPY SEND`);
            return this.subcluster.publish(evt, buf, opts);
        } else {
            return this.subcluster.stream(evt, buf, opts);
        }
    };

    destroy() {
        if (this.loopTimer) {
            clearInterval(this.loopTimer);
            this.loopTimer = null;
        }
    }
}
