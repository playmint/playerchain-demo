import { InputDB, InputPacket, RoundActions } from '../types';

export class MemoryDB implements InputDB {
    data: Map<number, RoundActions>;
    needsReplayFromRound: number = 0;
    latestReturnedRound: number = -1;

    constructor() {
        this.data = new Map();
    }
    ready(): Promise<void> {
        return Promise.resolve();
    }

    addInput(packet: InputPacket): boolean {
        const actionsForRound = this.data.get(packet.round) ?? new Map();
        if (actionsForRound.has(packet.peerId)) {
            // console.warn('duplicate input', packet);
            return true; // dup isn't a failure
        }
        actionsForRound.set(packet.peerId, packet.input);
        this.data.set(packet.round, actionsForRound);

        // if this packet is being set in the past, we need to replay from that round
        if (
            packet.round <= this.latestReturnedRound &&
            packet.round < this.needsReplayFromRound
        ) {
            this.needsReplayFromRound = packet.round;
        }
        return true;
    }

    // get all inputs since the last time that this func was called
    // but none from rounds above $round
    getDelta(maxRound?: number): Array<InputPacket[]> {
        maxRound = maxRound ?? Infinity;
        const rounds: Array<InputPacket[]> = [];
        for (let i = this.needsReplayFromRound; i < maxRound; i++) {
            const actionsForRound = this.getInputs(i);
            if (!actionsForRound) {
                break;
            }
            rounds.push(actionsForRound);
        }
        // console.log(`getDelta(${round}) => `, rounds);
        if (rounds.length === 0) {
            return rounds;
        }
        this.latestReturnedRound = rounds[rounds.length - 1][0].round;
        this.needsReplayFromRound = this.latestReturnedRound + 1;
        return rounds;
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

    sync(_round: number): void {
        // no concept of sync in memory db so nothing to do
        return;
    }
}
