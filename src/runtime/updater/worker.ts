import { moveSystem } from '../../substream/moveSystem';
import { physicsSystem } from '../../substream/physicsSystem';
import { InputPacket } from '../network/local';
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

    updaterCh.onmessage = ({ data: actionsByRound }) => {
        actionsByRound.forEach((actions: InputPacket[]) => {
            if (actions) {
                // This shouldn't be here ideally...
                for (const { peerId } of actions) {
                    if (
                        !store.entities.some(
                            (entity) => entity.playerId === peerId,
                        )
                    ) {
                        const playerEntity = store.add();
                        playerEntity.isPlayer = true;
                        playerEntity.playerId = peerId;

                        const ship = store.add();
                        ship.position.x = 0;
                        ship.isSquare = true;
                        ship.owner = peerId;
                        ship.color = 0x00ff00;
                    }
                }
            }

            const players = store.entities.filter((entity) => entity.isPlayer);
            players.forEach((player) => {
                const playerActions = actions?.find(
                    (a) => a.peerId === player.playerId,
                );
                if (playerActions) {
                    player.actions = playerActions.input;
                } else {
                    player.actions = {
                        forward: false,
                        back: false,
                        left: false,
                        right: false,
                    };
                }
            });

            moveSystem(store);
            physicsSystem(store);
            // console.log('[updater] send', store.entities);
        });

        // console.log('processed actions', actionsByRound.length);

        // forward on to the renderer
        rendererCh.postMessage(store.entities);
    };

    console.log('init updater');
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
