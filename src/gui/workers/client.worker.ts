import * as Comlink from 'comlink';
import { Encryption, network } from 'socket:network';
import { BOOTSTRAP_PEERS } from '../../runtime/bootstrap';
import { Client, ClientConfig } from '../../runtime/client';
import { CLUSTER_ID } from '../../runtime/config';
import { Message, UnsignedMessage } from '../../runtime/messages';
import type { ClientUserConfig } from '../hooks/use-client';

// socket is broken
// globalThis.window = self;
// window.top = self;

let client: Client;

export async function init(userConfig: ClientUserConfig) {
    // an entrypoint to the network, nothing special about this node, any node will do
    console.log('bootstrapping with:', BOOTSTRAP_PEERS);

    const clusterId = await Encryption.createClusterId(CLUSTER_ID);
    const cfg: ClientConfig = {
        ...userConfig,
        clusterId,
        network,
        config: {
            peers: BOOTSTRAP_PEERS,
            limitExempt: true,
        },
    };
    client = await Client.from(cfg);
}

export async function commit(msg: UnsignedMessage): Promise<Message> {
    return client!.commit(msg);
}

export async function createChannel(name: string) {
    return client!.createChannel(name);
}

export async function joinChannel(id: string) {
    await client!.joinChannel(id);
}

export async function shutdown() {
    await client!.shutdown();
}

const exports = {
    init,
    commit,
    createChannel,
    joinChannel,
    shutdown,
};
Comlink.expose(exports);
