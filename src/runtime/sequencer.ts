// the sequencer is responsible for producing blocks
// it is constantly attempting to write a block with
import Dexie from 'dexie';
import type { Client } from './client';
import { DB } from './db';
import { GameModule } from './game';
import { InputMessage, Message, MessageType } from './messages';
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
    mod: GameModule;
    committer: Committer;
    peerId: string;
    db: DB;
    channelId: string;
    channelPeerIds: string[];
    rate: number;
    mode: SequencerMode;
    interlace: number;
}

const MIN_SEQUENCE_RATE = 10;

// the current input
export class Sequencer {
    private committer: Committer;
    private mod: GameModule;
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
    peerId: string;
    db: DB;
    lastCommitted = 0;
    threads: CancelFunction[] = [];

    constructor({
        mod,
        mode,
        db,
        peerId,
        committer,
        channelId,
        channelPeerIds,
        interlace,
        rate,
    }: SequencerConfig) {
        this.db = db;
        this.mode = mode;
        this.peerId = peerId;
        this.mod = mod;
        this.interlace = interlace;
        this.committer = committer;
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
    }

    private loop = async () => {
        if (!this.playing) {
            return;
        }
        try {
            await this._loop();
        } catch (err) {
            console.error(`seq-loop-err: ${err}`);
        }
    };

    private async _loop() {
        // give it a couple of seconds to learn the network
        // TODO: how can we ever know for sure when ready?
        if (this.warmingUp > 0) {
            console.log('seq-warming-up', this.warmingUp);
            this.warmingUp -= 1;
            return;
        }
        // get the current round
        const round = await this.getRound();

        // skip if we just did that round
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            round <= this.prev.round
        ) {
            console.log('seq-no-new-round', round);
            return;
        }
        // get the current input state
        const input = this.mod.getInput();
        // can we write a block?
        const [canWrite, ackIds] = await this.canWriteInputBlock(input, round);
        if (!canWrite) {
            // if (this.prev) {
            //     // resend the prev message again
            //     this.committer.send(
            //         {
            //             type: PacketType.MESSAGE,
            //             msgs: [this.prev],
            //         },
            //         {
            //             ttl: 200,
            //         },
            //     );
            // }
            return;
        }
        // console.log('writing-input-block', round, input);
        this.prev = await this.committer.commit(
            {
                type: MessageType.INPUT,
                round: round,
                channel: this.channelId,
                data: input,
            },
            ackIds || [],
        );
        this.lastCommitted = Date.now();
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

    private async canWriteInputBlock(
        input: number,
        round: number,
    ): Promise<[boolean, Uint8Array[] | null]> {
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
    ): Promise<[boolean, Uint8Array[] | null]> {
        // we can write a block (without acks) if our next round is below the interlace
        if (round < this.interlace * 2 + 1) {
            return [true, null];
        }
        // must not write another block immediately after the last one
        // unless we are lagging behind
        if (Date.now() - this.lastCommitted < this.fixedUpdateRate) {
            const latestKnownRound = await this.getLatestKnownRound();
            const weAreLagging = round < latestKnownRound;
            if (weAreLagging) {
                console.log('ALLOW FASTFORWARD');
            } else {
                // console.log(
                //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED SLOWDOWN wanted=${round} latest=${latestKnownRound}`,
                // );
                return [false, null];
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
            .filter((m) => Buffer.from(m.peer).toString('hex') !== this.peerId)
            .map((m) => m.sig);
        // we can't write a block if we do not have enough acks the interlaced round
        // FIXME: this is currently in lockstep
        const requiredCount =
            this.channelPeerIds.length > 2
                ? this.channelPeerIds.length - 2 // maybe 2
                : this.channelPeerIds.length - 2;
        if (ackIds.length < requiredCount) {
            // console.log(
            //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGHACKS round=${round} gotacks=${ackIds.length} needacks=${requiredCount}`,
            // );
            return [false, null];
        }

        // fetch all the messages we have from interlaced*N round to ack
        const longAckIds = (
            await this.db.messages
                .where(['channel', 'round', 'peer'])
                .between(
                    [this.channelId, round - this.interlace * 2, Dexie.minKey],
                    [this.channelId, round - this.interlace * 2, Dexie.maxKey],
                )
                .toArray()
        )
            .filter((m) => Buffer.from(m.peer).toString('hex') !== this.peerId)
            .map((m) => m.sig);
        // we can't write a block if we do not have enough acks on the interlaced*N round
        if (longAckIds.length < this.channelPeerIds.length - 1) {
            return [false, null];
        }
        return [true, ackIds];
    }

    private async canWriteWallclockInputBlock(
        input: number,
        round: number,
    ): Promise<[boolean, Uint8Array[] | null]> {
        // commit if we have done something for first time
        if (!this.prev && input !== 0) {
            return [true, null];
        }
        // always write a block at round mod something if we have a non zero input
        if (round % 10 === 0 && input !== 0) {
            return [true, null];
        }
        // if our input has changed write a block
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            this.prev.data !== input
        ) {
            return [true, null];
        }

        // always write a block at round mod something so we can form agreement
        if (round % 20 === 0) {
            return [true, null];
        }

        return [false, null];
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
    }
}
