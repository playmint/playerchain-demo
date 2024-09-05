import Dexie from 'dexie';
import database, { DB, SerializedState, StateTag } from './db';
import { GameModule, PlayerData, load } from './game';
import { IncrementalCache } from './lru';
import { MessageType } from './messages';

export type State = {
    t: number;
    data: any;
    inputs: PlayerData[];
};

export type RoundInput = {
    round: number;
    arrived: number;
    delta: number;
    fake?: boolean;
    inputs: PlayerData[];
};

export interface SimulationConfig {
    dbname: string;
    channelId: string;
    src: string; // URL to the game module to load
    rate?: number;
    inputBuffer?: number;
    idleTimeout?: number;
}

export class Simulation {
    private fixedUpdateRate: number;
    private channelId: string;
    private mod: Promise<GameModule>;
    private idleTimeoutRounds: number;
    private stateCache: IncrementalCache<number, SerializedState>;
    private stateBuffer = 100;
    private db: DB;

    constructor({
        src,
        dbname,
        channelId,
        rate,
        idleTimeout,
        // inputBuffer,
    }: SimulationConfig) {
        this.mod = load(src);
        this.channelId = channelId;
        this.db = database.open(dbname);
        this.fixedUpdateRate = rate ? rate : 200;
        this.idleTimeoutRounds = idleTimeout ? idleTimeout : 60; // game pauses if no input for this many rounds
        // this.inputBuffer = typeof inputBuffer === 'number' ? inputBuffer : 2;
        this.stateCache = new IncrementalCache<number, SerializedState>(
            this.stateBuffer,
        );
    }

    configure(config: { stf: () => void }) {
        config.stf();
    }

    getFixedUpdateRate() {
        return this.fixedUpdateRate;
    }

    private async apply(inState: State, round: RoundInput): Promise<State> {
        try {
            return this._apply(inState, round);
        } catch (err) {
            console.error(`apply-error: ${err}`);
            throw err;
        }
    }

    private async _apply(inState: State, round: RoundInput): Promise<State> {
        const deltaTime = this.fixedUpdateRate / 1000;
        const mod = await this.mod;
        // clone the world
        const nextState = structuredClone(inState);
        // ensure inputs are in deterministic order
        const inputs = round.inputs.sort((a, b) => {
            return a.id < b.id ? -1 : 1;
        });
        const resetInputs = (s: State) => {
            s.inputs = s.inputs.map((input) => ({
                ...input,
                input: 0,
            }));
        };
        // fast forward through all the empty deltas
        mod.load(nextState.data);
        for (let r = 0; r < round.delta; r++) {
            nextState.t = round.round - round.delta + r;
            // wipe out any existing input state, we do this every round%N
            // see sequencer for mirror of the round%N logic
            if (nextState.t % 10 === 0) {
                resetInputs(nextState);
            }
            mod.run(nextState.inputs, deltaTime);
        }
        // reset inputs on Nth round
        if (round.round % 10 === 0) {
            resetInputs(nextState);
        }
        // update player input data
        nextState.inputs = inputs.map((input) => ({
            ...input,
        }));
        // tick the game logic forward
        nextState.t = round.round;
        mod.run(nextState.inputs, deltaTime);
        nextState.data = mod.dump();
        // return the copy of the state
        return nextState;
    }

    private async getState(toRound: number): Promise<SerializedState> {
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
                arrived: 0, // is that ok?
                state: {
                    t: 0,
                    data: null,
                    inputs: [],
                },
            };
            await this.db.state.put(serialized);
            latestState = serialized;
        }
        // have we seen any new messages since then that invalidate it?
        let startFromRound = latestState.round;
        await this.db.messages
            .where(['channel', 'arrived'])
            .between(
                [this.channelId, latestState.arrived],
                [this.channelId, Dexie.maxKey],
                false,
            )
            .each((m) => {
                if (m.type !== MessageType.INPUT) {
                    return;
                }
                if (m.round <= startFromRound) {
                    startFromRound = m.round - 1;
                }
            });
        // find the closest state to satisfy startFromRound
        // if we're already at the round we need, return it
        if (latestState.round === startFromRound) {
            return latestState;
        }
        // ask the cache
        const cachedState = this.stateCache.getBefore(startFromRound + 1);
        if (cachedState) {
            if (cachedState.round === startFromRound + 1) {
                throw new Error('asset-failed: should be less than');
            }
            return cachedState;
        }
        console.log('state-cache-miss-before', startFromRound + 1);
        // ask the db for last checkpoint
        const checkpoint = await this.db.state
            .where(['channel', 'tag', 'round'])
            .between(
                [this.channelId, StateTag.ACCEPTED, Dexie.minKey],
                [this.channelId, StateTag.ACCEPTED, startFromRound + 1],
            )
            .last();
        if (!checkpoint) {
            throw new Error('no-state-checkpoint-found-to-rollback-to');
        }
        if (checkpoint.round === startFromRound + 1) {
            throw new Error('asset-failed: should be less than');
        }
        return checkpoint;
    }

    private async getCurrentRoundLimit(): Promise<number> {
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

    now(): number {
        return Math.floor(Date.now() / this.fixedUpdateRate);
    }

    async rate(): Promise<number> {
        return this.fixedUpdateRate;
    }

    async cue(targetRound: number): Promise<State> {
        // find the round to process to
        const toRound = Math.min(
            await this.getCurrentRoundLimit(),
            targetRound,
        );

        // find the round we need to process from
        const rollbackState = await this.getState(toRound);
        const fromRound = rollbackState.round;

        // santize the range
        if (toRound <= fromRound) {
            throw new Error(
                'invalid-round-range: toRound cannot be before fromRound',
            );
        }

        // get all the messages that occured in the range
        const messages = (
            await this.db.messages
                .where(['channel', 'round', 'peer'])
                .between(
                    [this.channelId, fromRound + 1, Dexie.minKey],
                    [this.channelId, toRound + 1, Dexie.maxKey],
                )
                .toArray()
        )
            .filter((m) => m.type === MessageType.INPUT)
            .sort((a, b) => {
                return a.round - b.round;
            });
        // group the messages by round
        let prevArrived = rollbackState.arrived;
        let prevRound = fromRound;
        const roundInputs: RoundInput[] = [];
        for (const m of messages) {
            if (m.arrived > prevArrived) {
                prevArrived = m.arrived;
            }
            if (m.type !== MessageType.INPUT) {
                continue; // ignore non-input messages
            }
            let round = roundInputs.find((r) => r.round === m.round);
            if (!round) {
                round = {
                    round: m.round,
                    arrived: m.arrived,
                    delta: m.round - prevRound - 1,
                    inputs: [],
                };
                prevRound = m.round;
                roundInputs.push(round);
                // handle idle
                if (round.delta > this.idleTimeoutRounds) {
                    round.delta = this.idleTimeoutRounds;
                }
            }
            if (m.arrived > round.arrived) {
                round.arrived = m.arrived;
            }
            const peerId = Buffer.from(m.peer).toString('hex');
            round.inputs.push({
                id: peerId,
                name: peerId.slice(0, 8), // TODO: get alias form somewhere
                input: m.type == MessageType.INPUT ? m.data : 0,
            });
        }
        // play the messages on top of the state
        let state = rollbackState.state;
        // push in the emulated tick for toRound if no messages
        if (prevRound < toRound) {
            roundInputs.push({
                round: toRound,
                arrived: prevArrived,
                delta: toRound - prevRound - 1,
                inputs: [],
                fake: true,
            });
        }
        const checkpoints: SerializedState[] = [];
        for (const round of roundInputs) {
            state = await this.apply(state, round);
            // maybe write it if it's a checkpoint round
            if (!round.fake) {
                const checkpoint: SerializedState = {
                    tag: round.fake ? StateTag.PREDICTED : StateTag.ACCEPTED,
                    channel: this.channelId,
                    round: round.fake ? -1 : round.round,
                    arrived: round.fake ? -1 : round.arrived,
                    state,
                };
                // invalidate all states from this point forward
                // TODO: we don't reall need to do this in a loop, the first one clears them all
                await this.db.state
                    .where(['channel', 'tag', 'round'])
                    .between(
                        [this.channelId, StateTag.ACCEPTED, checkpoint.round],
                        [this.channelId, StateTag.ACCEPTED, Dexie.maxKey],
                    )
                    .delete();
                if (checkpoint.round % 100 === 0) {
                    // write the checkpoint
                    checkpoints.push(checkpoint);
                }
                this.stateCache.set(checkpoint.round, checkpoint);
            }
        }
        // update the last processed cursors
        if (checkpoints.length > 0) {
            console.log(
                `writing-states
                    states=${checkpoints.length} 
                    applies=${roundInputs.length} 
                    ticks=${toRound - fromRound} 
                    emutick=${Math.min(toRound - prevRound, this.idleTimeoutRounds)} 
                    fromRound=${fromRound} 
                    toRound=${toRound}
                    messages=${messages.length}
                    inputs=${roundInputs.length}
                    lastArrived=${prevArrived}
                `,
            );
            // write the state to the store
            // await this.db.state.bulkPut(checkpoints);
        }
        return state;
    }

    destroy() {}
}
