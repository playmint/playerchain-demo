export class Entity {
    id = -1;
    position = { x: 0, y: 0, z: 0 };
    color = 0xffffff;
    owner = -1;
    isPlayer = false;
    playerId = -1;
    isSquare = false;
    actions = {
        forward: false,
        back: false,
        left: false,
        right: false,
    };
}

export class Store {
    /** @type Entity[] */
    entities = [];

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
