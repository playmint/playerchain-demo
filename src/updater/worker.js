import { Store } from '../store/store.js';

const updaterCh = new BroadcastChannel("updater");
const rendererCh = new BroadcastChannel("renderer");

let store = new Store();
let actions = new Map(); // keyed by playerId

function init() {

    // squares

    store.add();
    store.entities[0].position.x = -10;
    store.entities[0].isSquare = true;
    store.entities[0].owner = 100;
    store.entities[0].color = 0x00ff00;

    store.add();
    store.entities[1].position.x = 10;
    store.entities[1].isSquare = true;
    store.entities[1].color = 0xff0000;
    store.entities[1].owner = 200;

    // players

    store.add();
    store.entities[2].isPlayer = true;
    store.entities[2].playerId = 100;

    store.add();
    store.entities[3].isPlayer = true;
    store.entities[3].playerId = 200;

    tick();

    console.log('init updater');
}


/** @param {import("../store/store.js").Entity[]} entities  */
function moveSystem(entities) {
    const players = entities.filter((entity) => entity.isPlayer);
    const squares = entities.filter((entity) => entity.isSquare);
    squares.forEach((square) => {
        players.forEach((player) => {
            if (square.owner === player.playerId) {
                if (player.actions.forward) {
                    square.position.y += 2;
                } else if (player.actions.back) {
                    square.position.y -= 2;
                }
                if (player.actions.left) {
                    square.position.x -= 2;
                } else if (player.actions.right) {
                    square.position.x += 2;
                }
            }
        })
    });
}

function tick() {
    moveSystem(store.entities);

    // console.log('[updater] send', store.entities);
    rendererCh.postMessage(store.entities);

    setTimeout(tick, 100);
}

self.onmessage = function (message) {
    const { data } = message;
    const { type, payload } = data;
    switch (type) {
        case 'init':
            init();
            break;
    }
};

updaterCh.onmessage = ({ data: actions }) => {
    // console.log('[updater] recv', actions);
    const players = store.entities.filter((entity) => entity.isPlayer);
    players.forEach((player) => {
        const playerActions = actions.get(player.playerId);
        if (playerActions) {
            player.actions = playerActions;
        }
    });
}
