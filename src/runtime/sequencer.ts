// the sequencer is responsible for producing blocks
// it is constantly attempting to write a block with
import * as Comlink from 'comlink';
import Dexie from 'dexie';
import type { ClientContextType } from '../gui/hooks/use-client';
import type { Client } from './client';
import database, { DB } from './db';
import { GameModule, load } from './game';
import { InputMessage, Message, MessageType } from './messages';
import { DefaultMetrics } from './metrics';
import { CancelFunction, setPeriodic } from './utils';

export interface Committer {
    commit: Client['commit'];
    send: Client['send'];
}

export enum SequencerMode {
    UNKNOWN = 0,
    CORDIAL = 1, // monotonic rounds, only tick when all participants have acked the previous block
    WALLCLOCK = 2, // sparse rounds, calculated as a function of wallclock time
}

export interface SequencerConfig {
    src: string; // URL to the game module to load
    clientPort: MessagePort;
    peerId: string;
    dbname: string;
    channelId: string;
    channelPeerIds: string[];
    rate: number;
    mode: SequencerMode;
    interlace: number;
    metrics?: DefaultMetrics;
}

const MIN_SEQUENCE_RATE = 10;

// the current input
export class Sequencer {
    private committer: Comlink.Remote<ClientContextType>;
    private mod: Promise<GameModule>;
    private loopInterval: number;
    private playing = false;
    private channelId: string;
    private channelPeerIds: string[];
    private warmingUp = 0;
    private prev?: Message;
    private fixedUpdateRate: number;
    private inputDelay = 100;
    private mode: SequencerMode;
    private interlace: number;
    private metrics?: DefaultMetrics;
    peerId: string;
    db: DB;
    lastCommitted = 0;
    threads: CancelFunction[] = [];

    constructor({
        src,
        mode,
        dbname,
        peerId,
        clientPort,
        channelId,
        channelPeerIds,
        interlace,
        rate,
        metrics,
    }: SequencerConfig) {
        this.db = database.open(dbname);
        this.mode = mode;
        this.peerId = peerId;
        this.mod = load(src);
        this.interlace = interlace;
        this.committer = Comlink.wrap<ClientContextType>(clientPort);
        this.channelId = channelId;
        this.channelPeerIds = channelPeerIds;
        this.fixedUpdateRate = rate;
        if (
            this.mode === SequencerMode.CORDIAL &&
            this.fixedUpdateRate < MIN_SEQUENCE_RATE
        ) {
            throw new Error(
                `fixedUpdatedRate must be greater than ${MIN_SEQUENCE_RATE}`,
            );
        }
        this.loopInterval =
            this.mode === SequencerMode.WALLCLOCK
                ? this.fixedUpdateRate
                : MIN_SEQUENCE_RATE;
        this.warmingUp = (1000 / this.fixedUpdateRate) * 1; // 1s warmup
        this.metrics = metrics;
    }

    private loop = async () => {
        if (!this.playing) {
            return;
        }
        try {
            const commits = await this._loop();
            if (this.metrics) {
                this.metrics.cps.add(commits);
            }
        } catch (err) {
            console.error(`seq-loop-err: ${err}`);
        }
    };

    // returns the number of commits
    private async _loop(): Promise<number> {
        // give it a couple of seconds to learn the network
        // TODO: how can we ever know for sure when ready?
        if (this.warmingUp > 0) {
            console.log('seq-warming-up', this.warmingUp);
            this.warmingUp -= 1;
            return 0;
        }
        // get the current round
        let round = await this.getRound();

        // skip if we just did that round
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            round <= this.prev.round
        ) {
            console.log('seq-no-new-round', round);
            return 0;
        }
        // get the current input state
        const mod = await this.mod;
        const input = mod.getInput();
        // can we write a block?
        const [numCommits, ackIds] = await this.canWriteInputBlock(
            input,
            round,
        );
        if (!numCommits) {
            return 0;
        }
        for (let i = 0; i < numCommits; i++) {
            // console.log('writing-input-block', round, input);
            this.prev = await this.committer.commit(
                {
                    type: MessageType.INPUT,
                    round: round,
                    data: input,
                    acks: i === numCommits - 1 ? ackIds || [] : [], // only ack the lastest block
                },
                this.channelId,
            );
            this.lastCommitted = Date.now();
            round++;
        }
        // we commited, count it
        return numCommits;
    }

    private async getRound(): Promise<number> {
        if (this.mode === SequencerMode.WALLCLOCK) {
            return this.getRoundFromClock();
        } else if (this.mode === SequencerMode.CORDIAL) {
            return this.getNextRound();
        } else {
            throw new Error('unknown sequencer mode');
        }
    }

    private async getRoundFromClock(): Promise<number> {
        // TODO: use a clock that accounts for group skew
        return Math.round(
            (Date.now() + this.inputDelay) / this.fixedUpdateRate,
        );
    }

    private async getNextRound(): Promise<number> {
        // find our latest round
        const ourPeerId = Buffer.from(this.peerId, 'hex');
        let ourLatestRound = 0;
        const ourLatest = (await this.db.messages
            .where(['channel', 'peer', 'round'])
            .between(
                [this.channelId, ourPeerId, Dexie.minKey],
                [this.channelId, ourPeerId, Dexie.maxKey],
            )
            .last()) as InputMessage | undefined;
        if (ourLatest) {
            ourLatestRound = ourLatest.round;
        }
        return ourLatestRound + 1;
    }

    private async getLatestKnownRound(): Promise<number> {
        let anyLatestRound = 0;
        const latest = (await this.db.messages
            .where(['channel', 'round', 'peer'])
            .between(
                [this.channelId, Dexie.minKey, Dexie.minKey],
                [this.channelId, Dexie.maxKey, Dexie.maxKey],
            )
            .last()) as InputMessage | undefined;
        if (latest) {
            anyLatestRound = latest.round;
        }
        return anyLatestRound;
    }

    // returns number of commits we need to make and the acks we need
    private async canWriteInputBlock(
        input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null]> {
        if (this.mode === SequencerMode.WALLCLOCK) {
            return this.canWriteWallclockInputBlock(input, round);
        } else if (this.mode === SequencerMode.CORDIAL) {
            return this.canWriteCordialInputBlock(input, round);
        } else {
            throw new Error('unknown sequencer mode');
        }
    }

    async canWriteCordialInputBlock(
        _input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null]> {
        // we can write a block (without acks) if our next round is below the interlace
        if (round <= this.interlace * 2 + 1) {
            return [1, null];
        }
        // must not write another block immediately after the last one
        // unless we are lagging behind
        let numCommits = 1;
        const timeSinceLastCommit = Date.now() - this.lastCommitted;
        if (timeSinceLastCommit < this.fixedUpdateRate) {
            const latestKnownRound = await this.getLatestKnownRound();
            const weAreLagging = round < latestKnownRound - 1;
            if (weAreLagging) {
                numCommits = latestKnownRound - round;
                console.log('ALLOW FASTFORWARD', numCommits);
            } else {
                const wait = this.fixedUpdateRate - timeSinceLastCommit;
                if (wait > MIN_SEQUENCE_RATE) {
                    // console.log(
                    //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED SLOWDOWN wanted=${round} latest=${latestKnownRound} wait=${this.fixedUpdateRate - timeSinceLastCommit}`,
                    // );
                    return [0, null];
                }
            }
        }
        // fetch all the messages we have from interlaced round to ack
        const ackIds = (
            await this.db.messages
                .where(['channel', 'round', 'peer'])
                .between(
                    [this.channelId, round - this.interlace, Dexie.minKey],
                    [this.channelId, round - this.interlace, Dexie.maxKey],
                )
                .toArray()
        )
            .filter(
                (m) =>
                    m.peer &&
                    Buffer.from(m.peer).toString('hex') !== this.peerId,
            )
            .map((m) => m.id);
        // we can't write a block if we do not have enough acks the interlaced round
        const requiredCount =
            this.channelPeerIds.length > 2
                ? this.channelPeerIds.length - 2 // FIXME: should be supermajority not hardcoded
                : this.channelPeerIds.length - 1; // 2 player is a always lockstep
        if (ackIds.length < requiredCount) {
            // console.log(
            //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGHACKS round=${round} gotacks=${ackIds.length} needacks=${requiredCount}`,
            // );
            return [0, null];
        }

        // fetch all the messages we have from interlaced*N round to ack
        // const longAckIds = (
        //     await this.db.messages
        //         .where(['channel', 'round', 'peer'])
        //         .between(
        //             [
        //                 this.channelId,
        //                 round - this.interlace * 2 - 1,
        //                 Dexie.minKey,
        //             ],
        //             [
        //                 this.channelId,
        //                 round - this.interlace * 2 - 1,
        //                 Dexie.maxKey,
        //             ],
        //         )
        //         .toArray()
        // )
        //     .filter(
        //         (m) =>
        //             m.peer &&
        //             Buffer.from(m.peer).toString('hex') !== this.peerId,
        //     )
        //     .map((m) => m.id);
        // // we can't write a block if we do not have enough acks on the interlaced*N round
        // if (longAckIds.length < requiredCount) {
        //     console.log(
        //         `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGH LONG ACKS round=${round} longacks=${longAckIds.length} needacks=${requiredCount}`,
        //     );
        //     return [0, null];
        // }
        return [numCommits, ackIds];
    }

    private async canWriteWallclockInputBlock(
        input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null]> {
        // commit if we have done something for first time
        if (!this.prev && input !== 0) {
            return [1, null];
        }
        // always write a block at round mod something if we have a non zero input
        if (round % 10 === 0 && input !== 0) {
            return [1, null];
        }
        // if our input has changed write a block
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            this.prev.data !== input
        ) {
            return [1, null];
        }

        // always write a block at round mod something so we can form agreement
        if (round % 20 === 0) {
            return [1, null];
        }

        return [0, null];
    }

    onKeyDown(key: string) {
        this.mod
            .then((m) => m.onKeyDown(key))
            .catch((err) => {
                console.error(`seq-onKeyDown-err: ${err}`);
            });
    }

    onKeyUp(key: string) {
        this.mod
            .then((m) => m.onKeyUp(key))
            .catch((err) => {
                console.error(`seq-onKeyDown-err: ${err}`);
            });
    }

    start() {
        if (this.playing) {
            return;
        }
        this.playing = true;
        this.threads.push(setPeriodic(this.loop, this.loopInterval));
    }

    stop() {
        this.playing = false;
        for (const cancel of this.threads) {
            cancel();
        }
    }

    destroy() {
        this.stop();
        if (this.committer) {
            this.committer[Comlink.releaseProxy]();
        }
    }
}
