import * as Comlink from 'comlink';
import dgram from 'socket:dgram';
import { EmitOpts } from '../../runtime/channels';
import { Client, ClientConfig } from '../../runtime/client';
import { CLUSTER_ID } from '../../runtime/config';
import { ChainMessage, Message } from '../../runtime/messages';
import { Encryption } from '../../runtime/network/Peer';
import type { ClientUserConfig } from '../hooks/use-client';

// socket is broken
// globalThis.window = self;
// window.top = self;

let client: Client;

export async function init(userConfig: ClientUserConfig) {
    const clusterId = await Encryption.createClusterId(CLUSTER_ID);
    const cfg: ClientConfig = {
        dbname: userConfig.dbname,
        clusterId,
        keys: userConfig.keys,
        dgram: dgram as any,
        config: {
            limitExempt: true,
            signingKeys: userConfig.keys,
            clusterId,
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
    msg: ChainMessage,
    channelId: string | null,
): Promise<Message> {
    return client!.commit(msg, channelId);
}

export async function send(msg: Message, opts?: EmitOpts) {
    return client!.send(msg, opts);
}

export async function createChannel(name: string) {
    return client!.createChannel(name);
}

export async function joinChannel(id: string) {
    await client!.joinChannel(id);
}

export async function setPeers(id: string, peers: string[]) {
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
