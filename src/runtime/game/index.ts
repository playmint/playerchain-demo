import { Network } from '../network';
import { Renderer } from '../renderer';
import { Updater } from '../updater';

export class Game {
    renderer: Renderer;
    updater: Updater;
    network: Network;
    window: Window;

    inputs = {
        forward: false,
        back: false,
        left: false,
        right: false,
    };

    constructor({ renderer, updater, network, window }) {
        this.renderer = renderer;
        this.updater = updater;
        this.network = network;
        this.window = window;

        this.window.addEventListener('keydown', this.onKeyDown.bind(this));
        this.window.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    onKeyDown(event) {
        event.preventDefault();
        switch (event.key) {
            case 'w':
                if (this.inputs.forward) {
                    return;
                }
                this.inputs.forward = true;
                break;
            case 'a':
                if (this.inputs.left) {
                    return;
                }
                this.inputs.left = true;
                break;
            case 's':
                if (this.inputs.back) {
                    return;
                }
                this.inputs.back = true;
                break;
            case 'd':
                if (this.inputs.right) {
                    return;
                }
                this.inputs.right = true;
                break;
        }
        this.updateInputs();
    }

    onKeyUp(event) {
        event.preventDefault();
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
        this.network?.updateInput(this.inputs);
    }

    static async create({ window, renderer, updater, network }) {
        const g = new Game({ renderer, updater, network, window });
        return g;
    }
}
