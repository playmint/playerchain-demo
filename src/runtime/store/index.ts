export class Entity {
    id = -1;
    position = { x: 0, y: 0, z: 0 };
    velocity = { x: 0, y: 0 };
    rotation = 0;
    color = 0xffffff;
    owner: Uint8Array = new Uint8Array(0);
    isPlayer = false;
    playerId: Uint8Array = new Uint8Array(0);
    isSquare = false;
    isCamera = false;
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
