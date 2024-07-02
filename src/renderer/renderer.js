export class Renderer {
    constructor() {}

    static async create() {
        const renderer = new Renderer();

        const canvas = document.getElementById('viewport');
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Canvas element not found');
        }

        const offscreen = canvas.transferControlToOffscreen();
        const worker = new Worker('renderer/worker.js', { type: 'module' });
        worker.postMessage(
            {
                type: 'init',
                payload: {
                    drawingSurface: offscreen,
                    width: canvas.clientWidth,
                    height: canvas.clientHeight,
                    pixelRatio: window.devicePixelRatio,
                },
            },
            [offscreen],
        );
        return renderer;
    }
}
