import { Store } from '../store/store.js';

const updaterCh = new BroadcastChannel('updater');
const rendererCh = new BroadcastChannel('renderer');

let store = new Store();
let actions = new Map(); // keyed by playerId

function init() {
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
        });
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
    for (const key of actions.keys()) {
        if (!store.entities.some((entity) => entity.playerId === key)) {
            const playerEntity = store.add();
            playerEntity.isPlayer = true;
            playerEntity.playerId = key;

            const ship = store.add();
            ship.position.x = 0;
            ship.isSquare = true;
            ship.owner = key;
            ship.color = 0x00ff00;
        }
    }

    const players = store.entities.filter((entity) => entity.isPlayer);
    players.forEach((player) => {
        const playerActions = actions.get(player.playerId);
        if (playerActions) {
            player.actions = playerActions;
        }
    });
};
