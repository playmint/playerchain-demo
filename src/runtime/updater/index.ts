export class Updater {
    constructor() {}

    static async create({
        renderPort,
        updaterPort,
    }: {
        renderPort: MessagePort;
        updaterPort: MessagePort;
    }) {
        const renderer = new Updater();
        const worker = new Worker('/runtime/updater/worker.js', {
            type: 'module',
        });
        worker.postMessage(
            {
                type: 'init',
                payload: { renderPort, updaterPort },
            },
            [renderPort, updaterPort],
        );
        return renderer;
    }
}
