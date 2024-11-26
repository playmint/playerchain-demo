import Dexie, { type EntityTable } from 'dexie';
import { Buffer } from 'socket:buffer';
import { ChannelInfo } from './channels';
import { ChainMessage, MessageType } from './messages';
import type { State } from './simulation';

export enum StateTag {
    UNKNOWN = 0,
    ACCEPTED = 1,
    PREDICTED = 2,
}

export interface SerializedState {
    channel: ChannelInfo['id'];
    tag: StateTag;
    round: number;
    updated: number; // local timestamp of latest message in this state
    state: State;
}

export interface StoredChatMessage {
    id: string;
    arrived: number;
    peer: string;
    msg: string;
}

export interface PeerInfo {
    peerId: string;
    lastSeen: number;
    sendQueueLength?: number;
    connected: number;
    validHeight: number;
    knownHeight: number;
    channels: string[];
    proxy: string | null; // if true, then messages are bouncing off someone else
    sees: string[]; // list of peers this peer has told us it knows about
}

export enum SearchStatus {
    NOT_STARTED = 0,
    WAITING = 1,
}

export interface Missing {
    sig: Uint8Array;
    status: SearchStatus;
    peer: string;
    height: number;
    started: number;
    updated: number;
    count: number; // how many parents do you think you need
}

export type NetworkInfo = {
    id: number;
    peerId: string; //hex encoded
    clusterId: Uint8Array;
    keepalive: number;
    address?: string;
    clock?: number;
    uptime?: number;
    port?: number;
    probeInternalPort?: number;
    natName?: string;
    natType?: number;
    online?: boolean;
    ready?: boolean; // network said it was ready
};

// does this really belong here?
// should probably be part of the Game interface somehow
export type PlayerSettings = {
    id: 1;
    musicVolume: number;
    sfxVolume: number;
};

export type PeerNames = {
    peerId: string;
    name: string;
};

export type MessageConfirmationMatrix = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
];

export type StoredChainMessageProps = {
    peer: string;
    parent: string | null;
    acks: string[];
    height: number;
    sig: string;
};
export type StoredInputMessage = StoredChainMessageProps & {
    type: MessageType.INPUT;
    round: number;
    data: number;
};

export type StoredSetPeersMessage = StoredChainMessageProps & {
    type: MessageType.SET_PEERS;
    peers: string[];
    interlace: number;
};

export type StoredCreateChannelMessage = StoredChainMessageProps & {
    type: MessageType.CREATE_CHANNEL;
    name: string;
};
export type StoredChainMessage =
    | StoredInputMessage
    | StoredSetPeersMessage
    | StoredCreateChannelMessage;

export type StoredMessage = StoredChainMessage & {
    id: string;
    updated: number;
    channel: string | null;
    // confirmations: MessageConfirmationMatrix;
};

export function fromStoredChainMessage(m: StoredChainMessage): ChainMessage {
    const shared = {
        peer: Buffer.from(m.peer, 'hex'),
        parent: m.parent ? Buffer.from(m.parent, 'base64') : null,
        acks: m.acks.map((a) => Buffer.from(a, 'base64')),
        height: m.height,
        sig: Buffer.from(m.sig, 'base64'),
    };
    switch (m.type) {
        case MessageType.INPUT:
            return {
                type: MessageType.INPUT,
                ...shared,
                round: m.round,
                data: m.data,
            };
        case MessageType.CREATE_CHANNEL:
            return {
                type: MessageType.CREATE_CHANNEL,
                ...shared,
                name: m.name,
            };
        case MessageType.SET_PEERS:
            return {
                type: MessageType.SET_PEERS,
                ...shared,
                peers: m.peers.map((p) => Buffer.from(p, 'base64')),
                interlace: m.interlace,
            };
    }
}

export function toStoredChainMessage(
    m: ChainMessage,
    id: string,
    updated: number,
    channel: string | null,
    // confirmations: MessageConfirmationMatrix,
): StoredMessage {
    if (!m.peer) {
        throw new Error('peer field is required');
    }
    if (!m.sig) {
        throw new Error('sig field is required');
    }
    if (typeof m.height !== 'number') {
        throw new Error('height field is required');
    }
    const shared = {
        id,
        peer: Buffer.from(m.peer).toString('hex'),
        parent: m.parent ? Buffer.from(m.parent).toString('base64') : null,
        acks: m.acks
            ? m.acks.map((a) => Buffer.from(a).toString('base64'))
            : [],
        height: m.height,
        sig: Buffer.from(m.sig).toString('base64'),
        updated,
        channel,
        // confirmations,
    };
    switch (m.type) {
        case MessageType.INPUT:
            return {
                type: MessageType.INPUT,
                ...shared,
                round: m.round,
                data: m.data,
            };
        case MessageType.CREATE_CHANNEL:
            return {
                type: MessageType.CREATE_CHANNEL,
                ...shared,
                name: m.name,
            };
        case MessageType.SET_PEERS:
            return {
                type: MessageType.SET_PEERS,
                ...shared,
                peers: m.peers.map((p) => Buffer.from(p).toString('base64')),
                interlace: m.interlace,
            };
    }
}

export type Tape = {
    round: number;
    channel: string;
    inputs: number[]; // inputs indexed by peer index
    ids: string[]; // list of message ids indexed by peer index
    acks: string[][]; // list of messages ids that ack the input at the peer index
    confirmed: boolean[];
    updated: number;
    predicted: boolean;
};

export type DB = Dexie & {
    channels: EntityTable<ChannelInfo, 'id'>;
    messages: EntityTable<StoredMessage, 'id'>;
    state: EntityTable<SerializedState>;
    peers: EntityTable<PeerInfo, 'peerId'>;
    network: EntityTable<NetworkInfo, 'id'>;
    settings: EntityTable<PlayerSettings, 'id'>;
    peerNames: EntityTable<PeerNames, 'peerId'>;
    tapes: EntityTable<Tape>;
    chat: EntityTable<StoredChatMessage, 'id'>;
};

export function open(name: string): DB {
    const db = new Dexie(name) as DB;

    db.version(1).stores({
        channels: 'id',
        peers: 'peerId, connected',
        messages:
            'id, &sig, &[peer+height], [channel+type], &[channel+peer+round], &[channel+round+peer], &[channel+updated]',
        state: '[channel+tag+round]',
        network: 'id',
        settings: 'id',
        peerNames: 'peerId',
        tapes: '[channel+round], [channel+updated]',
        chat: 'id, arrived',
    });

    return db;
}

export default { open };
