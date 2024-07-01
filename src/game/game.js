import { Renderer } from '../renderer/renderer.js';
import { Updater } from '../updater/updater.js';
import { Network } from '../network/network.js';

export class Game {

    constructor({ renderer }) {
        this.renderer = renderer;
    }

    static async create() {

        const renderer = await Renderer.create();
        const updater = await Updater.create();
        const network = await Network.create();

        const g = new Game({ renderer });
        return g;
    }
}

