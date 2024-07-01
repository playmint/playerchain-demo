import { Renderer } from '../renderer/renderer.js';

export class Game {

    constructor({ renderer }) {
        this.renderer = renderer;
    }

    static async create() {

        const renderer = await Renderer.create();

        const g = new Game({ renderer });
        return g;
    }
}

