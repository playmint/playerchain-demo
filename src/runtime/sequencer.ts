// the sequencer is responsible for producing blocks
// it is constantly attempting to write a block with
import * as Comlink from 'comlink';
import Dexie from 'dexie';
import { MathUtils } from 'three';
import { SESSION_TIME_SECONDS } from '../examples/spaceshooter';
import type { ClientContextType } from '../gui/hooks/use-client';
import type { Client } from './client';
import database, { DB } from './db';
import { GameModule, load } from './game';
import { InputMessage, MessageType } from './messages';
import { DefaultMetrics } from './metrics';
import { sleep } from './timers';
import { CancelFunction } from './utils';

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

export const requiredConfirmationsFor = (size: number): number => {
    // supermarjority-ish
    // this is only manual like this so I can play with the numbers
    switch (size) {
        case 1:
            return 1; // only for testing
        case 2:
            return 2;
        case 3:
            return 2;
        case 4:
            return 3;
        case 5:
            return 3;
        case 6:
            return 4;
        case 7:
            return 4;
        case 8:
            return 5;
        default:
            throw new Error(`unsupported size ${size}`);
    }
};

// const MIN_SEQUENCE_RATE = 10;
const INITIAL_LOCKSTEP_PERIOD = 50;

// the current input
export class Sequencer {
    private committer: Comlink.Remote<ClientContextType>;
    private mod: Promise<GameModule>;
    private playing = false;
    private channelId: string;
    private channelPeerIds: string[];
    private warmingUp = 0;
    private prevRound: number | null = null;
    private fixedUpdateRate: number;
    private inputDelay = 100;
    private mode: SequencerMode;
    private interlace: number;
    private end: number;
    private skew = 0;
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
        this.warmingUp = (1000 / this.fixedUpdateRate) * 1; // 1s warmup
        this.end =
            SESSION_TIME_SECONDS / (this.fixedUpdateRate / 1000) +
            this.interlace;
    }

    private loop = async () => {
        if (!this.playing) {
            return;
        }
        try {
            await this._loop();
        } catch (err) {
            console.error(`seq-loop-err`, err);
        } finally {
            setTimeout(this.loop, this.getFuzzyFixedUpdateRate());
        }
    };

    // returns the number of commits
    private async _loop(): Promise<number> {
        // give it a couple of seconds to learn the network
        // TODO: how can we ever know for sure when ready?
        if (this.warmingUp > 0) {
            // console.log('seq-warming-up', this.warmingUp);
            this.warmingUp -= 1;
            return 0;
        }
        // get the current round
        let round = await this.getRound();

        // stop if past end of session, temp while we are testing with a fixed session length
        if (round > this.end) {
            this.stop();
            return 0;
        }

        // skip if we just did that round
        if (this.prevRound !== null && round <= this.prevRound) {
            console.log('seq-no-new-round', round);
            return 0;
        }
        // get the current input state
        const mod = await this.mod;
        for (;;) {
            if (!this.playing) {
                break;
            }
            const input = mod.getInput();
            // can we write a block?
            const [numCommits, ackIds, jumpRound] =
                await this.canWriteInputBlock(input, round);
            if (!numCommits) {
                // console.log('seq-cannot-write-block', round);
                await sleep(2);
                continue;
            }
            if (jumpRound !== round) {
                round = jumpRound;
            }
            for (let i = 0; i < numCommits; i++) {
                const isMainCommit = i === numCommits - 1;
                await this.committer.enqueue(
                    {
                        type: MessageType.INPUT,
                        round: round,
                        data: input,
                        acks: isMainCommit ? ackIds || [] : [], // only ack the lastest block
                    },
                    this.channelId,
                );
                this.lastCommitted = Date.now();
                this.prevRound = round;
                round++;
            }
            return numCommits;
        }
        throw new Error('unreachable');
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
        if (this.prevRound !== null) {
            return this.prevRound + 1;
        }
        // find our latest round
        let ourLatestRound = 0;
        const ourLatest = (await this.db.messages
            .where(['channel', 'peer', 'round'])
            .between(
                [this.channelId, this.peerId, Dexie.minKey],
                [this.channelId, this.peerId, Dexie.maxKey],
            )
            .last()) as InputMessage | undefined;
        if (ourLatest) {
            ourLatestRound = ourLatest.round;
        } else {
            console.log('no latest round');
        }
        return ourLatestRound + 1;
    }

    private async getLatestKnownRound(): Promise<number> {
        const latest = await this.db.tapes
            .where(['channel', 'round'])
            .between(
                [this.channelId, Dexie.minKey],
                [this.channelId, Dexie.maxKey],
            )
            .last();
        return latest?.round ?? 0;
    }

    // returns number of commits we need to make and the acks we need
    private async canWriteInputBlock(
        input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null, number]> {
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
    ): Promise<[number, Uint8Array[] | null, number]> {
        // we can write a block (without acks) if our next round is below the interlace
        if (round <= this.interlace * 2 + 1) {
            return [1, null, round];
        }
        // must not write another block immediately after the last one
        // unless we are lagging behind
        let numCommits = 1;
        const latestKnownRound = await this.getLatestKnownRound();
        const behindBy = latestKnownRound - round;
        if (behindBy > this.interlace * 2 + 1) {
            // console.log('ALLOW TELEPORT', round, '->', latestKnownRound);
            round = latestKnownRound - this.interlace;
            numCommits = this.interlace;
        } else if (behindBy > 2) {
            // this.skew = Math.max(-this.fixedUpdateRate, this.skew - 1);
            numCommits = behindBy;
            // console.log('ALLOW FASTFORWARD', numCommits, this.skew);
            // } else if (behindBy < -this.interlace) {
            //     // this.skew = Math.min(this.fixedUpdateRate, this.skew + 1);
            //     console.log('ALLOW SLOWDOWN', this.skew);
            //     return [0, null, round];
        }
        // fetch the tape for the interlaced round
        const interlaceTape = await this.db.tapes
            .where(['channel', 'round'])
            .equals([this.channelId, round - this.interlace])
            .first();

        // we can't write a block if we do not have enough blocks on the interlaced round
        const peerIndex = this.channelPeerIds.indexOf(this.peerId);
        if (peerIndex === -1) {
            throw new Error('seq peerIndex not found');
        }
        const ackIds = (interlaceTape?.ids || [])
            .map((id, idx) =>
                id && idx != peerIndex ? Buffer.from(id, 'base64') : null,
            )
            .filter((id) => id !== null) as Uint8Array[];
        const requiredBlocks =
            round < INITIAL_LOCKSTEP_PERIOD
                ? this.channelPeerIds.length - 1
                : requiredConfirmationsFor(this.channelPeerIds.length) - 1;
        if (ackIds.length < requiredBlocks) {
            // console.log(
            //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGPREV round=${round} got=${ackIds.length} need=${requiredBlocks}`,
            // );
            return [0, null, round];
        }

        return [numCommits, ackIds, round];
    }

    private async canWriteWallclockInputBlock(
        input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null, number]> {
        // always write a block at round mod something if we have a non zero input
        if (round % 10 === 0 && input !== 0) {
            return [1, null, round];
        }
        // always write a block at round mod something so we can form agreement
        if (round % 20 === 0) {
            return [1, null, round];
        }

        return [0, null, round];
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
        setTimeout(this.loop, this.getFuzzyFixedUpdateRate());
    }

    // returns a jittered fixed update rate
    // the jitter helps even out differences in client updates
    getFuzzyFixedUpdateRate(): number {
        return (
            this.fixedUpdateRate +
            Math.floor(Math.random() * 3 - 10) +
            MathUtils.clamp(this.skew, -5, 5)
        );
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
