import Dexie, { type EntityTable } from 'dexie';
import { ChannelInfo } from './channels';
import { Message } from './messages';
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
    arrived: number; // local timestamp of latest message in this state
    state: State;
}

export interface PeerInfo {
    peerId: string;
    lastSeen: number;
    sendQueueLength?: number;
    validHeight: number;
    knownHeight: number;
    channels: string[];
    connected: boolean; // if true, then we have at some point had a connection
    proxy: boolean | null; // if true, then messages are bouncing off someone else
    online: boolean; // this is our internal definition of "online" see peer.ts
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

export type StoredMessage = Message & { arrived: number };

export type DB = Dexie & {
    channels: EntityTable<ChannelInfo, 'id'>;
    messages: EntityTable<StoredMessage>;
    missing: EntityTable<Missing, 'sig'>;
    state: EntityTable<SerializedState>;
    peers: EntityTable<PeerInfo, 'peerId'>;
    network: EntityTable<NetworkInfo, 'id'>;
};

export function open(name: string): DB {
    const db = new Dexie(name) as DB;

    db.version(1).stores({
        channels: 'id',
        peers: 'peerId, connected',
        messages:
            'sig, &[peer+height], &[channel+round+peer], &[channel+arrived]',
        missing: 'sig',
        state: '[channel+tag+round]',
        network: 'id',
    });

    return db;
}

export default { open };
