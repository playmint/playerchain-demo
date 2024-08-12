import { InputPacket } from '../runtime/network/types';
import { RigidBodyKind, Store } from '../runtime/store';
import { moveSystem } from './moveSystem';
import { physicsSystem } from './physicsSystem';
import { shipAudioSystem } from './shipAudioSystem';

let store = new Store();
const storeHistory: Store[] = [];
let lastRoundProcessed;

function update(actionsByRoundJSON?: string) {
    if (!actionsByRoundJSON) {
        console.log('actionsByRoundJSON is undefined');
        return;
    }

    const actionsByRound = JSON.parse(actionsByRoundJSON) as InputPacket[][];
    return _update(actionsByRound);
}

function _update(actionsByRound: InputPacket[][]) {
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
        }
    }
    actionsByRound.forEach((actions: InputPacket[]) => {
        const roundNum = actions[0].round;

        // Can this ever be undefined?
        if (actions) {
            // This shouldn't be here ideally...
            for (const { peerId } of actions) {
                if (
                    !store.entities.some((entity) => entity.playerId === peerId)
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

        // Execute systems
        moveSystem(store, roundNum);
        physicsSystem(store);
        shipAudioSystem(store);

        //backup here
        storeHistory[actions[0].round] = Store.from([
            ...JSON.parse(JSON.stringify(store.entities)), // lazy deep copy as we don't have structureClone
        ]);
        lastRoundProcessed = roundNum;
    });

    return store.entities;
}

update();
