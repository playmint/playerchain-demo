import Buffer from 'socket:buffer';
import { MessageEncoder } from '../messages';
import { Channel, Keypair, Packet, Transport } from '../types';
import { isInputPacket } from '../utils';

export class BroadcastTransport implements Transport {
    ch: BroadcastChannel;
    onPacket?: (packet: Packet) => void;
    numPlayers: number;
    enc: MessageEncoder;
    peerId: string;
    signingKeys: Keypair;
    _ready: Promise<void>;

    constructor({
        channel,
        numPlayers,
        peerId,
        signingKeys,
        enc,
    }: {
        channel: Channel;
        peerId: Uint8Array;
        signingKeys: Keypair;
        numPlayers: number;
        enc: MessageEncoder;
    }) {
        console.log('using broadcast transport:', channel.name);
        this.ch = new BroadcastChannel(channel.name);
        this.ch.onmessage = this.processIncomingPacket.bind(this);
        this.numPlayers = numPlayers;
        this.signingKeys = signingKeys;
        this.enc = enc;
        this.peerId = Buffer.from(peerId).toString();
        this._ready = this.init();
    }

    async init(): Promise<void> {
        setInterval(() => {
            this.ch.postMessage({
                name: 'key',
                key: this.signingKeys.publicKey,
                peerId: this.peerId,
            });
        }, 1000);

        for (;;) {
            if (this.enc.keys.size == this.numPlayers) {
                console.log('CONNECTED');
                break;
            }
            console.log(
                'waiting for keys',
                this.enc.keys.size,
                this.numPlayers,
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return;
    }

    async ready(): Promise<void> {
        return this._ready;
    }

    private _send(o: unknown): void {
        this.ch.postMessage(o);
    }

    private processIncomingPacket({ data }: MessageEvent) {
        const { name, buf, key, peerId } = data;
        if (name === 'key') {
            this.enc.keys.set(peerId, key);
            return;
        }

        const { msg } = this.enc.decode(buf);
        if (!isInputPacket(msg)) {
            console.warn('recv invalid packet', msg);
            return;
        }
        if (!this.onPacket) {
            console.warn('recv packet but no handler', msg);
            return;
        }
        this.onPacket(msg); // FIXME: remove "as Packet"
    }

    sendPacket(buf: Buffer): boolean {
        // randomly drop packets
        // if (Math.random() < 0.1) {
        //     return true;
        // }
        setTimeout(
            this._send.bind(this, { name: 'action', buf }),
            Math.floor(Math.random() * 40), // fake network delay
        );
        return true;
    }
}
