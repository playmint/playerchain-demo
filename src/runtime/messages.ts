export type Base64ID = string;

export type ActionArg = number | boolean;

export interface Action {
    name: string;
    args?: ActionArg[];
}

export enum MessageType {
    INVALID = 0,
    CREATE_CHANNEL = 1,
    INPUT = 2,
}

export type CreateChannelMessage = {
    type: MessageType.CREATE_CHANNEL;
    name: string;
};

export type InputMessage = {
    type: MessageType.INPUT;
    round: number;
    channel: Base64ID;
    data: number;
};

export type UnsignedMessage = CreateChannelMessage | InputMessage;

export type ChainMessageProps = {
    peer: Uint8Array;
    acks: Uint8Array[];
    parent: Uint8Array | null;
    height: number;
};
export type PresignedMessage = UnsignedMessage & ChainMessageProps;
export type PostSignMessageProps = {
    sig: Uint8Array;
};
export type Message = PresignedMessage & PostSignMessageProps;

export function unknownToMessage(o: any): Message {
    if (!o || typeof o !== 'object') {
        throw new Error('message is not an object');
    }
    const header = {
        sig: mustGetUint8Array(o, 'sig'),
        peer: mustGetUint8Array(o, 'peer'),
        acks: mustGetUint8ArrayArray(o, 'acks'),
        parent: o.parent === null ? null : mustGetUint8Array(o, 'parent'),
        height: mustGetNumber(o, 'height'),
    };
    switch (mustGetNumber(o, 'type')) {
        case MessageType.INPUT:
            return {
                ...header,
                channel: mustGetString(o, 'channel'),
                type: MessageType.INPUT,
                round: mustGetNumber(o, 'round'),
                data: mustGetNumber(o, 'data'),
            };
        case MessageType.CREATE_CHANNEL:
            return {
                ...header,
                type: MessageType.CREATE_CHANNEL,
                name: mustGetString(o, 'name'),
            };
        default:
            throw new Error(`unknown message kind: ${o}`);
    }
}

export function mustGetString(o: object, p: string): string {
    const v = o[p];
    if (typeof v !== 'string') {
        throw new Error(
            `expected string for ${p} got ${typeof v}: ${JSON.stringify(o)}`,
        );
    }
    return v;
}

export function mustGetNumber(o: object, p: string): number {
    const v = o[p];
    if (typeof v !== 'number') {
        throw new Error(`expected number for ${p} got ${typeof v}`);
    }
    return v;
}

export function mustGetUint8Array(o: object, p: string): Uint8Array {
    const v = o[p];
    if (typeof v !== 'object' || !(v instanceof Uint8Array)) {
        throw new Error(`expected Uint8Array for ${p} got ${typeof v} ${v}`);
    }
    return v;
}

export function mustGetUint8ArrayArray(o: object, p: string): Uint8Array[] {
    const v = o[p];
    if (!Array.isArray(v)) {
        throw new Error(
            `expected Array<Uint8Array> for ${p} got ${typeof v}: ${v}`,
        );
    }
    for (const x of v) {
        if (!(x instanceof Uint8Array)) {
            throw new Error(
                `expected item in Array<Uint8Array> to be Uint8Array for ${p} got ${typeof x}: ${x}`,
            );
        }
    }
    return v;
}

export function mustGetMessage(o: object, p: string): Message {
    const v = o[p];
    return unknownToMessage(v);
}

export function mustGetMessages(o: object, p: string): Message[] {
    const v = o[p];
    if (!Array.isArray(v)) {
        throw new Error(`expected Array<Message> for ${p} got ${typeof v}`);
    }
    return v.map((item) => unknownToMessage(item));
}
