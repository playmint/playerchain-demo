import application from 'socket:application';
import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import { Game, LocalNetwork, Network, Renderer, Updater } from './runtime';

const init = async () => {
    const win = await application.getCurrentWindow();
    const playerIndex = win.index;

    // setup player peer
    const peerSecretKey = `peerSecret/${playerIndex}`;
    let peerSecretValue = localStorage.getItem(peerSecretKey);
    if (peerSecretValue === null) {
        peerSecretValue = randomBytes(64).toString('base64');
        if (peerSecretValue === null) {
            throw new Error('Failed to generate peer secret');
        }
        localStorage.setItem(peerSecretKey, peerSecretValue);
    }
    const signingKeys = await Encryption.createKeyPair(peerSecretValue);
    const peerId = await Encryption.createId(
        Buffer.from(signingKeys.publicKey).toString('base64'),
    );
    console.log('THIS WINDOW IS PLAYER', peerId);

    // setup network

    const renderUpdaterCh = new MessageChannel();
    const updaterNetworkCh = new MessageChannel();

    // const network = await Network.create({ signingKeys, peerId });
    const network = await LocalNetwork.create({
        peerId,
        updaterPort: updaterNetworkCh.port1,
    });

    // setup updater
    const updater = await Updater.create({
        updaterPort: updaterNetworkCh.port2,
        renderPort: renderUpdaterCh.port2,
    });

    // setup renderer
    const renderer = await Renderer.create({
        renderPort: renderUpdaterCh.port1,
        peerId,
    });

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
