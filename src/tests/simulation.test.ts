import { expect } from 'chai';
import Dexie from 'dexie';
import { Encryption } from 'socket:network';
import { Client } from '../runtime/client';
import { StateTag } from '../runtime/db';
import { World } from '../runtime/ecs';
import {
    GameModule,
    Model,
    SimulationSchema,
    Traits,
    hasTrait,
} from '../runtime/game';
import { MessageType } from '../runtime/messages';
import { Simulation } from '../runtime/simulation';
import {
    Transport,
    createTransportFromEnvironment,
} from '../runtime/transport';
import { DummyGameModule } from './utils/dummygame';
import { waitFor } from './utils/helpers';

suite('simulation.test.ts');

let client1: Client;
let client2: Client;
let transport1: Transport;
let transport2: Transport;
let mod1: GameModule;
let mod2: GameModule;
let channelId: string;
let sim1: Simulation;
let sim2: Simulation;
beforeEach(async () => {
    const rnd = (Math.random() * 10000000).toString(16).slice(0, 8);
    const keys1 = await Encryption.createKeyPair(`client.${rnd}1`);
    const keys2 = await Encryption.createKeyPair(`client.${rnd}2`);
    client1 = await Client.from({ keys: keys1 });
    client2 = await Client.from({ keys: keys2 });
    transport1 = await createTransportFromEnvironment({ keys: keys1 });
    transport2 = await createTransportFromEnvironment({ keys: keys2 });
    const channel = await client1.createChannel(`TEST_CHAN_SIM_${rnd}`);
    const ch = await client1.db.channels.get(channel);
    await client2.joinChannel(ch!.id);
    channelId = ch!.id;
    mod1 = new DummyGameModule();
    mod2 = new DummyGameModule();
    const rate = 100;
    const inputBuffer = 0;
    sim1 = new Simulation({
        client: client1,
        mod: mod1,
        channelId,
        rate,
        inputBuffer,
    });
    sim2 = new Simulation({
        client: client2,
        mod: mod2,
        channelId,
        rate,
        inputBuffer,
    });
});

afterEach(async () => {
    sim1.destroy();
    sim2.destroy();
    await client1.destroy();
    await client2.destroy();
    await transport1.destroy();
    await transport2.destroy();
});

test('SimulationProducesStateOnMessage', async () => {
    // client1 presses UP 3 times
    mod1.onKeyDown('w');
    await client1.commit({
        type: MessageType.INPUT,
        round: 28,
        channel: channelId,
        data: mod1.getInput(),
    });
    await client1.commit({
        type: MessageType.INPUT,
        round: 29,
        channel: channelId,
        data: mod1.getInput(),
    });
    await client1.commit({
        type: MessageType.INPUT,
        round: 30,
        channel: channelId,
        data: mod1.getInput(),
    });
    mod1.onKeyUp('w');
    const commits = await client1.db.messages
        .where(['channel', 'round', 'peer'])
        .between(
            [channelId, Dexie.minKey, client1.id],
            [channelId, Dexie.maxKey, client1.id],
        )
        .toArray();
    expect(commits).to.have.length(3);

    // start the simulation
    sim1.play();

    // eventually the simulation should produce a state for round 1
    let serializedWorld1: string | undefined;
    await waitFor(
        async () => {
            const serialized = await client1.db.state
                .where(['channel', 'tag', 'round'])
                .equals([channelId, StateTag.ACCEPTED, 30])
                .first();
            serializedWorld1 = serialized?.data;
            return !!serializedWorld1;
        },
        4000,
        'should eventually produce state for round 3',
    );

    let world1 = JSON.parse(serializedWorld1!) as World<SimulationSchema>;
    expect(world1).to.be.ok;

    const player1 = world1.entities.find(
        (e) =>
            e &&
            hasTrait(e, Traits.Player) &&
            e.owner === Buffer.from(client1.id).toString('hex'),
    );
    expect(player1, 'should have player1 trait entity with peer id').to.be.ok;
    expect(player1!.object?.type, 'should have a box1').to.equal(Model.Box);
    expect(
        player1!.object?.position[2],
        'should have moved box1',
    ).to.be.approximately(-0.3, 0.001);

    // another client makes a commit to the same channel and the same round
    // eventually they should rollback and sync and produce the same state
    mod2.onKeyDown('s');
    await client2.commit({
        type: MessageType.INPUT,
        round: 28,
        channel: channelId,
        data: mod2.getInput(),
    });
    await client2.commit({
        type: MessageType.INPUT,
        round: 29,
        channel: channelId,
        data: mod2.getInput(),
    });
    await client2.commit({
        type: MessageType.INPUT,
        round: 30,
        channel: channelId,
        data: mod2.getInput(),
    });
    mod2.onKeyUp('s');

    // start player2's simulation
    sim2.play();

    // eventutally client2 should have a state
    // containing just their player entity
    let serializedWorld2: string | undefined;
    await waitFor(
        async () => {
            const serialized = await client2.db.state
                .where(['channel', 'tag', 'round'])
                .equals([channelId, StateTag.ACCEPTED, 30])
                .first();
            serializedWorld2 = serialized?.data;
            return !!serializedWorld2;
        },
        4000,
        'should eventually produce state for player 2 round 30',
    );

    // fetch world2
    const world2 = JSON.parse(serializedWorld2!) as World<SimulationSchema>;
    expect(world2).to.be.ok;

    // confirm player2 entity is as expected in player2 world
    const player2 = world2.entities.find(
        (e) =>
            e &&
            hasTrait(e, Traits.Player) &&
            e.owner === Buffer.from(client2.id).toString('hex'),
    );
    expect(player2, 'should have player2 trait entity with peer id').to.be.ok;
    expect(player2!.object?.type, 'should have a box2').to.equal(Model.Box);
    expect(
        player2!.object?.position[2],
        'should have moved box2',
    ).to.be.approximately(0.3, 0.001);

    // connect the clients together
    client1.connect(transport1);
    client2.connect(transport2);

    // client1 should eventually have 6 commits (3 from each client)
    await waitFor(
        async () => {
            const commitCount = await client1.db.messages.count();
            return commitCount === 7;
        },
        4000,
        `client1 should have synced 7 messages, 3 per client + channel create`,
    );

    // which should eventually cause client1 to rollback and sync
    // round3 and end up with 2 player entities in the state
    await waitFor(
        async () => {
            const serialized = await client1.db.state
                .where(['channel', 'tag', 'round'])
                .equals([channelId, StateTag.ACCEPTED, 30])
                .first();
            if (serialized && serialized.data) {
                world1 = JSON.parse(serialized.data) as World<SimulationSchema>;
                const players = world1.entities.filter(
                    (e) => e && hasTrait(e, Traits.Player),
                );
                return players.length === 2;
            }
            return false;
        },
        1000,
        'client1 should have rolled back and updated round 30 state to have 2 player entities',
    );

    // world1 should now contain the latest state from client1
    expect(world1).to.be.ok;

    // we should have player entities labeled with peer ids in order
    const p1 = world1.entities.find(
        (e) =>
            e &&
            hasTrait(e, Traits.Player) &&
            e.owner === Buffer.from(client1.id).toString('hex'),
    );
    const p2 = world1.entities.find(
        (e) =>
            e &&
            hasTrait(e, Traits.Player) &&
            e.owner === Buffer.from(client2.id).toString('hex'),
    );
    expect(
        [p1?.owner, p2?.owner],
        'should have both player1 and player2 entities',
    ).to.deep.equal([
        Buffer.from(client1.id).toString('hex'),
        Buffer.from(client2.id).toString('hex'),
    ]);

    // we should have box entities with expected positions
    // if the rollback was incorrect the positions would be wrong
    expect(
        [
            parseFloat(p1!.object!.position[2].toFixed(4)),
            parseFloat(p2!.object!.position[2].toFixed(4)),
        ],
        'should have both boxes at expected positions',
    ).to.deep.equal([-0.3, 0.3]);
});
