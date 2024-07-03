import Buffer from 'socket:buffer';
import EventEmitter from 'socket:events';
import { Encryption, network } from 'socket:network';

const actions = new Map();

const updaterCh = new BroadcastChannel('updater');
let subcluster: EventEmitter;

export async function init(signingKeys, peerId) {
    console.log('init network');

    const clusterId = await Encryption.createClusterId('SOCKET_PARTY');

    const net = await network({
        clusterId,
        peerId,
        signingKeys,
        limitExempt: true,
    });

    await new Promise((resolve, reject) => {
        net.on('#ready', () => {
            console.log('Network is kinda ready...');
            resolve(true);
        });

        net.on('#error', (err) => {
            console.error('Network failed to setup:', err);
            reject(err);
        });
    });

    // Should be ready here...
    console.log('Network is ready!');

    const sharedSecret = 'SOCKET_PARTY_SECRET';
    const subclusterSharedKey = await Encryption.createSharedKey(sharedSecret);
    subcluster = await net.subcluster({
        sharedKey: subclusterSharedKey,
    });

    subcluster.on('action', (value, packet) => {
        if (typeof value !== 'object' || value === null) return;
        if (typeof packet !== 'object' || packet === null) return;
        if (!packet.verified) return;

        const msg = JSON.parse(Buffer.from(value).toString());
        const { peerId, action } = msg;
        actions.set(peerId, action);

        updaterCh.postMessage(actions);
    });
}

self.onmessage = function (message) {
    const { data } = message;
    const { type, payload } = data;
    switch (type) {
        case 'init':
            init(payload.signingKeys, payload.peerId).catch((err) => {
                console.error('Failed to init network', err);
            });
            break;
        case 'updateInput':
            console.log('net resv input', payload);
            subcluster!.emit('action', Buffer.from(JSON.stringify(payload)));
    }
};
