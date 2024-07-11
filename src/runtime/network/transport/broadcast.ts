import { Channel, Packet, Transport } from '../types';
import { isInputPacket } from '../utils';

export class BroadcastTransport implements Transport {
    ch: BroadcastChannel;
    onPacket?: (packet: Packet) => void;

    constructor({ channel }: { channel: Channel }) {
        console.log('using broadcast transport:', channel.name);
        this.ch = new BroadcastChannel(channel.name);
        this.ch.onmessage = this.processIncomingPacket.bind(this);
    }

    async ready(): Promise<void> {
        return;
    }

    private _send(packet: Packet): void {
        this.ch.postMessage(packet);
    }

    private processIncomingPacket({ data }: MessageEvent) {
        if (!isInputPacket(data)) {
            console.warn('recv invalid packet', data);
            return;
        }
        if (!this.onPacket) {
            console.warn('recv packet but no handler', data);
            return;
        }
        this.onPacket(data as Packet); // FIXME: remove "as Packet"
    }

    sendPacket(packet: Packet): boolean {
        // randomly drop packets
        if (Math.random() < 0.1) {
            // console.log('dropped');
            return true;
        }
        setTimeout(
            this._send.bind(this, packet),
            Math.floor(Math.random() * 40) + 80, // fake network delay
        );
        return true;
    }
}
