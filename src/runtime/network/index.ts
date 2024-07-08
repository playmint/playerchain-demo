import { Input, InputDB, InputPacket, PeerId } from './types';

export { BroadcastTransport } from './transport/broadcast';
export { SocketTransport } from './transport/socket';
export { LockstepDB } from './db/lockstep';
export { MemoryDB } from './db/memory';

export class Network {
    peerId: PeerId;
    updater: MessagePort;
    db: InputDB;
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

    sendActionsToUpdater(actionsToReplay: Array<InputPacket[]>) {
        if (actionsToReplay.length === 0) {
            return;
        }
        this.updater.postMessage(actionsToReplay);
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

        // help others catch up
        this.db.sync(this.round);

        // forward all the actions that have changed
        // since we last called getDelta to the updater
        const actions = this.db.getDelta(this.round - 1);
        this.sendActionsToUpdater(actions);

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
