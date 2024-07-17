import RAPIER, { RigidBody, World } from '@dimforge/rapier2d-compat';
import { RigidBodyKind, Store } from '../runtime';

// const NUM_ROLLBACK_STATES = 20;
const STEPS_PER_ROUND = 1;

export class RealPhysicsSystem {
    world?: World;
    // entityIdToRigidBodyHandle = new Map<number, number>();
    // rididBodyHandleToEntityId = new Map<number, number>();

    snapshots = new Map<number, Uint8Array>();
    lastRound = -1;

    constructor() {
        RAPIER.init().then(() => {
            console.log('RAPIER initialized');

            // Use the RAPIER module here.
            const gravity = { x: 0.0, y: 0 };
            this.world = new RAPIER.World(gravity);
        });
    }

    public rollbackToRound(round: number) {
        // console.log(`Rolling back to round ${round}`);
        if (round > 0) {
            const snapshot = this.snapshots.get(round);
            if (snapshot) {
                // console.log('Physics: Rolling back to round', round);
                this.world = World.restoreSnapshot(snapshot);
            } else {
                console.error(
                    `Snapshot not found for round ${round}. resetting world`,
                );
                const gravity = { x: 0, y: 0 };
                this.world = new RAPIER.World(gravity);
            }
        } else {
            const gravity = { x: 0, y: 0 };
            this.world = new RAPIER.World(gravity);
        }

        this.lastRound = round;
    }

    private getRigidBodyDesc(kind: RigidBodyKind) {
        switch (kind) {
            case RigidBodyKind.Dynamic:
                return RAPIER.RigidBodyDesc.dynamic();
            case RigidBodyKind.Fixed:
                return RAPIER.RigidBodyDesc.fixed();
            case RigidBodyKind.KinematicVelocity:
                return RAPIER.RigidBodyDesc.kinematicVelocityBased();
            case RigidBodyKind.KinematicPosition:
                return RAPIER.RigidBodyDesc.kinematicPositionBased();
            default:
                return RAPIER.RigidBodyDesc.dynamic();
        }
    }

    public update(store: Store, round: number) {
        if (round < 1) {
            return;
        }

        if (!this.world) {
            return;
        }

        // For some reason the updater wasn't calling the rollback so put a failsafe here.
        if (round <= this.lastRound) {
            const rollbackRound = round - 1;
            console.log(
                `Physics: system didn't roll back physics to round: ${rollbackRound}`,
            );
            this.rollbackToRound(round - 1);
        }

        const physicsEntities = store.entities.filter(
            (entity) => entity.physics !== undefined,
        );

        // Do physics manipulation (add bodies, apply forces, etc)
        for (let i = 0; i < physicsEntities.length; i++) {
            const entity = physicsEntities[i];

            let rigidBody: RigidBody | undefined = undefined;

            if (entity.physics!.rigidBody.handle) {
                rigidBody = this.world.getRigidBody(
                    entity.physics!.rigidBody.handle.id,
                );
            }

            if (entity.physics!.rigidBody.kind === RigidBodyKind.None) {
                if (rigidBody) {
                    // Destroy bodies that are no longer needed
                    this.world.removeRigidBody(rigidBody);
                    entity.physics!.rigidBody.handle = undefined;
                    console.log(`Removing rigid body for entity: ${entity.id}`);
                }

                continue;
            }

            // Create rigid body

            if (!rigidBody) {
                const rigidBodyDesc = this.getRigidBodyDesc(
                    entity.physics!.rigidBody.kind,
                );

                rigidBodyDesc.setTranslation(
                    entity.position.x,
                    entity.position.y,
                );

                // Continuous Collision Detection (CCD) is used to make sure that fast-moving objects don't miss any contacts (a problem usually called tunneling).
                rigidBodyDesc.setCcdEnabled(true);

                rigidBody = this.world.createRigidBody(rigidBodyDesc);

                // Create a cuboid collider attached to the dynamic rigidBody.
                const colliderDesc = RAPIER.ColliderDesc.cuboid(
                    entity.physics!.rigidBody.collider.size.x * 0.5, // half size to match render size
                    entity.physics!.rigidBody.collider.size.y * 0.5, // half size to match render size
                );

                if (entity.physics!.rigidBody.collider.isSensor) {
                    colliderDesc.setActiveEvents(
                        RAPIER.ActiveEvents.COLLISION_EVENTS,
                    );
                    // colliderDesc.setActiveCollisionTypes(
                    //     RAPIER.ActiveCollisionTypes.DEFAULT |
                    //         RAPIER.ActiveCollisionTypes.DYNAMIC_KINEMATIC,
                    // );
                }

                const collider = this.world.createCollider(
                    colliderDesc,
                    rigidBody,
                );
                collider.setSensor(entity.physics!.rigidBody.collider.isSensor);

                entity.physics!.rigidBody.handle = { id: rigidBody.handle };
                if (entity.isShip) {
                    console.log(
                        `Creating rigid body for ship: ${entity.id} handle: ${entity.physics!.rigidBody.handle.id} round: ${round}`,
                    );
                } else {
                    console.log(
                        `Creating rigid body for map/bullet: ${entity.id} handle: ${entity.physics!.rigidBody.handle.id} round: ${round}`,
                    );
                }
            }
        }

        // Update the store with the new positions and rotations
        for (let s = 0; s < STEPS_PER_ROUND; s++) {
            for (let i = 0; i < physicsEntities.length; i++) {
                const entity = physicsEntities[i];

                if (entity.physics!.rigidBody.kind === RigidBodyKind.None) {
                    continue;
                }

                if (!entity.physics!.rigidBody.handle) {
                    console.error(
                        'RigidBody handle not found for entity',
                        entity.id,
                    );
                    continue;
                }

                const rigidBody = this.world.getRigidBody(
                    entity.physics!.rigidBody.handle.id,
                );
                if (!rigidBody) {
                    console.error(
                        'RigidBody not found for handle:',
                        entity.physics!.rigidBody.handle.id,
                    );
                    continue;
                }

                // Directly set velocity of kinematic bodies
                if (
                    entity.physics!.rigidBody.kind ===
                    RigidBodyKind.KinematicVelocity
                ) {
                    // set the velocity
                    rigidBody.setLinvel(
                        {
                            x: entity.velocity.x * (100 / STEPS_PER_ROUND),
                            y: entity.velocity.y * (100 / STEPS_PER_ROUND),
                        },
                        true,
                    );

                    // set rotation
                    rigidBody.setRotation(entity.rotation, true);
                }

                // Apply forces to dynamic bodies
                if (entity.physics!.rigidBody.kind === RigidBodyKind.Dynamic) {
                    // Apply forces
                    const force = {
                        x: entity.force.x * (1000 / STEPS_PER_ROUND),
                        y: entity.force.y * (1000 / STEPS_PER_ROUND),
                    };
                    // rigidBody.addForce(force, true);
                    rigidBody.applyImpulse(force, true);

                    // // Apply torque
                    // const torque = entity.rotation * 100;
                    // rigidBody.applyTorque(torque, true);

                    // set rotation
                    if (entity.physics!.rigidBody.lockRotations) {
                        rigidBody.lockRotations(true, true);
                        rigidBody.setRotation(entity.rotation, true);
                    } else {
                        rigidBody.lockRotations(false, true);
                    }
                }

                // Collisions
                entity.physics!.collisions = new Array<number>();
                if (entity.physics!.rigidBody.collider.checkCollisions) {
                    const collider = rigidBody.collider(0);

                    // Collisions between two non sensor colliders
                    this.world.contactPairsWith(collider, (otherCollider) => {
                        const bodyHandle = otherCollider.parent()?.handle;
                        if (bodyHandle !== undefined) {
                            const otherEntity = physicsEntities.find(
                                (e) =>
                                    e.physics!.rigidBody.handle?.id ===
                                    bodyHandle,
                            );
                            if (entity.isShip) {
                                console.log(
                                    `Ship contact: ${entity?.id} between ${rigidBody.handle} and ${bodyHandle}`,
                                );
                            }
                            if (otherEntity) {
                                entity.physics!.collisions!.push(
                                    otherEntity.id,
                                );
                            }
                        }
                    });

                    // Collisions between sensor and non sensor colliders
                    this.world.intersectionPairsWith(
                        collider,
                        (otherCollider) => {
                            const bodyHandle = otherCollider.parent()?.handle;
                            if (bodyHandle !== undefined) {
                                const otherEntity = physicsEntities.find(
                                    (e) =>
                                        e.physics!.rigidBody.handle?.id ===
                                        bodyHandle,
                                );
                                if (entity.isShip) {
                                    console.log(
                                        `Ship intersected: ${entity?.id} between ${rigidBody.handle} and ${bodyHandle}`,
                                    );
                                }
                                if (otherEntity) {
                                    entity.physics!.collisions!.push(
                                        otherEntity.id,
                                    );
                                }
                            }
                        },
                    );
                }

                // Set the position on the store
                const position = rigidBody.translation();
                entity.position.x = position.x;
                entity.position.y = position.y;

                const rotation = rigidBody.rotation();
                entity.rotation = rotation;

                const velocity = rigidBody.linvel();
                entity.velocity.x = velocity.x * 0.01;
                entity.velocity.y = velocity.y * 0.01;
            }

            this.world.step();
        }

        this.snapshots.set(round, this.world.takeSnapshot());
        this.lastRound = round;
    }
}
