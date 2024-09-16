import * as Comlink from 'comlink';
import dgram from 'socket:dgram';
import events from 'socket:events';
import { Client, ClientConfig } from '../../runtime/client';
import { CLUSTER_ID } from '../../runtime/config';
import { Message, UnsignedMessage } from '../../runtime/messages';
import { Encryption } from '../../runtime/network/Peer';
import api from '../../runtime/network/api';
import { Packet, TransportEmitOpts } from '../../runtime/transport';
import type { ClientUserConfig } from '../hooks/use-client';

const network = (options) =>
    api(options, events, dgram as unknown as typeof import('node:dgram'));

// socket is broken
// globalThis.window = self;
// window.top = self;

let client: Client;

export async function init(userConfig: ClientUserConfig) {
    const clusterId = await Encryption.createClusterId(CLUSTER_ID);
    const cfg: ClientConfig = {
        ...userConfig,
        clusterId,
        network,
        config: {
            limitExempt: true,
        },
    };
    // client = await Client.from(cfg);

    client = new Client(cfg);
    globalThis.client = client; // for debugging
    if (client._ready) {
        await client._ready;
        client._ready = null;
    }
}

export async function commit(
    msg: UnsignedMessage,
    ackIds?: Uint8Array[] | null,
): Promise<Message> {
    return client!.commit(msg, ackIds);
}

export async function send(packet: Packet, opts?: TransportEmitOpts) {
    return client!.send(packet, opts);
}

export async function createChannel(name: string) {
    return client!.createChannel(name);
}

export async function joinChannel(id: string) {
    await client!.joinChannel(id);
}

export async function setPeers(id: string, peers: string[]) {
    console.log('setPeers', id, peers);
    await client!.setPeers(id, peers);
}

export async function shutdown() {
    await client!.shutdown();
}

const exports = {
    init,
    commit,
    createChannel,
    joinChannel,
    setPeers,
    shutdown,
};
Comlink.expose(exports);
