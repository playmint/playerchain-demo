export class Network {
    /** @type Worker */
    worker = null;

    constructor({ worker }) {
        this.worker = worker;
    }

    updateInput(input) {
        this.worker.postMessage(
            {
                type: 'updateInput',
                payload: input,
            },
            [],
        );
    }

    static async create() {
        const worker = new Worker('network/worker.js', { type: 'module' });
        worker.postMessage(
            {
                type: 'init',
                payload: {},
            },
            [],
        );
        const network = new Network({ worker });
        return network;
    }
}
