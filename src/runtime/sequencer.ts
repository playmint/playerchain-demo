// the sequencer is responsible for producing blocks
// it is constantly attempting to write a block with
import * as Comlink from 'comlink';
import Dexie from 'dexie';
import { SESSION_TIME_SECONDS } from '../examples/spaceshooter';
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

export const requiredConfirmationsFor = (size: number): number => {
    // supermarjority-ish
    // this is only manual like this so I can play with the numbers
    switch (size) {
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

const MIN_SEQUENCE_RATE = 30;

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
    private end: number;
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
        this.loopInterval =
            this.mode === SequencerMode.WALLCLOCK
                ? this.fixedUpdateRate
                : MIN_SEQUENCE_RATE;
        this.warmingUp = (1000 / this.fixedUpdateRate) * 1; // 1s warmup
        this.metrics = metrics;
        this.end = SESSION_TIME_SECONDS / (this.fixedUpdateRate / 1000);
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
            console.error(`seq-loop-err`, err);
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

        // stop if past end of session, temp while we are testing with a fixed session length
        if (round > this.end) {
            this.stop();
            return 0;
        }

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
        const [numCommits, ackIds, jumpRound] = await this.canWriteInputBlock(
            input,
            round,
        );
        if (!numCommits) {
            return 0;
        }
        if (jumpRound !== round) {
            round = jumpRound;
        }
        for (let i = 0; i < numCommits; i++) {
            const isMainCommit = i === numCommits - 1;
            this.prev = await this.committer.commit(
                {
                    type: MessageType.INPUT,
                    round: round,
                    data: input,
                    acks: isMainCommit ? ackIds || [] : [], // only ack the lastest block
                },
                this.channelId,
            );
            this.lastCommitted = Date.now();
            round++;
            if (!isMainCommit && i > 2) {
                // wait a bit before sending the next block
                // or we might drown out the keep alives
                await new Promise((resolve) => setTimeout(resolve, 1));
            }
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
        if (behindBy > this.interlace * 2) {
            // we are more than the interlace period behind
            // the train has left the station without us
            // let's check if we have validated enough of the chains that
            // we have a chance of catching up
            const peers = await this.db.peers.toArray();
            const closeEnoughCount = await Promise.all(
                peers.map(async (p) => {
                    const latest = await this.db.messages
                        .where(['peer', 'height'])
                        .between(
                            [p.peerId, Dexie.minKey],
                            [p.peerId, Dexie.maxKey],
                        )
                        .last();
                    return { latest, validHeight: p.validHeight };
                }),
            ).then((latests) =>
                latests.reduce((acc, { latest, validHeight }) => {
                    if (!latest) {
                        return acc;
                    }
                    if (latest.height - validHeight > this.interlace * 18) {
                        return acc;
                    }
                    return acc + 1;
                }, 0),
            );
            if (
                closeEnoughCount >=
                requiredConfirmationsFor(peers.length) - 1
            ) {
                console.log('ALLOW TELEPORT', round, '->', latestKnownRound);
                round = latestKnownRound;
                numCommits = this.interlace;
            } else {
                // looks like we are out of the game as we are too far behind
                // TODO: find a way to catch up safely
                console.log('BLOCKED TOO FAR BEHIND');
                return [0, null, round];
            }
        } else if (behindBy > 1) {
            numCommits = latestKnownRound - round;
            console.log('ALLOW FASTFORWARD', numCommits);
        } else {
            const timeSinceLastCommit = Date.now() - this.lastCommitted;
            if (timeSinceLastCommit < this.fixedUpdateRate) {
                const wait = this.fixedUpdateRate - timeSinceLastCommit;
                if (wait > 15) {
                    // console.log(
                    //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED SLOWDOWN wanted=${round} latest=${latestKnownRound} wait=${this.fixedUpdateRate - timeSinceLastCommit}`,
                    // );
                    return [0, null, round];
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
            .filter((m) => m.peer && m.peer !== this.peerId)
            .map((m) => Buffer.from(m.id, 'base64'));
        // we can't write a block if we do not have enough acks the interlaced round
        const requiredAcks =
            requiredConfirmationsFor(this.channelPeerIds.length) - 1;
        if (ackIds.length < requiredAcks) {
            // console.log(
            //     `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGHACKS round=${round} gotacks=${ackIds.length} needacks=${requiredCount}`,
            // );
            return [0, null, round];
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
        //             m.peer !== this.peerId,
        //     )
        //     .map((m) => m.id);
        // // we can't write a block if we do not have enough acks on the interlaced*N round
        // if (longAckIds.length < requiredCount) {
        //     console.log(
        //         `[seq/${this.peerId.slice(0, 8)}] BLOCKED NOTENOUGH LONG ACKS round=${round} longacks=${longAckIds.length} needacks=${requiredCount}`,
        //     );
        //     return [0, null];
        // }
        return [numCommits, ackIds, round];
    }

    private async canWriteWallclockInputBlock(
        input: number,
        round: number,
    ): Promise<[number, Uint8Array[] | null, number]> {
        // commit if we have done something for first time
        if (!this.prev && input !== 0) {
            return [1, null, round];
        }
        // always write a block at round mod something if we have a non zero input
        if (round % 10 === 0 && input !== 0) {
            return [1, null, round];
        }
        // if our input has changed write a block
        if (
            this.prev &&
            this.prev.type === MessageType.INPUT &&
            this.prev.data !== input
        ) {
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
