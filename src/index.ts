import application from 'socket:application';
import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import {
    BroadcastTransport,
    Game,
    LockstepDB,
    MemoryDB,
    Network,
    Renderer,
    SocketTransport,
    Updater,
} from './runtime';
import { InputDB, Transport } from './runtime/network/types';

const init = async () => {
    // extract some config from url
    const params = new URLSearchParams(window.location.search);

    const config = {
        transport: params.get('transport') || 'socket',
        consensus: params.get('consensus') || 'none',
        numPlayers: parseInt(params.get('numPlayers') || '2', 10),
        channelName: params.get('channelName') || 'SUBSPACE_PARTY_CHANNEL',
    };

    // use the window index as the local player id
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
    console.log(`WINDOW ${win.index} IS PLAYER ${peerId}`);

    // setup network

    const renderUpdaterCh = new MessageChannel();
    const updaterNetworkCh = new MessageChannel();

    const channel = {
        name: `SUBSTREAM_CHANNEL_${config.channelName.toUpperCase().replace(/\s+/g, '_')}`,
        secret: `SUBSTREAM_SECRET_${config.channelName}`,
        peers: [peerId],
    };

    // pick transport
    const transport: Transport =
        config.transport === 'socket'
            ? new SocketTransport({ channel, signingKeys, peerId })
            : new BroadcastTransport({ channel });

    // pick consensus strategy
    const store = new MemoryDB();
    const db: InputDB =
        config.consensus === 'lockstep'
            ? new LockstepDB({
                  store,
                  transport,
                  numPlayers: config.numPlayers,
              })
            : store;

    // setup input schedule
    const network = await Network.create({
        peerId,
        updaterPort: updaterNetworkCh.port1,
        tickRate: 100,
        db,
        container: window,
    });

    // setup update schedule
    const updater = await Updater.create({
        updaterPort: updaterNetworkCh.port2,
        renderPort: renderUpdaterCh.port2,
    });

    // setup render schedule
    const renderer = await Renderer.create({
        renderPort: renderUpdaterCh.port1,
        peerId,
    });

    // configure game
    await Game.create({
        network,
        renderer,
        updater,
    });
};

init().catch((error) => {
    console.error('Error initializing game: ', error);
});
