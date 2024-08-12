import { InputPacket } from '../runtime/network/types';

let counter = 0;

export function fakeSystem(actionsByRound: InputPacket[][]) {
    counter++;
    return counter;
}
