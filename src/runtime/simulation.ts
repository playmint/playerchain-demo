import Dexie from 'dexie';
import database, { DB, SerializedState, StateTag, StoredMessage } from './db';
import { GameModule, PlayerData, load } from './game';
import { IncrementalCache } from './lru';
import { InputMessage, MessageType } from './messages';
import { SequencerMode, requiredConfirmationsFor } from './sequencer';

export type State = {
    t: number;
    data: any;
    inputs: PlayerData[];
};

export type RoundInput = {
    round: number;
    updated: number;
    delta: number;
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
    private interlace: number;
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
        this.channelPeerIds = channelPeerIds;
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
        const ourLatest = (await this.db.messages
            .where(['channel', 'peer', 'round'])
            .between(
                [this.channelId, this.peerId, Dexie.minKey],
                [this.channelId, this.peerId, Dexie.maxKey],
            )
            .last()) as InputMessage | undefined;
        if (!ourLatest) {
            return 1;
        }
        return ourLatest.round - this.inputDelay; // FIXME: how can we be smart about the offset
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
        // have we seen any new messages since then that invalidate it?
        let startFromRound = latestState.round;
        await this.db.messages
            .where(['channel', 'updated'])
            .between(
                [this.channelId, latestState.updated + 1],
                [this.channelId, Dexie.maxKey],
            )
            .each((m) => {
                if (m.type !== MessageType.INPUT) {
                    return;
                }
                if (m.peer && !this.channelPeerIds.includes(m.peer)) {
                    // ignore messages from peers not accepted in the set
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

        const { messages, rollbackState, fromRound } =
            await this.db.transaction(
                'rw',
                [this.db.state, this.db.messages] as any,
                async () => {
                    // find the round we need to process from
                    const rollbackState = await this.getRollbackState(toRound);
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
                                [this.channelId, toRound, Dexie.maxKey],
                            )
                            .toArray()
                    )
                        .filter((m) => m.type === MessageType.INPUT)
                        .filter(
                            (m) =>
                                m.peer && this.channelPeerIds.includes(m.peer),
                        )
                        .sort((a, b) => {
                            return a.round - b.round;
                        });
                    return { messages, rollbackState, fromRound };
                },
            );
        // group the messages by round
        let latestRound: number | null = null;
        let prevUpdated = rollbackState.updated;
        let prevRound = fromRound;
        const roundData: RoundInput[] = [];
        const validMessages = messages.reduce((acc, m) => {
            if (m.type !== MessageType.INPUT) {
                return acc;
            }
            if (latestRound === null || m.round > latestRound) {
                latestRound = m.round;
            }
            acc.push(m);
            return acc;
        }, [] as StoredMessage[]);
        for (const m of validMessages) {
            if (latestRound === null) {
                throw new Error(
                    'assert-failed: latestRound must not be null here',
                );
            }
            if (m.type !== MessageType.INPUT) {
                continue;
            }
            if (m.updated > prevUpdated) {
                prevUpdated = m.updated;
            }
            let round = roundData.find((r) => r.round === m.round);
            if (!round) {
                round = {
                    round: m.round,
                    updated: m.updated,
                    delta: m.round - prevRound - 1,
                    inputs: this.channelPeerIds.map((id) => ({
                        id,
                        input: 0,
                    })),
                };
                prevRound = m.round;
                roundData.push(round);
                // handle idle
                if (round.delta > this.idleTimeoutRounds) {
                    round.delta = this.idleTimeoutRounds;
                }
            }
            if (m.updated > round.updated) {
                round.updated = m.updated;
            }
            if (!m.peer) {
                throw new Error('input-message-missing-peer');
            }
            const inp = round.inputs.find((inp) => inp.id === m.peer);
            if (!inp) {
                throw new Error('input-message-peer-not-in-channel');
            }
            // if round is at or after the finalization point, then
            // we need to check if the message is accepted or rejected
            const offsetFromFinalization = latestRound - m.round;
            const needsFinalization =
                offsetFromFinalization > this.interlace * 3 + 2;
            let accepted = true;
            // is well acked?
            // TODO: reduce this number to supermajority
            const requiredConfirmations =
                requiredConfirmationsFor(this.channelPeerIds.length) - 1;
            if (
                needsFinalization &&
                m.confirmations[requiredConfirmations] < requiredConfirmations
            ) {
                console.log(
                    `DROP INPUT needed=${requiredConfirmations} got=${m.confirmations[requiredConfirmations]} all=${m.confirmations}`,
                );
                accepted = false;
            }
            inp.input = accepted && m.type == MessageType.INPUT ? m.data : 0;

            round.unconfirmed = !needsFinalization;
        }
        // apply the messages on top of the state
        let runs = 0;
        let state = rollbackState.state;
        const checkpoints: SerializedState[] = [];
        for (const round of roundData) {
            // if there's a gap in rounds, then delta will be > 0
            // we should not attempt to fill the gap and should abort
            if (round.round > 1 && round.delta > 0) {
                console.log(
                    `ARGG GAP! THIS IS UNEXPECTED AND LIKELY A BUG!
                        delta=${round.delta}
                        round=${round.round}
                    `,
                );
                break;
            }
            // ensure inputs are in deterministic order
            const inputs = round.inputs.sort((a, b) => {
                return a.id < b.id ? -1 : 1;
            });
            // check if we already have a state processed for these inputs
            const cachedCheckpoint = this.stateCache.get(round.round);
            if (cachedCheckpoint) {
                // check the inputs are the same
                const sameInputs =
                    cachedCheckpoint.state.inputs.length === inputs.length &&
                    cachedCheckpoint.state.inputs.every((input, i) => {
                        return input.input === inputs[i].input;
                    });
                if (sameInputs) {
                    state = cachedCheckpoint.state;
                    continue;
                    // } else {
                    //     console.log(
                    //         'CACHE MISS',
                    //         JSON.stringify(
                    //             {
                    //                 cache: cachedCheckpoint.state.inputs,
                    //                 inputs,
                    //             },
                    //             null,
                    //             2,
                    //         ),
                    //     );
                }
            }
            const res = await this.apply(state, round.round, inputs);
            state = res.state;
            runs += res.runs;
            // maybe write it if it's a checkpoint round
            const checkpoint: SerializedState = {
                tag: StateTag.ACCEPTED,
                channel: this.channelId,
                round: round.round,
                updated: round.updated,
                state,
            };
            // invalidate all states from this point forward
            await this.db.state
                .where(['channel', 'tag', 'round'])
                .between(
                    [this.channelId, StateTag.ACCEPTED, checkpoint.round],
                    [this.channelId, StateTag.ACCEPTED, Dexie.maxKey],
                )
                .delete();
            if (checkpoint.round % 200 === 0) {
                // write the checkpoint
                checkpoints.push(checkpoint);
            }
            this.stateCache.set(checkpoint.round, checkpoint);
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
                    messages=${messages.length}
                    inputs=${roundData.length}
                    prevUpdated=${prevUpdated}
                `,
            );
            // write the state to the store
            await this.db.state.bulkPut(checkpoints);
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

    private async apply(
        inState: State,
        round: number,
        inputs: PlayerData[],
    ): Promise<SimResult> {
        let runs = 0;
        const deltaTime = this.fixedUpdateRate / 1000;
        const mod = await this.mod;
        // clone the world
        const state = structuredClone(inState);
        // update player input data
        state.inputs = inputs.map((input) => ({
            ...input,
        }));
        // tick the game logic forward
        state.t = round;
        mod.load(state.data);
        mod.run(state.inputs, deltaTime, state.t);
        runs++;
        state.data = mod.dump();
        // return the copy of the state
        return { state, runs };
    }

    destroy() {}
}
