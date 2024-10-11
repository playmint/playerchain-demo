import { FunctionComponent } from 'react';
import { Type, Vec2, Vec3, World } from '../runtime/ecs';
import {
    CancelFunc,
    GameModule,
    OnStateChange,
    PlayerData,
    RendererProps,
} from '../runtime/game';
import { mulberry32, patchMathLib, xmur3 } from './spaceshooter/lib/math';
import bulletSystem from './spaceshooter/systems/bulletSystem';
import healthSystem from './spaceshooter/systems/healthSystem';
import levelSystem from './spaceshooter/systems/levelSystem';
import physicsSystem from './spaceshooter/systems/physicsSystem';
import shipSystem from './spaceshooter/systems/shipSystem';

export const SESSION_TIME_SECONDS = 60 * 3; // 3mins
export const SESSION_START_SECONDS = 3;

// tags
export enum Tags {
    IsShip = 1 << 0,
    IsBullet = 1 << 1,
    IsSolidBody = 1 << 2, // enable physics for this thing
    IsWall = 1 << 3, // enable physics for this thing
}

// input mapping
export enum Input {
    None = 0,
    Forward = 1 << 0,
    Left = 1 << 1,
    Back = 1 << 2,
    Right = 1 << 3,
    Fire = 1 << 4,
    Respawn = 1 << 5,
    StartTimer = 1 << 6,
}

// type of models
export enum ModelType {
    None = 0,
    Ship = 1,
    Bullet = 2,
    Wall = 3,
}

// type of colliders
export enum ColliderType {
    None = 0,
    Circle = 1,
    Box = 2,
}

// audio clips
export enum AudioClip {
    None = 0,
    Shoot = 1,
    Hit = 2,
    Explode = 3,
    Respawn = 4,
}

// components
export const schema = {
    player: {
        input: Type.u32,
        ship: Type.eid,
        score: Type.u32,
        scoreMul: Type.u32,
        kills: Type.u32,
        deaths: Type.u32,
    },
    components: {
        entity: {
            active: Type.u8,
            generation: Type.u32,
            parent: Type.eid,
        },
        model: {
            type: Type.u8, // ModelType enum
            width: Type.f32,
            height: Type.f32,
            depth: Type.f32,
            color: Type.u32,
        },
        collider: {
            type: Type.u8, // ColliderType enum
            radius: Type.f32, // radius for circle colliders
            aX: Type.f32, // react points for polygon colliders
            aY: Type.f32,
            bX: Type.f32,
            bY: Type.f32,
            cX: Type.f32,
            cY: Type.f32,
            dX: Type.f32,
            dY: Type.f32,
            hasCollided: Type.u8,
            collisionEntity: Type.eid,
            collisionPointX: Type.f32,
            collisionPointY: Type.f32,
        },
        physics: {
            applyRotation: Type.f32,
            drag: Type.f32,
            isTrigger: Type.u8,
            bounciness: Type.f32,
        },
        position: Vec3,
        rotation: Vec3,
        velocity: Vec2,
        stats: {
            damage: Type.u8,
            health: Type.u8,
            shootTimer: Type.u8,
            hasExploded: Type.u8,
            hasRespawned: Type.u8,
            deathTimer: Type.u8,
            regenTimer: Type.u8,
        },
    },
};
export type ShooterSchema = typeof schema;

export class SpaceShooter implements GameModule {
    private _onChange: ((rawState: any) => void) | undefined;
    private input: Input = 0;
    world: World<ShooterSchema>;

    constructor() {
        this.world = new World(schema, 1000);
        patchMathLib();
    }

    init = async (): Promise<void> => {};

    onKeyDown = (key: string): void => {
        switch (key) {
            case 'w':
            case 'W':
            case 'ArrowUp':
                this.input |= Input.Forward;
                break;
            case 'a':
            case 'A':
            case 'ArrowLeft':
                this.input |= Input.Left;
                break;
            case 's':
            case 'S':
            case 'ArrowDown':
                this.input |= Input.Back;
                break;
            case 'd':
            case 'D':
            case 'ArrowRight':
                this.input |= Input.Right;
                break;
            case ' ':
            case 'Shift':
                this.input |= Input.Fire;
                break;
            /*
            case 'e':
            case 'E':
                this.input |= Input.Respawn;
                break;
                case 't':
                    case 'T':
                        this.input |= Input.StartTimer;
                        break;
                */
        }
    };

    onKeyUp = (key: string): void => {
        switch (key) {
            case 'w':
            case 'W':
            case 'ArrowUp':
                this.input &= ~Input.Forward;
                break;
            case 'a':
            case 'A':
            case 'ArrowLeft':
                this.input &= ~Input.Left;
                break;
            case 's':
            case 'S':
            case 'ArrowDown':
                this.input &= ~Input.Back;
                break;
            case 'd':
            case 'D':
            case 'ArrowRight':
                this.input &= ~Input.Right;
                break;
            case ' ':
            case 'Shift':
                this.input &= ~Input.Fire;
                break;
            /*
            case 'e':
            case 'E':
                this.input &= ~Input.Respawn;
                break;
            case 't':
            case 'T':
                this.input &= ~Input.StartTimer;
                break;
            */
        }
    };

    onUIEvent = (_event: string): void => {
        return;
    };

    getInput = (): number => {
        return this.input;
    };

    load = (data: any): void => {
        // this.world.reset(); // remove me
        if (!data) {
            this.world.reset();
            return;
        }
        this.world.load(data);
    };

    dump = (): any => {
        return this.world.dump();
    };

    run = (playerData: PlayerData[], deltaTime: number, t: number): void => {
        // patch math lib
        const seed = xmur3(t.toString() + 'spaceShooter');
        globalThis.Math.random = mulberry32(seed());

        // set the current tick
        this.world.t = t;
        // map playerData into the world
        for (const data of playerData) {
            // find or create the player data
            let p = this.world.players.get(data.id);
            if (!p) {
                p = this.world.addPlayer(data.id, {
                    input: 0,
                    ship: 0,
                    score: 0,
                    scoreMul: 1,
                    kills: 0,
                    deaths: 0,
                });
            }
            p.input = data.input;
        }

        // execute the game systems
        levelSystem(this.world, deltaTime);
        shipSystem(this.world, deltaTime);
        physicsSystem(this.world, deltaTime);
        healthSystem(this.world, deltaTime);
        bulletSystem(this.world, deltaTime);
    };

    getRenderComponent = (): FunctionComponent<RendererProps> | null => {
        // can't get this to work with HMR... see main Renderer for switch
        // return ShooterRenderer;
        return null;
    };

    subscribe = (fn: OnStateChange): CancelFunc => {
        this._onChange = fn;
        return () => {
            this._onChange = undefined;
        };
    };

    notify = () => {
        if (this._onChange) {
            this._onChange(this.world);
        }
    };
}

export function hasInput(val: number, inp: Input): boolean {
    return (val! & inp) === inp;
}
