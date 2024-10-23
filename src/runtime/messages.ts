import * as cbor from 'cbor-x';
import { Buffer } from 'socket:buffer';

export enum MessageType {
    INVALID = 0,
    CREATE_CHANNEL = 1,
    INPUT = 2,
    KEEP_ALIVE = 3,
    SET_PEERS = 4,
    CHAT = 5,
}

export type ChainMessageProps = {
    peer: Uint8Array;
    parent: Uint8Array | null;
    acks: Uint8Array[];
    height: number;
    sig: Uint8Array;
};

export type KeepAliveMessage = {
    type: MessageType.KEEP_ALIVE;
    peer: Uint8Array;
    name: string;
    timestamp: number;
    sees: Uint8Array[];
    version: string;
};

export type ChatMessage = {
    type: MessageType.CHAT;
    id: string; // uuidv6
    peer: Uint8Array;
    msg: string;
};

export type InputMessage = Partial<ChainMessageProps> & {
    type: MessageType.INPUT;
    round: number;
    data: number;
};

export type SetPeersMessage = Partial<ChainMessageProps> & {
    type: MessageType.SET_PEERS;
    peers: Uint8Array[];
};

export type CreateChannelMessage = Partial<ChainMessageProps> & {
    type: MessageType.CREATE_CHANNEL;
    name: string;
};

export type Message =
    | InputMessage
    | SetPeersMessage
    | CreateChannelMessage
    | KeepAliveMessage
    | ChatMessage;

export type ChainMessage =
    | InputMessage
    | SetPeersMessage
    | CreateChannelMessage;

export function encodeMessage(m: Message): Uint8Array {
    switch (m.type) {
        case MessageType.INPUT:
            return encodeInputMessage(m);
        case MessageType.CREATE_CHANNEL:
            return encodeCreateChannelMessage(m);
        case MessageType.SET_PEERS:
            return encodeSetPeersMessage(m);
        case MessageType.KEEP_ALIVE:
            return encodeKeepAliveMessage(m);
        case MessageType.CHAT:
            return encodeChatMessage(m);
        default:
            throw new Error(`unsupported message type: ${(m as any).type}`);
    }
}

export function decodeMessage(b: Uint8Array | Buffer): Message {
    const [type, ...props] = cbor.decode(Buffer.from(b));
    switch (type) {
        case MessageType.INPUT:
            return decodeInputMessage(props);
        case MessageType.CREATE_CHANNEL:
            return decodeCreateChannelMessage(props);
        case MessageType.SET_PEERS:
            return decodeSetPeersMessage(props);
        case MessageType.KEEP_ALIVE:
            return decodeKeepAliveMessage(props);
        case MessageType.CHAT:
            return decodeChatMessage(props);
        default:
            throw new Error(`unsupported message type: ${type}`);
    }
}

function encodeKeepAliveMessage(p: KeepAliveMessage): Uint8Array {
    return cbor.encode([
        MessageType.KEEP_ALIVE,
        p.peer,
        p.name,
        p.timestamp,
        p.sees,
        p.version,
    ]);
}

function decodeKeepAliveMessage(props: any[]): KeepAliveMessage {
    const [peer, name, timestamp, sees, version] = props;
    return {
        type: MessageType.KEEP_ALIVE,
        peer,
        name,
        timestamp,
        sees,
        version,
    };
}

function encodeChatMessage(p: ChatMessage): Uint8Array {
    return cbor.encode([MessageType.CHAT, p.peer, p.id, p.msg]);
}

function decodeChatMessage(props: any[]): ChatMessage {
    const [peer, id, msg] = props;
    return {
        type: MessageType.CHAT,
        peer,
        id,
        msg,
    };
}

function encodeInputMessage(m: InputMessage): Uint8Array {
    return cbor.encode([
        MessageType.INPUT,
        m.round,
        m.data,

        m.peer,
        m.parent,
        m.acks,
        m.height,
        m.sig,
    ]);
}

function decodeInputMessage(props: any[]): InputMessage {
    const [round, data, peer, parent, acks, height, sig] = props;
    return {
        type: MessageType.INPUT,
        parent,
        round,
        height,
        data,
        peer,
        acks,
        sig,
    };
}

function encodeCreateChannelMessage(m: CreateChannelMessage): Uint8Array {
    return cbor.encode([
        MessageType.CREATE_CHANNEL,
        m.name,

        m.peer,
        m.parent,
        m.acks,
        m.height,
        m.sig,
    ]);
}

function decodeCreateChannelMessage(props: any[]): CreateChannelMessage {
    const [name, peer, parent, acks, height, sig] = props;
    return {
        type: MessageType.CREATE_CHANNEL,
        name,
        peer,
        parent,
        acks,
        height,
        sig,
    };
}

function encodeSetPeersMessage(m: SetPeersMessage): Uint8Array {
    return cbor.encode([
        MessageType.SET_PEERS,
        m.peers,
        m.peer,
        m.parent,
        m.acks,
        m.height,
        m.sig,
    ]);
}

function decodeSetPeersMessage(props: any[]): SetPeersMessage {
    const [peers, peer, parent, acks, height, sig] = props;
    return {
        type: MessageType.SET_PEERS,
        peers,
        peer,
        parent,
        acks,
        height,
        sig,
    };
}
