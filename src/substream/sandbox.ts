import { InputPacket } from '../runtime/network/types';
import { fakeSystem } from './fakeSystem';

function update(actionsByRoundJSON?: string) {
    if (!actionsByRoundJSON) {
        return;
    }

    const actionsByRound = JSON.parse(actionsByRoundJSON) as InputPacket[][];
    return _update(actionsByRound);
}

function _update(actionsByRound: InputPacket[][]) {
    return fakeSystem(actionsByRound);
}

update();
