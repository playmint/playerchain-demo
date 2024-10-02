import { assert, expect } from 'chai';
import 'chai-as-promised';
import Dexie from 'dexie';
import { Encryption } from 'socket:network';
import { Client, ClientKeys } from '../runtime/client';
import {
    InputMessage,
    MessageType,
    UnsignedMessage,
} from '../runtime/messages';
import {
    Transport,
    createTransportFromEnvironment,
} from '../runtime/transport';
import { waitFor } from './utils/helpers';

suite('client.test.ts');

let activeClients: Client[] = [];
let activeTransports: Transport[] = [];

let rnd: string = '';
let client: Client;
let keys: { publicKey: Uint8Array; privateKey: Uint8Array };
async function createClient(): Promise<Client> {
    // we use random client id to avoid duplication in integration tests
    // which may deliever old messages to new clients
    rnd = (Math.random() * 10000000).toString(16).slice(0, 8);
    keys = await Encryption.createKeyPair(`client.${rnd}`);
    await Client.delete(keys.publicKey); // wipe any previous data
    const c = await Client.from({ keys });
    activeClients.push(c);
    return c;
}

async function createTransport(keys: ClientKeys): Promise<Transport> {
    const transport = await createTransportFromEnvironment({ keys });
    activeTransports.push(transport);
    return transport;
}

beforeEach(async () => {
    activeClients = [];
    activeTransports = [];
    client = await createClient();
});

afterEach(async () => {
    await Promise.all(activeClients.map((c) => c.destroy()));
    await Promise.all(activeTransports.map((t) => t.destroy()));
});

test('ClientSignVerify', async () => {
    const msg = await client.commit({
        type: MessageType.INPUT,
        round: 1,
        channel: 'a',
        data: 1,
    });
    assert(!!msg.sig, 'expected message id to be signature');
    assert(
        Buffer.from(msg.sig).toString('hex').length == 128,
        `expected sig to be 64 bytes, got ${Buffer.from(msg.sig).toString('hex').length}`,
    );

    const verified = await client.verify(msg);
    assert(verified, 'expected message to be verified');
});

test('ClientCommit', async () => {
    const msgs: UnsignedMessage[] = [
        {
            type: MessageType.INPUT,
            channel: 'a',
            round: 1,
            data: 2,
        },
        {
            type: MessageType.INPUT,
            channel: 'a',
            round: 2,
            data: 2,
        },
        {
            type: MessageType.INPUT,
            channel: 'a',
            round: 3,
            data: 3,
        },
    ];
    for (const msg of msgs) {
        const m = await client.commit(msg);
        expect(m).to.be.ok;
        expect(m.sig).to.be.ok;
    }
    const [m1, m2, m3] = (await client.db.messages
        .where(['peer', 'height'])
        .between([client.id, Dexie.minKey], [client.id, Dexie.maxKey])
        .toArray()) as any[];
    expect(m1.round).to.equal(1);
    expect(m2.round).to.equal(2);
    expect(m3.round).to.equal(3);
    expect(m1.height).to.equal(0);
    expect(m2.height).to.equal(1);
    expect(m3.height).to.equal(2);
    expect(m1.parent).to.equal(null);
    expect(m2.parent.toString()).to.equal(m1.sig.toString());
    expect(m3.parent.toString()).to.equal(m2.sig.toString());
    expect(m1.channel).to.equal('a');
    expect(m1.sig).to.not.equal(m2.sig);
    expect(m2.sig).to.not.equal(m3.sig);
});

test('ClientSyncChannel', async () => {
    const transport = await createTransport(keys);
    await client.connect(transport);
    // create a channel
    const channel = await client.createChannel(`TEST_CHAN_${rnd}`);
    const ch = await client.db.channels.get(channel);
    expect(ch).to.be.ok;
    const genesisID = Uint8Array.from(atob(ch!.id), (c) => c.charCodeAt(0));
    const genesisMessage = await client.db.messages
        .where('sig')
        .equals(genesisID)
        .first();
    expect(genesisMessage).to.be.ok;
    // fill client one
    for (let i = 0; i < 10; i++) {
        await client.commit({
            type: MessageType.INPUT,
            channel,
            round: i,
            data: i,
        });
    }
    expect(await client.db.messages.count(), 'commitments stored').to.equal(
        10 + 1,
    );
    // start client two
    const client2 = await createClient();
    const transport2 = await createTransport({
        publicKey: client2.id,
        privateKey: client2.key,
    });
    client2.connect(transport2);
    // join the channel
    await client2.joinChannel(ch!.id);
    // wait til client2 has synced
    const n1 = await client.db.messages.where('peer').equals(client.id).count();
    await waitFor(
        async () => {
            const n2 = await client2.db.messages
                .where('peer')
                .equals(client.id)
                .count();
            console.log('client1:', n1, 'client2:', n2);
            return n2 == n1;
        },
        5000,
        'waiting for client1 and client2 to have same number messages',
    );
    // confirm that client two has the same messages in store
    const m1 = await client.db.messages
        .where('peer')
        .equals(client.id)
        .toArray();
    const m2 = await client2.db.messages
        .where('peer')
        .equals(client.id)
        .toArray();
    // note: ignore the updated field, it is local
    expect(
        m1.map((m) => ({ ...m, updated: 0 })),
        'both clients have same message data',
    ).to.deep.equal(m2.map((m) => ({ ...m, updated: 0 })));
});

test('ClientCommitPerSecond', async () => {
    const simulatedMessagesPerSecond = 60;
    const simulatedParticipants = 10;
    const totalmessages = simulatedMessagesPerSecond * simulatedParticipants;

    const start = Date.now();

    for (let i = 0; i < totalmessages; i++) {
        await client.commit({
            type: MessageType.INPUT,
            channel: `ch${i % 3}`,
            round: i,
            data: Math.floor(Math.random() * 100),
        });
    }

    const duration = Date.now() - start;

    const actualMessagesPerSecond = (totalmessages / duration) * 1000;
    console.log(
        `ClientCommit took:${duration}ms to write ${totalmessages} messages (${Math.floor(actualMessagesPerSecond)}pps)`,
    );

    expect(await client.db.messages.count()).to.equal(totalmessages);
    expect(actualMessagesPerSecond).to.be.greaterThan(120);
});
