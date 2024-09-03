import { expect } from 'chai';
import Dexie from 'dexie';
import database, { DB, StoredMessage } from '../runtime/db';
import { Message, MessageType } from '../runtime/messages';

suite('db.test.ts');

let dbi = 0;
let dbname: string;
let db: DB;

beforeEach(async () => {
    dbi++;
    dbname = `testdb${dbi}`;
    if (await Dexie.exists(dbname)) {
        await Dexie.delete(dbname);
    }
    db = database.open(dbname);
});

afterEach(async () => {
    db.close();
    await Dexie.delete(dbname);
});

test('DBQueryMessages', async () => {
    const msg: StoredMessage = {
        arrived: 1,
        type: MessageType.INPUT,
        round: 4,
        sig: new Uint8Array([33]),
        peer: new Uint8Array([1]),
        channel: 'a',
        data: 1,
        acks: [] as Uint8Array[],
        height: 0,
        parent: null,
    };
    await db.messages.add({ ...msg });
    const messages = await db.messages.toArray();
    expect(messages).to.deep.equal([msg]);
});

test('DBWriteMessagesPerSecond', async () => {
    const simulatedMessagesPerSecond = 60;
    const simulatedParticipants = 20;
    const totalmessages = simulatedMessagesPerSecond * simulatedParticipants;

    const messages: StoredMessage[] = [];
    let prev: Message | null = null;
    for (let i = 0; i < totalmessages; i++) {
        const msg = {
            arrived: i + 1,
            sig: new Uint8Array(
                BigInt(i)
                    .toString(16)
                    .split('')
                    .map((c) => c.charCodeAt(0)),
            ),
            peer: new Uint8Array([1]),
            channel: new Uint8Array([i + 10000]),
            type: MessageType.INPUT,
            data: Math.random().toString(36),
            acks: [],
            parent: prev ? prev.sig : null,
        };
        prev = msg;
        messages.push(msg);
    }

    const start = Date.now();
    await Promise.all(
        messages.map((message) =>
            db.messages.add(message).catch((err) => {
                return Promise.reject(
                    new Error(`add failed for message ${message}: ${err}`),
                );
            }),
        ),
    );
    const duration = Date.now() - start;

    const actualMessagesPerSecond = (totalmessages / duration) * 1000;
    console.log(
        `DBWritemessages took:${duration}ms to write ${totalmessages} messages (${Math.floor(actualMessagesPerSecond)}pps)`,
    );

    expect(await db.messages.count()).to.equal(totalmessages);
    expect(actualMessagesPerSecond).to.be.greaterThan(120);
});
