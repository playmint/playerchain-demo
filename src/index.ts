import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import { Game, Network, Renderer, Updater } from './runtime';

const init = async () => {
    // setup player peer
    let peerSecret = localStorage.getItem('peerSecret');
    if (peerSecret === null) {
        peerSecret = randomBytes(64).toString('base64');
        if (peerSecret === null) {
            throw new Error('Failed to generate peer secret');
        }
        localStorage.setItem('peerSecret', peerSecret);
    }
    const signingKeys = await Encryption.createKeyPair(peerSecret);
    const peerId = await Encryption.createId(
        Buffer.from(signingKeys.publicKey).toString('base64'),
    );

    // setup network
    const network = await Network.create({ signingKeys, peerId });

    // setup renderer
    const renderer = await Renderer.create();

    // setup updater
    const updater = await Updater.create();

    // configure game
    await Game.create({
        window,
        network,
        renderer,
        updater,
    });
};

init().catch((error) => {
    console.error('Error initializing game: ', error);
});
