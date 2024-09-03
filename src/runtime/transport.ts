import {
    Message,
    mustGetMessages,
    mustGetNumber,
    mustGetUint8Array,
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
            };
        default:
            throw new Error(`unsupported packet type: ${o}`);
    }
}

// a test transport using BroadcastChannel to simulate network connectivity
// for local testing without network
// export class BroadcastTransport implements Transport {
//     private channels = new Map<string, BroadcastChannel>();
//     onData?: (p: Packet) => void;

//     constructor() {}

//     static async connect(
//         _config: SocketTransportConfig,
//     ): Promise<BroadcastTransport> {
//         const bc = new BroadcastTransport();
//         return bc;
//     }

//     async emit(packet: Packet, _opts?: TransportEmitOpts): Promise<unknown> {
//         // ignore opts, just spam everyone
//         for (const [_scid, channel] of this.channels) {
//             const bytes = cbor.encode(packet);
//             channel.postMessage({ bytes });
//         }
//         return true;
//     }

//     async join(channelId: string): Promise<boolean> {
//         if (typeof channelId !== 'string') {
//             throw new Error(
//                 `channelId must be the base64 encoded string version of the channel id got ${typeof channelId}`,
//             );
//         }
//         // duplicate id mapping from SocketTransport so data looks the same,
//         // unnecasary but mentally helps when logging
//         const sharedKey = await Encryption.createSharedKey(channelId);
//         const derivedKeys = await Encryption.createKeyPair(sharedKey);
//         const subclusterId = Buffer.from(derivedKeys.publicKey);
//         const scid = subclusterId.toString('base64');
//         // avoid duplicate subclusters
//         if (this.channels.has(scid)) {
//             return false;
//         }
//         // create a new BroadcastChannel for the subcluster
//         const bc = new BroadcastChannel(scid);
//         bc.onmessage = this._onMessage;
//         this.channels.set(scid, bc);
//         return true;
//     }

//     private _onMessage = (ev: MessageEvent) => {
//         if (ev.data.bytes) {
//             if (!this.onData) {
//                 return;
//             }
//             try {
//                 const p = unknownToPacket(cbor.decode(ev.data.bytes));
//                 this.onData(p);
//             } catch (err) {
//                 console.error('broadcast-transport-data-err:', err);
//             }
//         } else {
//             console.warn('broadcast-transport-unknown:', ev.data);
//         }
//     };

//     async disconnect(): Promise<void> {
//         this.onData = undefined;
//     }

//     async destroy() {
//         await this.disconnect();
//         this.channels.forEach((channel) => {
//             channel.close();
//         });
//         this.channels.clear();
//     }
// }

// TODO: create a transport that can switch between these at runtime
// export function createTransportFromEnvironment(
//     cfg: SocketTransportConfig,
// ): Promise<Transport> {
//     if (import.meta.env.MODE === 'offline') {
//         return BroadcastTransport.connect(cfg);
//     } else {
//         return SocketTransport.connect(cfg);
//     }
// }
