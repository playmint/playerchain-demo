import { decode, encode } from 'cbor-x';
import Buffer from 'socket:buffer';
import { sodium as sodiumPromise } from 'socket:crypto';
import { Input } from './types';

// probably unnecessary
const sodium = await sodiumPromise.ready;

export enum MessageKind {
    UNKNOWN = 0,
    INPUT = 1,
}

export interface InputMessageSpec {
    peerId: string;
    kind: MessageKind.INPUT;
    round: number;
    input: Input;
}

type UnsignedMessage = InputMessageSpec;

interface Message {
    sig: Uint8Array;
    msg: UnsignedMessage;
}

export class MessageEncoder {
    sk: Uint8Array;
    keys: Map<string, Uint8Array>;
    constructor({
        keys,
        sk,
    }: {
        keys: Map<string, Uint8Array>;
        sk: Uint8Array;
    }) {
        this.keys = keys;
        this.sk = sk;
    }
    encode(msg: UnsignedMessage): Buffer {
        const b = encode(msg);
        const sig = sodium.crypto_sign_detached(b, this.sk);
        return encode([b, sig]);
    }
    decode(buf: Buffer): Message {
        const [b, sig] = decode(buf);
        const msg: unknown = decode(b);
        if (!msg || typeof msg !== 'object') {
            throw new Error('message is not an object');
        }
        if (!('kind' in msg) || !(typeof msg.kind === 'number')) {
            throw new Error('message missing kind');
        }
        if (!('peerId' in msg) || !(typeof msg.peerId === 'string')) {
            throw new Error('message missing peerId');
        }
        const pk = this.keys.get(msg.peerId);
        if (!pk) {
            console.log('NO PUB KEY FOR', msg.peerId, this.keys);
            throw new Error(
                `unable to verify message unknown public key for peer: ${msg.peerId}`,
            );
        }
        if (!sodium.crypto_sign_verify_detached(sig, b, pk)) {
            throw new Error('unable to verify message');
        }
        switch (msg.kind) {
            case MessageKind.INPUT:
                break;
            default:
                throw new Error(`unknown message kind: ${msg.kind}`);
        }
        return { sig, msg: msg as UnsignedMessage };
    }
}
