import * as cbor from 'cbor-x';
import { expect } from 'chai';
import { Encryption } from 'socket:network';
import { Client } from '../runtime/client';
import { MessageType, PresignedMessage } from '../runtime/messages';

suite('messages.test.ts');

let client: Client;
beforeEach(async () => {
    const keys = await Encryption.createKeyPair('client.01');
    client = await Client.from({ keys });
});

afterEach(async () => {
    await client.destroy();
});

test('MessagesEncodeDecode', async () => {
    const messages: PresignedMessage[] = [
        {
            parent: null,
            acks: [],
            height: 0,
            peer: client.id,
            type: MessageType.INPUT,
            round: 1,
            channel: 'a',
            data: 1,
        },
        {
            parent: null,
            acks: [],
            height: 0,
            peer: client.id,
            type: MessageType.CREATE_CHANNEL,
            name: 'TEST_CHAN',
        },
    ];

    for (const msg of messages) {
        const signed = await client.sign(msg);
        const encoded = cbor.encode(signed);
        const decoded = cbor.decode(encoded);
        const verified = await client.verify(decoded);
        const { sig, ...decodedWithoutSig } = decoded;
        expect(decodedWithoutSig).to.deep.equal(msg);
        expect(verified).to.equal(true);
    }
});
