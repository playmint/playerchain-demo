import { InputDB, InputPacket, Transport } from '../types';

export class LockstepDB implements InputDB {
    store: InputDB;
    transport: Transport;
    numPlayers: number;
    lastSync = 0;

    constructor({
        store,
        transport,
        numPlayers,
    }: {
        store: InputDB;
        transport: Transport;
        numPlayers: number;
    }) {
        this.numPlayers = numPlayers;
        console.log(`using lockstep with ${this.numPlayers} players`);
        this.store = store;
        this.transport = transport;
        this.transport.onPacket = this.recvPacket.bind(this);
    }

    async ready(): Promise<void> {
        return this.transport.ready();
    }

    private recvPacket(packet: InputPacket) {
        this.store.addInput(packet);
    }

    addInput(packet: InputPacket) {
        console.log('added input', packet);
        this.store.addInput(packet);
        this.transport.sendPacket(packet);
    }

    getInputs(round: number): InputPacket[] | undefined {
        return this.store.getInputs(round);
    }

    getDelta(round: number): Array<InputPacket[]> {
        return this.store.getDelta(round);
    }

    // FIXME: is this dead now?
    isAcknowledged(round: number): boolean {
        const inputs = this.getInputs(round) ?? [];
        const ack = (inputs.length ?? 0) === this.numPlayers;
        if (!ack) {
            console.warn(
                `waiting for ${this.numPlayers - inputs.length} inputs for round ${round}`,
            );
        }
        return ack;
    }

    // resend the last few inputs just for good measure
    // TODO: be smarter
    sync(round: number) {
        this.store.sync(round);
        if (Date.now() - this.lastSync < 1000) {
            return;
        }
        for (let i = 0; i < 100; i++) {
            (this.getInputs(round - i) || []).forEach((input) => {
                this.transport.sendPacket(input);
            });
        }
        this.lastSync = Date.now();
    }
}
