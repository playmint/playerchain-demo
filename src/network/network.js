
export class Network {
    constructor() {

    }

    static async create() {
        const renderer = new Network();
        const worker = new Worker('network/worker.js', { type: 'module' });
        worker.postMessage({
            type: 'init',
            payload: {},
        }, []);
        return renderer;
    }
}