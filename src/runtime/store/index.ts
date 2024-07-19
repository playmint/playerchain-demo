export class Entity {
    id = -1;
    position = { x: 0, y: 0, z: 0 };
    velocity = { x: 0, y: 0 };
    rotation = 0;
    color = 0xffffff;
    owner: string = '';
    isPlayer = false;
    playerId: string = '';
    isSquare = false;
    isCamera = false;
    playAudio = false;
    audioPitch = 1;
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
