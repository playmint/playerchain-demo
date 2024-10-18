export type EntityId = number;

type u8 = 0;
type u16 = 1;
type u32 = 2;
type i8 = 3;
type i16 = 4;
type i32 = 5;
type f32 = 6;
type f64 = 7;
type u64 = 8;
type str = 9;

export const Type = {
    u8: 0 as u8,
    u16: 1 as u16,
    u32: 2 as u32,
    eid: 2 as u32, // alias
    i8: 3 as i8,
    i16: 4 as i16,
    i32: 5 as i32,
    f32: 6 as f32,
    f64: 7 as f64,
    u64: 8 as u64,
    str: 9 as str,
};

type ComponentType = u8 | u16 | u32 | i8 | i16 | i32 | f32 | f64 | u64;
type PlayerValueType = u32 | f32 | str | u8;

export const Vec3 = {
    x: Type.f32,
    y: Type.f32,
    z: Type.f32,
};
export const Vec2 = {
    x: Type.f32,
    y: Type.f32,
    z: Type.f32,
};

type ComponentSchema = Record<string, ComponentType>;
type PlayerSchema = Record<string, PlayerValueType>;

type ComponentStorage<T> = T extends u8
    ? Uint8Array
    : T extends u16
      ? Uint16Array
      : T extends u32
        ? Uint32Array
        : T extends i8
          ? Int8Array
          : T extends i16
            ? Int16Array
            : T extends i32
              ? Int32Array
              : T extends f32
                ? Float32Array
                : T extends f64
                  ? Float64Array
                  : T extends u64
                    ? BigInt64Array
                    : never;

type PlayerValueStorage<T> = T extends f32
    ? number
    : T extends str
      ? string
      : T extends u32
        ? number
        : never;

export type ComponentData<T extends ComponentSchema> = {
    [K in keyof T]: T[K] extends ComponentType ? ComponentStorage<T[K]> : never;
};

export type PlayerData<T extends PlayerSchema> = {
    [K in keyof T]: T[K] extends PlayerValueType
        ? PlayerValueStorage<T[K]>
        : never;
};

function allocComponentStorage(type: ComponentType, size: number) {
    switch (type) {
        case Type.u8:
            return new Uint8Array(size) satisfies ComponentStorage<u8>;
        case Type.u16:
            return new Uint16Array(size) satisfies ComponentStorage<u16>;
        case Type.u32:
            return new Uint32Array(size) satisfies ComponentStorage<u32>;
        case Type.i8:
            return new Int8Array(size) satisfies ComponentStorage<i8>;
        case Type.i16:
            return new Int16Array(size) satisfies ComponentStorage<i16>;
        case Type.i32:
            return new Int32Array(size) satisfies ComponentStorage<i32>;
        case Type.f32:
            return new Float32Array(size) satisfies ComponentStorage<f32>;
        case Type.f64:
            return new Float64Array(size) satisfies ComponentStorage<f64>;
        case Type.u64:
            return new BigInt64Array(size) satisfies ComponentStorage<u64>;
        default:
            throw new Error('Unknown component type');
    }
}

export class Component<T extends ComponentSchema> {
    size: number;
    schema: T;
    data: ComponentData<T>;
    constructor(schema: T, size: number) {
        this.size = size;
        this.schema = schema;
        this.data = Object.keys(schema).reduce((acc, key) => {
            acc[key] = allocComponentStorage(this.schema[key], this.size);
            return acc;
        }, {}) as ComponentData<T>;
    }
}
type WorldSchema = {
    player: PlayerSchema;
    components: Record<string, ComponentSchema>;
};
type WorldData<T extends WorldSchema> = {
    [K in keyof T['components']]: Component<T['components'][K]>;
};
type WorldComponentData<T extends WorldSchema> = {
    [K in keyof T['components']]: ComponentData<T['components'][K]>;
};

export class World<T extends WorldSchema> {
    size: number;
    schema: T;

    // the data
    t: number = 0;
    entities: (EntityId | null)[] = [];
    components: WorldData<T> = {} as WorldData<T>;
    tags: Component<{ tag: u32 }> = new Component({ tag: Type.u32 }, 0);
    players: Map<string, PlayerData<T['player']>> = new Map();

    constructor(schema: T, size: number) {
        this.schema = schema;
        this.size = size;
        this.reset();
    }

    // reset clears all entities and components from the world
    reset = () => {
        this.entities = [];
        this.components = Object.keys(this.schema.components)
            .sort()
            .reduce((acc, key) => {
                acc[key] = new Component(
                    this.schema.components[key],
                    this.size,
                );
                return acc;
            }, {}) as WorldData<T>;
        this.tags = new Component({ tag: Type.u32 }, this.size);
        this.players = new Map();
    };

    // addEntity adds a new entity to the world and returns the entity id
    addEntity = (): EntityId => {
        if (this.entities.length >= this.size) {
            throw new Error(
                `addEntity failed, world hit max entities: ${this.size}`,
            );
        }
        const eid = this.entities.length + 1;
        this.entities = [...this.entities, eid];
        return eid;
    };

    // removeEntity removes the entity from the world
    removeEntity = (eid: EntityId) => {
        this.entities[eid] = null;
        // this.entities = this.entities.reduce((acc, id) => {
        //     if (id !== eid) {
        //         acc.push(id);
        //     }
        //     return acc;
        // }, [] as number[]);
    };

    // addComponent adds the component to the entity
    addComponent = (_eid: EntityId, _name: string) => {
        // no-op, all components are always present currently
    };

    // removeComponent removes the component from the entity
    removeComponent = (_eid: EntityId, _name: string) => {
        // no-op, all components are always present currently
    };

    // return all eids in the world
    all = (): EntityId[] => {
        return this.entities.filter((id) => id !== undefined && id !== null);
    };

    // query returns a list of entities that have all given tags
    // or all entities if no tag is provided
    query = (...tags: number[]): EntityId[] => {
        if (tags.length === 0) {
            return this.all();
        }
        return this.all().filter((eid) => this.hasTag(eid, ...tags));
    };

    // addTag sets the bitfield for the tag on the entity
    // use this as a lightweight way to mark and filter entities
    // bring your own flags, no predefined tags
    addTag = (eid: EntityId, tag: number) => {
        this.tags.data.tag[eid] |= tag;
    };

    // removeTag clears the bit for the tag on the entity
    removeTag = (eid: EntityId, tag: number) => {
        this.tags.data.tag[eid] &= ~tag;
    };

    // addPlayer adds player data to the world
    // id is NOT an entity id, it can be any string
    addPlayer = (id: string, data: PlayerData<T['player']>) => {
        this.players.set(id, data);
        return data;
    };

    // remove player data from the world
    removePlayer = (id: string) => {
        this.players.delete(id);
    };

    // check if entity has all (AND) the given tags
    hasTag = (eid: EntityId, ...tags: number[]) => {
        if (tags.length === 0) {
            throw new Error('hasTag requires at least one tag');
        }
        const tagged = tags.reduce((acc, t) => acc | t, 0);
        return (this.tags.data.tag[eid] & tagged) === tagged;
    };

    // return a snapshot of the world state as an object suitable for serialization
    dump = () => {
        return structuredClone({
            t: this.t,
            entities: this.entities,
            players: this.players,
            components: Object.keys(this.components).map((name) => {
                return { name, component: this.components[name].data };
            }),
            tags: this.tags.data,
        });
    };

    // retore a dumped snapshot, overwrites the current world state
    // TODO: needs more validation
    load = (data: any) => {
        if (!data) {
            this.reset();
            return;
        }
        if (typeof data !== 'object') {
            throw new Error(
                'deserialize failed, invalid data, expected object got ' +
                    typeof data,
            );
        }
        data = structuredClone(data); // ensure we don't mutate the input
        this.t = data.t;
        this.entities = data.entities;
        this.players = data.players;
        for (const { name, component } of data.components) {
            this.components[name].data = component;
        }
        this.tags.data = data.tags;
    };

    // convert the world state to a format suitable for passing to systems
    toSystemArgs = (): SystemArgs<T> => {
        const components = Object.keys(this.components).reduce((acc, key) => {
            acc[key] = this.components[key].data;
            return acc;
        }, {}) as WorldComponentData<T>;
        const players = Array.from(this.players.values()).sort((a, b) =>
            a > b ? 1 : -1,
        );
        return {
            ...components,
            query: this.query,
            addEntity: this.addEntity,
            removeEntity: this.removeEntity,
            addComponent: this.addComponent,
            removeComponent: this.removeComponent,
            addTag: this.addTag,
            removeTag: this.removeTag,
            hasTag: this.hasTag,
            players,
            addPlayer: this.addPlayer,
            removePlayer: this.removePlayer,
            deltaTime: 0,
            t: this.t,
        };
    };
}

// args available to systems, whitelisted world funcs mostly
export type SystemArgs<T extends WorldSchema> = WorldComponentData<T> & {
    query: World<T>['query'];
    addEntity: World<T>['addEntity'];
    removeEntity: World<T>['removeEntity'];
    addComponent: World<T>['addComponent'];
    removeComponent: World<T>['removeComponent'];
    addTag: World<T>['addTag'];
    removeTag: World<T>['removeTag'];
    hasTag: World<T>['hasTag'];
    players: PlayerData<T['player']>[];
    addPlayer: World<T>['addPlayer'];
    removePlayer: World<T>['removePlayer'];
    deltaTime: number;
    t: number;
};

export function system<T extends WorldSchema = never>(
    fn: (data: SystemArgs<T>) => void,
) {
    return (w: World<T>, deltaTime: number) => {
        const args = w.toSystemArgs();
        fn({ ...args, deltaTime });
    };
}

// not used, just sketching/documenting how to use it
export function docs() {
    // define a schema
    const schema = {
        player: {
            name: Type.str,
            ship: Type.eid,
        },
        components: {
            transform: {
                x: Type.u8,
                y: Type.u8,
                z: Type.u8,
                rotation: Type.f32,
            },
            bigun: {
                id: Type.u64,
            },
        },
    };

    // create a world
    const w = new World(schema, 100);
    w.components.transform.data.x[0] = 10;

    // create an entity
    const eid = w.addEntity();

    // tag an entity
    // tags let you filter entities in systems
    enum Tags {
        IsShip = 1 << 0,
    }
    w.addTag(eid, Tags.IsShip);
    w.hasTag(eid, Tags.IsShip); // === true

    // create player data
    // player data is not a component, it's just a bag of stuff
    // you can use string in here
    const p = w.addPlayer('my-player-id', { name: '', ship: 0 });
    p.name = 'jeff';

    // query entities by tag
    for (const eid of w.query(Tags.IsShip)) {
        w.components.transform.data.x[eid] = 20;
    }

    // dump and load world state
    const snapshot = w.dump();
    const w2 = new World(schema, w.size);
    w2.load(snapshot);

    // define system to operate on entities/components
    const mySystem = system<typeof schema>(
        ({
            query,
            addTag,
            addEntity,
            players,
            transform,
            bigun,
            deltaTime,
        }) => {
            // do stuff with players
            for (const player of players) {
                if (!player.ship) {
                    player.ship = addEntity();
                    addTag(player.ship, Tags.IsShip);
                }
                player.name = 'jeff';
            }

            // do stuff with entities
            for (const ship of query(Tags.IsShip)) {
                transform.x[ship] = 0.1 * deltaTime;
                bigun.id[ship] = 100n;
            }
        },
    );

    // call the system with the world and deltaTime
    const deltaTime = 0.1;
    mySystem(w, deltaTime);
}
