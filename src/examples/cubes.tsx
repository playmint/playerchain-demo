import { FunctionComponent } from 'react';
import { Type, Vec3, World } from '../runtime/ecs';
import {
    CancelFunc,
    GameModule,
    OnStateChange,
    PlayerData,
    RendererProps,
} from '../runtime/game';
import main from './cubes/systems/main';

// import { CubesRenderer } from './cubes/CubesRenderer';

export enum Input {
    None = 0,
    Forward = 1 << 0,
    Left = 1 << 1,
    Back = 1 << 2,
    Right = 1 << 3,
}

// tags
export enum Tags {
    IsPlayerCube = 1 << 0,
    IsSpinner = 1 << 1,
}

// renderable object types
export enum ObjectType {
    None = 0,
    PlayerBox = 1,
    SpinnyBox = 2,
}

// components
export const schema = {
    player: {
        name: Type.str,
        color: Type.u32,
        input: Type.u32,
        box: Type.eid, // player's character
    },
    components: {
        object: {
            type: Type.u8, // 0=none, 1=box
            size: Type.f32,
            color: Type.u32,
        },
        position: Vec3,
        rotation: Vec3,
    },
};
export type CubesSchema = typeof schema;

// module
export class Cubes implements GameModule {
    private input: Input = 0;
    private _onChange: OnStateChange | undefined;
    world: World<CubesSchema>;
    constructor() {
        this.world = new World(schema, 1000);
    }

    onKeyDown = (key: string): void => {
        switch (key) {
            case 'w':
                this.input |= Input.Forward;
                break;
            case 'a':
                this.input |= Input.Left;
                break;
            case 's':
                this.input |= Input.Back;
                break;
            case 'd':
                this.input |= Input.Right;
                break;
        }
    };

    onKeyUp = (key: string): void => {
        switch (key) {
            case 'w':
                this.input &= ~Input.Forward;
                break;
            case 'a':
                this.input &= ~Input.Left;
                break;
            case 's':
                this.input &= ~Input.Back;
                break;
            case 'd':
                this.input &= ~Input.Right;
                break;
        }
    };

    onUIEvent = (_event: string): void => {
        return;
    };

    getInput = (): number => {
        return this.input;
    };

    load = (data: any): void => {
        if (!data) {
            this.world.reset();
            return;
        }
        this.world.load(data);
    };

    dump = (): any => {
        return this.world.dump();
    };

    run = (playerData: PlayerData[], fixedDeltaTime: number): void => {
        // map playerData into the world
        for (const data of playerData) {
            // find or create the player data
            let p = this.world.players.get(data.id);
            if (!p) {
                p = this.world.addPlayer(data.id, {
                    name: data.name,
                    color: 0x222222,
                    input: 0,
                    box: 0,
                });
                console.log('created player data', data.id, data.id);
            }
            p.input = data.input;
        }

        // execute the game systems
        main(this.world, fixedDeltaTime);
    };

    getRenderComponent = (): FunctionComponent<RendererProps> | null => {
        // HMR breaks this so theres a hard coded switch in the renderer gah
        // return CubesRenderer;
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

export default new Cubes();
