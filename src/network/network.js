import Buffer from 'socket:buffer';
import EventEmitter from 'socket:events';
import { init } from './worker.js';

export class Network {
    peerId = null;

    /** @type {EventEmitter?} */
    subcluster = null;

    constructor(peerId, subcluster) {
        this.peerId = peerId;
        this.subcluster = subcluster;
    }

    updateInput(input) {
        this.subcluster?.emit(
            'action',
            Buffer.from(
                JSON.stringify({
                    peerId: this.peerId,
                    action: input,
                }),
            ),
        );
    }

    static async create({ signingKeys, peerId }) {
        const subcluster = await init(signingKeys, peerId);

        const network = new Network(peerId, subcluster);
        return network;
    }
}
