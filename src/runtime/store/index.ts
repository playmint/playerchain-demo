import { uiElement } from '../../substream/UISystem';

export class Entity {
    id = -1;
    position = { x: 0, y: 0, z: 0 };
    velocity = { x: 0, y: 0 };
    rotation = 0;
    rollAngle = 0;

    model: string = '';
    audioClip: string = '';
    audioPitch = 1;

    owner: string = '';
    playerId: string = '';
    isPlayer = false;
    isCamera = false;
    isUI = false;
    UIElement!: uiElement;

    isShip = false;

    labelText: string = '';

    actions = {
        forward: false,
        back: false,
        left: false,
        right: false,
    };
}

export class Store {
    entities: Entity[] = [];

    add() {
        const e = new Entity();
        this.entities.push(e);
        e.id = this.entities.length - 1;

        return e;
    }

    /** @param {Entity[]} entities */
    static from(entities) {
        const store = new Store();
        store.entities = entities;
        return store;
    }
}
