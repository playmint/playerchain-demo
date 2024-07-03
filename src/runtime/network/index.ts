export class Network {
    peerId: string;
    worker: Worker;

    constructor({ peerId, worker }) {
        this.peerId = peerId;
        this.worker = worker;
    }

    updateInput(input) {
        this.worker.postMessage({
            type: 'updateInput',
            payload: {
                peerId: this.peerId,
                action: input,
            },
        });
    }

    static async create({ signingKeys, peerId }) {
        const worker = new Worker('/runtime/network/worker.js', {
            type: 'module',
        });
        console.log('sending network init');
        worker.postMessage(
            {
                type: 'init',
                payload: {
                    signingKeys,
                    peerId,
                },
            },
            [],
        );
        const network = new Network({ peerId, worker });

        return network;
    }
}
