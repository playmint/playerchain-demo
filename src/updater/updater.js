export class Updater {
    constructor() {}

    static async create() {
        const renderer = new Updater();
        const worker = new Worker('updater/worker.js', { type: 'module' });
        worker.postMessage(
            {
                type: 'init',
                payload: {},
            },
            [],
        );
        return renderer;
    }
}
