import { Clock } from 'three';
import { moveSystem } from '../../substream/moveSystem';
import { physicsSystem } from '../../substream/physicsSystem';
import { Store } from '../store';

let updaterCh: MessagePort;
let rendererCh: MessagePort;

const store = new Store();

function init({
    renderPort,
    updaterPort,
}: {
    renderPort: MessagePort;
    updaterPort: MessagePort;
}) {
    rendererCh = renderPort;
    updaterCh = updaterPort;

    updaterCh.onmessage = ({ data: actions }) => {
        // This shouldn't be here ideally...
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

    tick();

    console.log('init updater');
}

function tick() {
    try {
        moveSystem(store);
        physicsSystem(store);
        // console.log('[updater] send', store.entities);
        rendererCh.postMessage(store.entities);
    } catch (e) {
        console.log('tick error: ', e);
    }
    setTimeout(tick, 100);
}

self.onmessage = function (message) {
    const { data } = message;
    const { type, payload } = data;
    switch (type) {
        case 'init':
            init({
                renderPort: payload.renderPort,
                updaterPort: payload.updaterPort,
            });
            break;
    }
};
