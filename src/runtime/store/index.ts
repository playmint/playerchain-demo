import { uiElement } from '../../substream/UISystem';

export class Entity {
    id = -1;
    position = { x: 0, y: 0, z: 0 };
    prevPosition = { x: 0, y: 0, z: 0 };
    lastUpdated = 0;
    velocity = { x: 0, y: 0 };
    force = { x: 0, y: 0 };
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
    isBullet = false;
    UIElement!: uiElement;

    isShip = false;

    labelText: string = '';

    actions = {
        forward: false,
        back: false,
        left: false,
        right: false,
        fire: false,
    };
    lastShotRound = 0;
    shootBullet = false;
    physics?: PhysicsComponent;
    renderer?: RendererComponent;
    hits = 0;
}

export interface PhysicsComponent {
    rigidBody: {
        kind: RigidBodyKind;
        collider: {
            isSensor: boolean;
            checkCollisions: boolean;
            size: { x: number; y: number };
        };
        lockRotations: boolean;
        handle?: {
            id: number;
        };
    };
    collisions: number[];
}

export interface RendererComponent {
    visible: boolean;
    color: number;
    size: { x: number; y: number };
    geometry: GeometryKind;
}

export enum RigidBodyKind {
    None,
    Dynamic,
    Fixed,
    KinematicVelocity,
    KinematicPosition,
}

export enum GeometryKind {
    Box,
    Sphere,
}

export class Store {
    entities: Entity[] = [];

    add() {
        const e = new Entity();
        this.entities.push(e);
        e.id = this.entities.length - 1;

        // console.log('added entity', e.id);

        return e;
    }

    /** @param {Entity[]} entities */
    static from(entities) {
        const store = new Store();
        store.entities = entities;
        return store;
    }
}
