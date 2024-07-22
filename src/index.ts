import application from 'socket:application';
import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import {
    BroadcastTransport,
    Game,
    LockstepDB,
    MemoryDB,
    MessageEncoder,
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

    // setup network

    const renderUpdaterCh = new MessageChannel();
    const updaterNetworkCh = new MessageChannel();

    const channel = {
        name: `SUBSTREAM_CHANNEL_${config.channelName.toUpperCase().replace(/\s+/g, '_')}`,
        secret: `SUBSTREAM_SECRET_${config.channelName}`,
        peers: [peerId],
    };

    // hardcode ports so can talk to self
    // const port = [9800, 9802, 9804, 9806, 9808][playerIndex];
    // const address = '81.243.206.45';

    console.log(`WINDOW ${win.index} IS PLAYER ${peerId}`);

    const keys = new Map<string, Uint8Array>();
    keys.set(Buffer.from(peerId).toString(), signingKeys.publicKey);
    const enc = new MessageEncoder({
        keys,
        sk: signingKeys.privateKey,
    });

    // pick transport
    const transport: Transport =
        config.transport === 'socket'
            ? new SocketTransport({
                  channel,
                  signingKeys,
                  peerId,
                  numPlayers: config.numPlayers,
                  enc,
              })
            : new BroadcastTransport({
                  enc,
                  channel,
                  signingKeys,
                  peerId,
                  numPlayers: config.numPlayers,
              });

    // pick consensus strategy
    const store = new MemoryDB();
    const db: InputDB =
        config.consensus === 'lockstep'
            ? new LockstepDB({
                  enc,
                  store,
                  transport,
                  numPlayers: config.numPlayers,
                  rollbacks: 20, // 1000/tickRate*2 ish
                  peerId,
              })
            : store;

    // setup input schedule
    const network = await Network.create({
        peerId,
        updaterPort: updaterNetworkCh.port1,
        tickRate: 66,
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
