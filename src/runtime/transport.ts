import {
    Message,
    mustGetMessages,
    mustGetNumber,
    mustGetUint8Array,
    mustGetUint8ArrayArray,
} from './messages';
import { SocketEmitOpts } from './network';

// const CLUSTER_ID = 'SUBSTREM_3EA31BCE-BDBE-4DAE-A8EF-F4B48409DBA3';

export enum PacketType {
    SYNC_NEED = 0,
    SYNC_HAVE = 1,
    MESSAGE = 2,
    KEEP_ALIVE = 3,
}

export type KeepAlivePacket = {
    type: PacketType.KEEP_ALIVE;
    peer: Uint8Array;
    name: string;
    timestamp: number;
    sees: Uint8Array[];
};

export type MessagePacket = {
    type: PacketType.MESSAGE;
    msgs: Message[];
};

export type SyncNeedPacket = {
    type: PacketType.SYNC_NEED;
    sig: Uint8Array;
    peer: Uint8Array;
    count: number;
};

export type SyncHavePacket = {
    type: PacketType.SYNC_HAVE;
    sig: Uint8Array;
    peer: Uint8Array;
};

export type Packet =
    | MessagePacket
    | SyncNeedPacket
    | SyncHavePacket
    | KeepAlivePacket;

export interface TransportEmitOpts extends SocketEmitOpts {
    // list of peer ids to send to (implies direct=true)
    peers?: string[];
    // list of channel ids to send to (will honor direct flag)
    channels?: string[];
    // if direct is true, message will only be emitted to currently connected peers
    direct?: boolean;
}

export function unknownToPacket(o: any): Packet {
    if (!o || typeof o !== 'object') {
        throw new Error('must be object');
    }

    switch (mustGetNumber(o, 'type')) {
        case PacketType.MESSAGE:
            return {
                type: PacketType.MESSAGE,
                msgs: mustGetMessages(o, 'msgs'),
            };
        case PacketType.SYNC_NEED:
            return {
                type: PacketType.SYNC_NEED,
                sig: mustGetUint8Array(o, 'sig'),
                peer: mustGetUint8Array(o, 'peer'),
                count: mustGetNumber(o, 'count'),
            };
        case PacketType.SYNC_HAVE:
            return {
                type: PacketType.SYNC_HAVE,
                sig: mustGetUint8Array(o, 'sig'),
                peer: mustGetUint8Array(o, 'peer'),
            };
        case PacketType.KEEP_ALIVE:
            return {
                type: PacketType.KEEP_ALIVE,
                peer: mustGetUint8Array(o, 'peer'),
                timestamp: mustGetNumber(o, 'timestamp'),
                sees: mustGetUint8ArrayArray(o, 'sees'),
                name: o.name || '',
            };
        default:
            throw new Error(`unsupported packet type: ${o}`);
    }
}
