import { RigidBodyKind } from '../../runtime';
import { bulletSystem } from '../../substream/bulletSystem';
import { collisionSystem } from '../../substream/collisionSystem';
import { mapSystem } from '../../substream/mapSystem';
import { moveSystem } from '../../substream/moveSystem';
import { RealPhysicsSystem } from '../../substream/realPhysicsSystem';
import { shipAudioSystem } from '../../substream/shipAudioSystem';
import { InputPacket } from '../network/types';
import { Store } from '../store';

let updaterCh: MessagePort;
let rendererCh: MessagePort;

let store = new Store();
const storeHistory: Store[] = [];
let lastRoundProcessed;

const realPhysicsSystem = new RealPhysicsSystem();

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
            // console.log(
            //     `rolling back to round: ${actionsByRound[0][0].round - 1}`,
            // );
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
                realPhysicsSystem.rollbackToRound(
                    actionsByRound[0][0].round - 1,
                );
            }
        }
        actionsByRound.forEach((actions: InputPacket[]) => {
            const roundNum = actions[0].round;

            // Initialising map before players because the entity count will change after each player is added and the renderer will couple the entities to the wrong objects
            mapSystem(store, roundNum);

            // Can this ever be undefined?
            if (actions) {
                // This shouldn't be here ideally...
                for (const { peerId } of actions) {
                    if (
                        !store.entities.some(
                            (entity) => entity.playerId === peerId,
                        )
                    ) {
                        const playerEntity = store.add();
                        console.log(
                            `added player: ${playerEntity.id} ${peerId.toString()}`,
                        );
                        playerEntity.isPlayer = true;
                        playerEntity.playerId = peerId;

                        const ship = store.add();
                        console.log(`adding ship: ${ship.id}`);
                        ship.position.x = 0;
                        ship.owner = peerId;
                        ship.isShip = true;
                        ship.audioClip = 'thrusters';
                        ship.model = 'ship';
                        ship.labelText = peerId.toString().substring(0, 6);

                        // HACK: So ships don't spawn on top of each other
                        ship.position.y =
                            peerId.toString() ==
                            'a2e1d7d5effc6313d8c35a1fa1695205f8c932ef57080d803a1675d7b09f7d17'
                                ? 20
                                : -20;

                        ship.physics = {
                            rigidBody: {
                                kind: RigidBodyKind.Dynamic, // RigidBodyKind.KinematicVelocity
                                collider: {
                                    isSensor: false,
                                    size: { x: 5, y: 5 },
                                    checkCollisions: true,
                                },
                                lockRotations: true,
                            },
                            collisions: [],
                        };

                        ship.renderer = {
                            visible: true,
                            color: 0x00ff00,
                            geometry: 0, // Not used for ship
                            size: { x: 1, y: 1 }, // Not used for ship
                        };
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
                        fire: false,
                    };
                }
            });

            // console.log(
            //     `processing round ${actions[0].round} actions.length: ${actions.length}`,
            // );

            moveSystem(store, roundNum);
            bulletSystem(store);
            realPhysicsSystem.update(store, roundNum);
            collisionSystem(store);
            shipAudioSystem(store);

            //backup here
            storeHistory[actions[0].round] = Store.from([
                ...structuredClone(store.entities),
            ]);
            lastRoundProcessed = roundNum;
            // console.log(`processed round ${roundNum}`);
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
