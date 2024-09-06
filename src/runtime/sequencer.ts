// the sequencer is responsible for producing blocks
// it is constantly attempting to write a block with
import type { Client } from './client';
import { GameModule } from './game';
import { Message, MessageType } from './messages';

export interface Committer {
    commit: Client['commit'];
}

export enum SequencerMode {
    UNKNOWN = 0,
    CORDIAL = 1, // monotonic rounds, only tick when all participants have acked the previous block
    WALLCLOCK = 2, // sparse rounds, calculated as a function of wallclock time
}

export interface SequencerConfig {
    mod: GameModule;
    committer: Committer;
    channelId: string;
    rate: number;
    mode?: SequencerMode;
}

// the current input
export class Sequencer {
    private committer: Committer;
    private mod: GameModule;
    private loopInterval: number;
    private playing = false;
    private channelId: string;
    private warmingUp = 0;
    private prev?: Message;
    private fixedUpdateRate: number;
    private inputDelay = 50;

    constructor({ mod, committer, channelId, rate }: SequencerConfig) {
        this.mod = mod;
        this.committer = committer;
        this.channelId = channelId;
        this.fixedUpdateRate = rate;
        this.loopInterval = this.fixedUpdateRate / 2;
        this.warmingUp = (1000 / this.fixedUpdateRate) * 2; // 2s warmup
    }

    private loop = () => {
        if (!this.playing) {
            console.log('seq-loop-stopped');
            return;
        }
        this._loop()
            .catch((err) => {
                console.error(`seq-loop-err: ${err}`);
            })
            .finally(() => {
                if (this.playing) {
                    setTimeout(this.loop, this.loopInterval);
                }
            });
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
        const round = this.getRoundFromClock(this.inputDelay);

        // skip if we just did that round
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            round <= this.prev.round
        ) {
            // console.log('seq-no-new-round', round);
            return;
        }
        // get the current input state
        const input = this.mod.getInput();
        // can we write a block?
        if (!this.canWriteInputBlock(input, round)) {
            return;
        }
        // console.log('writing-input-block', round, input);
        this.prev = await this.committer.commit({
            type: MessageType.INPUT,
            round: round,
            channel: this.channelId,
            data: input,
        });
    }

    private getRoundFromClock(offsetMilliseconds: number): number {
        // TODO: use a clock that accounts for group skew
        return Math.round(
            (Date.now() + offsetMilliseconds) / this.fixedUpdateRate,
        );
    }

    canWriteInputBlock(input: number, round: number): boolean {
        // commit if we have done something for first time
        if (!this.prev && input !== 0) {
            return true;
        }
        // always write a block at round mod something if we have a non zero input
        if (round % 10 === 0 && input !== 0) {
            return true;
        }
        // if our input has changed write a block
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            this.prev.data !== input
        ) {
            return true;
        }

        // always write a block at round mod something so we can form agreement
        if (round % 20 === 0) {
            return true;
        }

        return false;
    }

    start() {
        if (this.playing) {
            return;
        }
        this.playing = true;
        setTimeout(this.loop, this.loopInterval);
    }

    stop() {
        this.playing = false;
    }

    destroy() {
        this.stop();
    }
}
