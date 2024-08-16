import { createDes, createSer } from 'seqproto';
import { InputPacket } from '../../runtime/network/types';
import { RigidBodyKind, Store } from '../../runtime/store';
import { deserializeEntity, serializeEntity } from '../Serializer';
import { bulletSystem } from '../bulletSystem';
import { moveSystem } from '../moveSystem';
import { physicsSystem } from '../physicsSystem';
import { shipAudioSystem } from '../shipAudioSystem';

// globalThis['TextEncoder'] = TextEncoder;
const test = new TextEncoder();

const MAX_ROLLBACK_ROUNDS = 100;
let store = new Store();
const storeHistory: Store[] = new Array(MAX_ROLLBACK_ROUNDS);
let lastRoundProcessed: number = 0;

function update(actionsByRound: InputPacket[][]) {
    if (actionsByRound[0][0].round <= lastRoundProcessed) {
        const numReplaying =
            lastRoundProcessed - actionsByRound[0][0].round + 1;
        // console.log(
        //     `rolling back to round: ${actionsByRound[0][0].round - 1} numReplaying: ${numReplaying}`,
        // );
        if (numReplaying > 5) {
            // warn if we are above some threshold of replays as we want to keep this low
            console.warn(`replaying ${numReplaying} rounds`);
        }
        if (actionsByRound[0][0].round == 0) {
            store = new Store();
        } else {
            // Go back in history
            store =
                storeHistory[
                    (actionsByRound[0][0].round - 1) % MAX_ROLLBACK_ROUNDS
                ];

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
        bulletSystem(store);
        shipAudioSystem(store);

        // NOTE: BOTTLENECK
        //backup here
        // storeHistory[actions[0].round % MAX_ROLLBACK_ROUNDS] = Store.from([
        //     ...JSON.parse(JSON.stringify(store.entities)), // lazy deep copy as we don't have structureClone
        // ]);
        lastRoundProcessed = roundNum;
    });

    const ser = createSer();
    ser.serializeUInt32(store.entities.length);
    store.entities.forEach((entity) => {
        serializeEntity(ser, entity);
    });

    // DEBUG: Deserialise the entities to check the round trip
    // const des = createDes(ser.getBuffer());
    // const entitiesLen = des.deserializeUInt32();
    // console.log('sandbox: entitiesLen', entitiesLen);
    // for (let i = 0; i < entitiesLen; i++) {
    //     const entity = deserializeEntity(des);
    //     console.log('sandbox: entity', i, entity.id);
    // }

    // testSerDes();
    // testTextEncoder();

    return ser.getBuffer();
}

function testSerDes() {
    const ser = createSer();
    ser.serializeUInt32(123);
    try {
        ser.serializeString('hello');
    } catch (e) {
        console.error('sandbox: string serialise error:', e);
    }

    const des = createDes(ser.getBuffer());
    console.log('sandbox: UInt32:', des.deserializeUInt32());
    console.log('sandbox: String:', des.deserializeString());
}

function testTextEncoder() {
    const encoder = new TextEncoder();
    console.log('sandbox: encoder:', encoder.encodeInto);
    const text = 'hello';
    const buffer = encoder.encode(text);
    console.log('sandbox: text:', text, 'buffer:', buffer.length);
}

// Referencing update so the compiler/bundler doesn't optimise the function away. Export keyword only works with modules and I had
// trouble gettting quickJS's module support to work.
console.log(update);
