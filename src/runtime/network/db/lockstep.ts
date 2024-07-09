import { InputDB, InputPacket, Transport } from '../types';

export class LockstepDB implements InputDB {
    store: InputDB;
    transport: Transport;
    numPlayers: number;
    lastSync = 0;
    rollbacks: number;

    constructor({
        store,
        transport,
        numPlayers,
        rollbacks,
    }: {
        store: InputDB;
        transport: Transport;
        numPlayers: number;
        rollbacks?: number;
    }) {
        this.rollbacks = rollbacks ?? 1;
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

    addInput(packet: InputPacket): boolean {
        let ok = this.store.addInput(packet);
        if (ok) {
            ok = this.transport.sendPacket(packet);
            if (!ok) {
                console.warn(
                    'addInput: send failed',
                    packet.round,
                    packet.peerId,
                );
            }
            // resend the last few inputs just for good measure
            // FIXME: be smarter
            setTimeout(() => this.transport.sendPacket(packet), 20);
            setTimeout(() => this.transport.sendPacket(packet), 40);
        }
        return this.isFinal(packet.round - this.rollbacks);
    }

    getInputs(round: number): InputPacket[] | undefined {
        return this.store.getInputs(round);
    }

    getDelta(maxRound?: number): Array<InputPacket[]> {
        return this.store.getDelta(maxRound);
    }

    // FIXME: is this dead now?
    isFinal(round: number): boolean {
        if (round < 0) {
            return true;
        }
        const inputs = this.getInputs(round) ?? [];
        const ack = (inputs.length ?? 0) === this.numPlayers;
        return ack;
    }

    // resend the last few inputs just for good measure
    // TODO: be smarter
    sync(round: number, rollbacks?: number) {
        rollbacks =
            typeof rollbacks === 'undefined' ? this.rollbacks : rollbacks;
        this.store.sync(round);
        if (Date.now() - this.lastSync < 1000) {
            return;
        }
        let syncs = 0;
        for (let i = 0; i <= rollbacks + 2; i++) {
            (this.getInputs(round - this.rollbacks - i) || []).forEach(
                (input) => {
                    syncs++;
                    setTimeout(() => {
                        this.transport.sendPacket(input);
                    }, 0);
                },
            );
        }
        console.log(`retransmitted ${syncs} input packets to sync`);
        this.lastSync = Date.now();
    }
}
