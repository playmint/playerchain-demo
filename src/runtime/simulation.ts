import Dexie from 'dexie';
import database, { DB, SerializedState, StateTag } from './db';
import { GameModule, PlayerData, load } from './game';
import { IncrementalCache } from './lru';
import { InputMessage, MessageType } from './messages';
import { SequencerMode } from './sequencer';

export type State = {
    t: number;
    data: any;
    inputs: PlayerData[];
};

export type RoundInput = {
    round: number;
    updated: number;
    unconfirmed?: boolean;
    inputs: PlayerData[];
};

export type SimResult = {
    state: State;
    runs: number; // how many ticks were processed
};

export interface SimulationConfig {
    dbname: string;
    channelId: string;
    src: string; // URL to the game module to load
    rate: number;
    inputBuffer?: number;
    idleTimeout?: number;
    mode: SequencerMode;
    peerId: string;
    channelPeerIds: string[];
    inputDelay: number;
    interlace: number;
}

export class Simulation {
    private fixedUpdateRate: number;
    private channelId: string;
    private mod: Promise<GameModule>;
    private idleTimeoutRounds: number;
    private stateCache: IncrementalCache<number, SerializedState>;
    private stateBuffer = 300;
    private mode: SequencerMode;
    private peerId: string;
    private channelPeerIds: string[];
    private inputDelay: number; // in "ticks"
    private db: DB;
    interlace: number;
    cueing = false;

    constructor({
        src,
        dbname,
        channelId,
        rate,
        idleTimeout,
        mode,
        peerId,
        channelPeerIds,
        inputDelay,
        interlace,
    }: SimulationConfig) {
        this.peerId = peerId;
        this.channelPeerIds = channelPeerIds.sort((a, b) => (a < b ? -1 : 1));
        this.mode = mode;
        this.inputDelay = inputDelay;
        this.interlace = interlace;
        this.mod = load(src);
        this.channelId = channelId;
        this.db = database.open(dbname);
        this.fixedUpdateRate = rate;
        this.idleTimeoutRounds = idleTimeout ? idleTimeout : 60; // game pauses if no input for this many rounds
        // this.inputBuffer = typeof inputBuffer === 'number' ? inputBuffer : 2;
        this.stateCache = new IncrementalCache<number, SerializedState>(
            this.stateBuffer,
        );
    }

    async init() {}

    getFixedUpdateRate() {
        return this.fixedUpdateRate;
    }

    async rate(): Promise<number> {
        return this.fixedUpdateRate;
    }

    async getCurrentRoundLimit(): Promise<number> {
        if (this.mode === SequencerMode.WALLCLOCK) {
            return await this.getCurrentRoundLimitFromTime();
        } else if (this.mode === SequencerMode.CORDIAL) {
            return await this.getCurrentRoundLimitFromMessages();
        } else {
            throw new Error('unknown sequencer mode');
        }
    }

    private async getCurrentRoundLimitFromMessages(): Promise<number> {
        const latest = (await this.db.messages
            .where(['channel', 'peer', 'round'])
            .between(
                [this.channelId, this.peerId, Dexie.minKey],
                [this.channelId, this.peerId, Dexie.maxKey],
            )
            .last()) as InputMessage | undefined;
        if (!latest) {
            return 1;
        }
        return latest.round - this.inputDelay; // FIXME: how can we be smart about the offset
    }

    private async getCurrentRoundLimitFromTime(): Promise<number> {
        // find the latest round we have a message for
        const m = await this.db.messages
            .where(['channel', 'round', 'peer'])
            .between(
                [this.channelId, Dexie.minKey, Dexie.minKey],
                [this.channelId, Dexie.maxKey, Dexie.maxKey],
            )
            .last();
        const latestKnownRound =
            m && m.type === MessageType.INPUT ? m.round : 0;
        // the max round we can process is idle timeout rounds ahead of the latest known round
        return latestKnownRound + this.idleTimeoutRounds;
    }

    private async getRollbackState(toRound: number): Promise<SerializedState> {
        // what was the last state we processed?
        let latestState = this.stateCache.getBefore(toRound);
        if (!latestState) {
            // nothing in cache, ask the db
            console.log('state-cache-miss-latest');
            latestState = await this.db.state
                .where(['channel', 'tag', 'round'])
                .between(
                    [this.channelId, StateTag.ACCEPTED, Dexie.minKey],
                    [this.channelId, StateTag.ACCEPTED, toRound],
                )
                .last();
            // add it to the hot cache
            if (latestState) {
                this.stateCache.set(latestState.round, latestState);
            }
        }
        if (!latestState) {
            // we have NO state at all, must be our first day on the job, better create one
            const serialized: SerializedState = {
                tag: StateTag.ACCEPTED,
                channel: this.channelId,
                round: 0,
                updated: 0, // is that ok?
                state: {
                    t: 0,
                    data: null,
                    inputs: [],
                },
            };
            await this.db.state.put(serialized);
            latestState = serialized;
        }
        // have any of the tapes changed since then?
        let startFromRound = latestState.round;
        await this.db.tapes
            .where(['channel', 'updated'])
            .between(
                [this.channelId, latestState.updated + 1],
                [this.channelId, Dexie.maxKey],
            )
            .each((tape) => {
                if (tape.round <= startFromRound) {
                    startFromRound = tape.round - 1;
                }
            });
        // always fetch enough to recalculate the wave
        startFromRound = Math.max(startFromRound - 1, 1); // FIXME: this need to fetch interlace*2 rounds, removed while working on 4xplayer
        // find the closest state to satisfy startFromRound
        // if we're already at the round we need, return it
        if (latestState.round === startFromRound) {
            return latestState;
        }
        // try the memory cache first
        const memoryCheckpoint = this.stateCache.getBefore(startFromRound + 1);
        if (memoryCheckpoint) {
            if (memoryCheckpoint.round === startFromRound + 1) {
                throw new Error('asset-failed: should be less than');
            }
            return memoryCheckpoint;
        }
        console.log('state-cache-miss-before', startFromRound + 1);
        // ..then the disk csche
        const diskCheckpoint = await this.db.state
            .where(['channel', 'tag', 'round'])
            .between(
                [this.channelId, StateTag.ACCEPTED, Dexie.minKey],
                [this.channelId, StateTag.ACCEPTED, startFromRound + 1],
            )
            .last();
        if (!diskCheckpoint) {
            throw new Error('no-state-checkpoint-found-to-rollback-to');
        }
        if (diskCheckpoint.round === startFromRound + 1) {
            throw new Error('assert-failed: should be less than');
        }
        return diskCheckpoint;
    }

    async cue(targetRound: number): Promise<SimResult | null> {
        if (this.cueing) {
            console.warn('cue-already-in-progress');
            return null;
        }
        this.cueing = true;
        try {
            return await this._cue(targetRound);
        } catch (err) {
            console.error('cue-error:', err);
            throw err;
        } finally {
            this.cueing = false;
        }
    }
    private async _cue(targetRound: number): Promise<SimResult | null> {
        // find the round to process to
        const toRound = Math.min(
            await this.getCurrentRoundLimit(),
            targetRound,
        );

        // find the round we need to process from
        const rollbackState = await this.getRollbackState(toRound);
        const fromRound = rollbackState.round;

        // santize the range
        if (toRound <= fromRound) {
            throw new Error(
                'invalid-round-range: toRound cannot be before fromRound',
            );
        }

        // get all the tapes in the range
        const tapes = await this.db.tapes
            .where(['channel', 'round'])
            .between([this.channelId, fromRound + 1], [this.channelId, toRound])
            .toArray();
        // group the messages by round
        let prevUpdated = rollbackState.updated;
        let prevRound: number = rollbackState.round;
        const roundData: RoundInput[] = [];
        for (const tape of tapes) {
            if (tape.updated > prevUpdated) {
                prevUpdated = tape.updated;
            }
            let round = roundData.find((r) => r.round === tape.round);
            if (round) {
                throw new Error('assert-failed: round already exists');
            }
            // push fake tapes for any delta
            const delta = tape.round - prevRound - 1;
            for (let i = 0; i < delta; i++) {
                prevRound++;
                roundData.push({
                    round: prevRound,
                    updated: prevUpdated,
                    inputs: this.channelPeerIds.map((id) => ({ id, input: 0 })),
                });
            }
            // assert we have not missed any rounds
            if (tape.round !== prevRound + 1) {
                throw new Error('assert-failed: missed round');
            }
            // insert the real tape
            round = {
                round: tape.round,
                updated: tape.updated,
                inputs: tape.inputs.map((input, i) => ({
                    id: this.channelPeerIds[i],
                    input: input > 0 ? input : 0,
                })),
            };
            prevRound = tape.round;
            roundData.push(round);
            if (tape.updated > round.updated) {
                round.updated = tape.updated;
            }
            // if round is at or after the finalization point, then
            // we need to check if the message is accepted or rejected
            // const offsetFromFinalization = latestRound - m.round;
            // const needsFinalization =
            //     offsetFromFinalization > this.interlace * 2;
            // let accepted = true;
            // // is well acked?
            // // TODO: reduce this number to supermajority
            // const requiredConfirmations = 0;
            // if (
            //     needsFinalization &&
            //     m.confirmations[requiredConfirmations] < requiredConfirmations
            // ) {
            //     console.log(
            //         `DROP INPUT needed=${requiredConfirmations} got=${m.confirmations[requiredConfirmations]} all=${m.confirmations}`,
            //     );
            //     accepted = false;
            // }
            // inp.input = accepted && m.type == MessageType.INPUT ? m.data : 0;

            // round.unconfirmed = !needsFinalization;
        }
        // apply the messages on top of the state
        let runs = 0;
        const checkpoints: SerializedState[] = [];

        // load the state into the game
        const deltaTime = this.fixedUpdateRate / 1000;
        const initialState = rollbackState.state;
        const mod = await this.mod;
        mod.load(initialState.data);

        // the state to render
        let state = initialState;

        for (let i = 0; i < roundData.length; i++) {
            const round = roundData[i];
            // check if we already have a state processed for these inputs
            const cachedCheckpoint = this.stateCache.get(round.round);
            if (cachedCheckpoint) {
                // check the inputs are the same
                const sameInputs =
                    cachedCheckpoint.state.inputs.length ===
                        round.inputs.length &&
                    cachedCheckpoint.state.inputs.every((input, i) => {
                        return input.input === round.inputs[i].input;
                    });
                if (sameInputs) {
                    cachedCheckpoint.updated = round.updated;
                    state = cachedCheckpoint.state;
                    mod.load(state.data);
                    continue;
                }
            }
            mod.run(round.inputs, deltaTime, round.round);
            runs++;

            // update first, last and every 200th checkpoints
            // if (i === 0 || round.round % 200 === 0 || i === roundData.length - 1) {
            // maybe write it if it's a checkpoint round
            state = {
                t: round.round,
                inputs: round.inputs,
                data: mod.dump(),
            };
            const checkpoint: SerializedState = {
                tag: StateTag.ACCEPTED,
                channel: this.channelId,
                round: round.round,
                updated: round.updated,
                state,
            };
            // invalidate all states from this point forward
            // await this.db.state
            //     .where(['channel', 'tag', 'round'])
            //     .between(
            //         [this.channelId, StateTag.ACCEPTED, checkpoint.round],
            //         [this.channelId, StateTag.ACCEPTED, Dexie.maxKey],
            //     )
            //     .delete();
            if (checkpoint.round % 200 === 0) {
                // write the checkpoint
                checkpoints.push(checkpoint);
            }
            this.stateCache.set(checkpoint.round, checkpoint);
            // }
        }
        // write any state checkpoints to the db
        if (checkpoints.length > 0) {
            console.log(
                `CHECKPOINT
                    toRound=${toRound}
                    fromRound=${fromRound}
                    ticks=${toRound - fromRound}
                    states=${checkpoints.length}
                    applies=${roundData.length}
                    emutick=${Math.min(toRound - prevRound, this.idleTimeoutRounds)}
                    tapes=${tapes.length}
                    inputs=${roundData.length}
                    prevUpdated=${prevUpdated}
                `,
            );
            // write the state to the store
            // await this.db.state.bulkPut(checkpoints);
        }
        // console.log(
        //     `simulated
        //         toRound=${toRound}
        //         fromRound=${fromRound}
        //         ticks=${toRound - fromRound}
        //         fakes=${fakes}
        //     `,
        // );
        return { state, runs };
    }

    destroy() {}
}
