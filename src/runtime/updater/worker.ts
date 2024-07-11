import { moveSystem } from '../../substream/moveSystem';
import { physicsSystem } from '../../substream/physicsSystem';
import { InputPacket } from '../network/types';
import { Store } from '../store';

let updaterCh: MessagePort;
let rendererCh: MessagePort;

let store = new Store();
const storeHistory: Store[] = [];
let lastRoundProcessed;

function init({
    renderPort,
    updaterPort,
}: {
    renderPort: MessagePort;
    updaterPort: MessagePort;
}) {
    rendererCh = renderPort;
    updaterCh = updaterPort;

    updaterCh.onmessage = ({
        data: actionsByRound,
    }: {
        data: InputPacket[][];
    }) => {
        if (!actionsByRound[0]) {
            console.warn('actionsByRound[0] is undefined');
            return;
        }
        if (!actionsByRound[0][0]) {
            console.warn('actionsByRound[0][0] is undefined');
            return;
        }
        if (actionsByRound[0][0].round <= lastRoundProcessed) {
            const numReplaying =
                lastRoundProcessed - actionsByRound[0][0].round + 1;
            if (numReplaying > 5) {
                // warn if we are above some threshold of replays as we want to keep this low
                console.warn(`replaying ${numReplaying} rounds`);
            }
            if (actionsByRound[0][0].round == 0) {
                store = new Store();
            } else {
                // Go back in history
                store = storeHistory[actionsByRound[0][0].round - 1];

                if (!store) {
                    console.warn('store not found in history');
                    return;
                }
            }
        }
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
            //backup here

            storeHistory[actions[0].round] = Store.from([
                ...structuredClone(store.entities),
            ]);
            lastRoundProcessed = actions[0].round;
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
