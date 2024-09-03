import { World, query } from '../../runtime/ecs';
import {
    GameModule,
    Model,
    RenderSchema,
    SimulationSchema,
    Traits,
    hasTrait,
} from '../../runtime/game';

export enum Input {
    None = 0,
    Forward = 1 << 0,
    Left = 1 << 1,
    Back = 1 << 2,
    Right = 1 << 3,
}

export class DummyGameModule implements GameModule {
    private input: Input = 0;

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

    update = (world: World<SimulationSchema>): World<SimulationSchema> => {
        for (const entity of query(world)) {
            if (hasTrait(entity, Traits.Player)) {
                // attach a box model to the Player
                if (!entity.object) {
                    entity.object = {
                        type: Model.Box,
                        size: 1,
                        position: [0, 0, 0],
                        rotation: 0,
                    };
                }

                // handle input to move the player's box
                if (hasInput(entity, Input.Forward)) {
                    entity.object.position[2] -= 0.1;
                } else if (hasInput(entity, Input.Back)) {
                    entity.object.position[2] += 0.1;
                }
                if (hasInput(entity, Input.Left)) {
                    entity.object.position[0] -= 0.1;
                } else if (hasInput(entity, Input.Right)) {
                    entity.object.position[0] += 0.1;
                }
            }
        }
        return world;
    };

    render = (world: World<RenderSchema>): World<RenderSchema> => {
        // attach click handler to blocks
        return world;
    };
}

function hasInput(entity: SimulationSchema, inp: Input): boolean {
    return (entity.input! & inp) === inp;
}
