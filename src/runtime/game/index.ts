import { Network } from '../network';
import { Renderer } from '../renderer';
import { Updater } from '../updater';

export class Game {
    renderer: Renderer;
    updater: Updater;
    network: Network;

    inputs = {
        forward: false,
        back: false,
        left: false,
        right: false,
    };

    constructor({ renderer, updater, network }) {
        this.renderer = renderer;
        this.updater = updater;
        this.network = network;
    }

    static async create({ renderer, updater, network }) {
        const g = new Game({ renderer, updater, network });
        return g;
    }
}
