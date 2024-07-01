import { Renderer } from '../renderer/renderer.js';
import { Updater } from '../updater/updater.js';
import { Network } from '../network/network.js';

export class Game {

    /** @type Renderer */
    renderer = null;

    /** @type Updater */
    updater = null;

    /** @type Network */
    network = null;

    /** @type Window */
    window = null;

    inputs = {
        forward: false,
        back: false,
        left: false,
        right: false,
    };

    /**
    * @param {Object} cfg
    * @param {Renderer} cfg.renderer
    * @param {Updater} cfg.updater
    * @param {Network} cfg.network
    * @param {Window} cfg.window
    */
    constructor({ renderer, updater, network, window }) {
        this.renderer = renderer;
        this.updater = updater;
        this.network = network;
        this.window = window;

        this.window.addEventListener('keydown', this.onKeyDown.bind(this));
        this.window.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    onKeyDown(event) {
        switch (event.key) {
            case 'w':
                this.inputs.forward = true;
                break;
            case 'a':
                this.inputs.left = true;
                break;
            case 's':
                this.inputs.back = true;
                break;
            case 'd':
                this.inputs.right = true;
                break;
        }
        this.updateInputs();
    }

    onKeyUp(event) {
        switch (event.key) {
            case 'w':
                this.inputs.forward = false;
                break;
            case 'a':
                this.inputs.left = false;
                break;
            case 's':
                this.inputs.back = false;
                break;
            case 'd':
                this.inputs.right = false;
                break;
        }
        this.updateInputs();
    }

    updateInputs() {
        this.network.updateInput(this.inputs);
    }

    static async create({ window }) {
        const renderer = await Renderer.create();
        const updater = await Updater.create();
        const network = await Network.create();

        const g = new Game({ renderer, updater, network, window });
        return g;
    }
}

