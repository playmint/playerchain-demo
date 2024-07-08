import { Input, InputDB, InputPacket, PeerId } from './types';

export { BroadcastTransport } from './transport/broadcast';
export { SocketTransport } from './transport/socket';
export { LockstepDB } from './db/lockstep';
export { MemoryDB } from './db/memory';

export class Network {
    peerId: PeerId;
    updater: MessagePort;
    db: InputDB;
    lastSentRound: number;
    tickRate: number;
    input: Input;
    round: number = 0;
    container: Window;
    lastSpam: number = 0;

    constructor({
        peerId,
        updaterPort,
        tickRate,
        db,
        container,
    }: {
        peerId: PeerId;
        updaterPort: MessagePort;
        tickRate: number;
        db: InputDB;
        container: Window;
    }) {
        this.container = container;
        this.tickRate = tickRate;
        this.lastSentRound = -1;
        this.updater = updaterPort;
        this.db = db;
        this.peerId = peerId;
        this.input = {
            forward: false,
            back: false,
            left: false,
            right: false,
        };
        container.addEventListener('keydown', this.onKeyDown.bind(this));
        container.addEventListener('keyup', this.onKeyUp.bind(this));
    }

    async ready(): Promise<void> {
        await this.db.ready();
        this.loop();
        return;
    }

    sendActionsToUpdater(round: number) {
        const actionsToReplay: Array<InputPacket[] | undefined> = [];
        const startTick = this.lastSentRound + 1;
        const endTick = round;
        if (endTick <= this.lastSentRound) {
            return;
        }
        for (let i = startTick; i <= endTick; i++) {
            const actions = this.db.getInputs(i);
            actionsToReplay.push(actions);
        }
        this.updater.postMessage(actionsToReplay);
        this.lastSentRound = endTick;
    }

    onKeyDown(event) {
        event.preventDefault();
        switch (event.key) {
            case 'w':
                if (this.input.forward) {
                    return;
                }
                this.input.forward = true;
                break;
            case 'a':
                if (this.input.left) {
                    return;
                }
                this.input.left = true;
                break;
            case 's':
                if (this.input.back) {
                    return;
                }
                this.input.back = true;
                break;
            case 'd':
                if (this.input.right) {
                    return;
                }
                this.input.right = true;
                break;
        }
    }

    onKeyUp(event) {
        event.preventDefault();
        switch (event.key) {
            case 'w':
                this.input.forward = false;
                break;
            case 'a':
                this.input.left = false;
                break;
            case 's':
                this.input.back = false;
                break;
            case 'd':
                this.input.right = false;
                break;
        }
    }

    onLoop() {
        // special case for the first round because we need to wait for all players
        if (this.round === 0 && this.db.isAcknowledged(this.round)) {
            this.round++;
        }
        if (this.round === 0) {
            if (Date.now() - this.lastSpam > 1000) {
                // spam our input until we get an ack
                this.db.addInput({
                    peerId: this.peerId,
                    input: {
                        forward: false,
                        back: false,
                        left: false,
                        right: false,
                    },
                    round: this.round,
                });
                this.lastSpam = Date.now();
            }
            return;
        }

        // if we are not ready to send the next input, maybe do some
        // work to help the others sync up
        if (!this.db.isAcknowledged(this.round - 1)) {
            this.db.sync(this.round);
            return;
        }

        // forward acknowledged inputs to updater
        this.sendActionsToUpdater(this.round - 1);

        // send next input
        this.db.addInput({
            peerId: this.peerId,
            input: { ...this.input },
            round: this.round,
        });

        // increment the round
        this.round++;
    }

    loop() {
        try {
            this.onLoop();
        } catch (err) {
            console.error('Error in network loop', err);
        }
        setTimeout(this.loop.bind(this), this.tickRate);
    }

    static async create({
        peerId,
        updaterPort,
        tickRate,
        db,
        container,
    }: {
        peerId: PeerId;
        updaterPort: MessagePort;
        tickRate: number;
        db: InputDB;
        container: Window;
    }) {
        const network = new Network({
            peerId,
            updaterPort,
            db,
            tickRate,
            container,
        });
        await network.ready();
        return network;
    }
}
