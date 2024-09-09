import { FC } from 'react';
import { Cubes } from '../examples/cubes';
import { SpaceShooter } from '../examples/spaceshooter';
import { importStatic } from './utils';

export enum Model {
    None = 0,
    Box = 1,
    Ship = 2,
}

export type PlayerData = {
    id: string; // peerId hex
    name: string; // short name, capped to 16 characters
    input: number; // bitfield of input keys
};

export interface RendererProps {
    peerId: string; // the peerId of the viewing player
    mod: GameModule; // the game module implementation
    channelId: string; // the channelId of the game
}

export type OnStateChange = (rawState: any) => void;
export type CancelFunc = () => void;

// module that implements the executinon engine
export interface GameModule {
    onKeyDown: (key: string) => void;
    onKeyUp: (key: string) => void;
    getInput: () => number;
    onUIEvent: (event: string) => void;
    load: (data?: any) => void;
    dump: () => any;
    run: (playerData: PlayerData[], fixedDeltaTime: number, t: number) => void;
    getRenderComponent: () => FC<RendererProps> | null;
    subscribe: (fn: OnStateChange) => CancelFunc;
    notify: () => void;
}

// yeah this isn't really dynamiocally loading modules, just faking it
// it's surprizingly hard to get dynamic imports to work in vite
export async function load(src: string): Promise<GameModule> {
    if (src.includes('spaceshooter')) {
        return new SpaceShooter();
    } else if (src.includes('cubes')) {
        return new Cubes();
    } else {
        return importStatic(src).then((m) => m.default);
    }
}
