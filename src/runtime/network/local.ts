import { update } from '../../../build/mac/substream-dev.app/Contents/Resources/libs/tween.module';

export class LocalNetwork {
    peerId: string;
    updater: MessagePort;
    fakeNetwork: BroadcastChannel;
    actions: Map<string, unknown>;

    constructor({ peerId, updaterPort }) {
        this.actions = new Map();
        this.updater = updaterPort;
        this.fakeNetwork = new BroadcastChannel('fakenetwork');
        this.peerId = peerId;

        this.fakeNetwork.onmessage = this.onNetworkMessage.bind(this);
    }

    onNetworkMessage({ data }) {
        const { peerId, action } = data;
        this.actions.set(peerId, action);
        this.updater.postMessage(this.actions);
    }

    updateInput(input) {
        const payload = {
            peerId: this.peerId,
            action: input,
        };
        this.fakeNetwork.postMessage(payload);
        this.onNetworkMessage({ data: payload });
        console.log('updateInput', input);
    }

    static async create({ peerId, updaterPort }) {
        const network = new LocalNetwork({ peerId, updaterPort });
        return network;
    }
}
