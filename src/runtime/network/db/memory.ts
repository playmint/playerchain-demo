import { InputDB, InputPacket, RoundActions } from '../types';

export class MemoryDB implements InputDB {
    data: Map<number, RoundActions>;
    constructor() {
        this.data = new Map();
    }
    ready(): Promise<void> {
        return Promise.resolve();
    }

    addInput(packet: InputPacket) {
        const actionsForRound = this.data.get(packet.round) ?? new Map();
        if (actionsForRound.has(packet.peerId)) {
            // console.warn('duplicate input', packet);
            return; //ignore dup
        }
        actionsForRound.set(packet.peerId, packet.input);
        this.data.set(packet.round, actionsForRound);
    }

    getInputs(round: number): InputPacket[] | undefined {
        const inputs = this.data.get(round);
        if (!inputs) {
            return undefined;
        }
        return Array.from(inputs.entries())
            .map(([peerId, input]) => ({
                peerId,
                round,
                input,
            }))
            .sort((a, b) => {
                return a.peerId < b.peerId ? -1 : 1;
            });
    }

    isAcknowledged(_round: number): boolean {
        // no concept of sync in memory db so always return true
        return true;
    }

    sync(_round: number): void {
        // no concept of sync in memory db so nothing to do
        return;
    }
}
