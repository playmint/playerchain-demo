import RAPIER, { RigidBody, World } from '@dimforge/rapier2d-compat';
import { Store } from '../runtime';

const NUM_ROLLBACK_STATES = 20;

export class RealPhysicsSystem {
    world?: World;
    rigidBodyHandles = new Map<number, number>();
    snapshots = new Map<number, Uint8Array>();

    constructor() {
        RAPIER.init().then(() => {
            console.log('RAPIER initialized');

            // Use the RAPIER module here.
            const gravity = { x: 0.0, y: 0 };
            this.world = new RAPIER.World(gravity);
        });
    }

    public rollbackToRound(round: number) {
        const snapshot = this.snapshots.get(round);
        if (!snapshot) {
            console.error('Snapshot not found for round', round);
            return;
        }

        // console.log('Physics: Rolling back to round', round);
        this.world = World.restoreSnapshot(snapshot);
    }

    public update(store: Store, round: number) {
        if (!this.world) {
            return;
        }

        // Do physics manipulation
        for (let i = 0; i < store.entities.length; i++) {
            // only care about squares
            const entity = store.entities[i];
            if (!entity.isSquare) {
                continue;
            }

            const rigidBodyHandle = this.rigidBodyHandles.get(entity.id);
            let rigidBody: RigidBody | undefined = undefined;

            if (rigidBodyHandle !== undefined) {
                // NOTE: it is possible to have a handle pointing to a non-existent rigid body if we rolled back to a state before it was created
                rigidBody = this.world.getRigidBody(rigidBodyHandle);
            }

            if (!rigidBody) {
                // Create a dynamic rigid-body.
                // TODO: Rigid body to be entity
                console.log(
                    `Creating rigid body for entity id: ${entity.id} at idx: ${i}`,
                );
                const rigidBodyDesc =
                    RAPIER.RigidBodyDesc.dynamic().setTranslation(
                        0.0,
                        entity.id * 10,
                    );
                rigidBody = this.world.createRigidBody(rigidBodyDesc);

                // Create a cuboid collider attached to the dynamic rigidBody.
                const colliderDesc = RAPIER.ColliderDesc.cuboid(1, 1);
                const collider = this.world.createCollider(
                    colliderDesc,
                    rigidBody,
                );

                this.rigidBodyHandles.set(entity.id, rigidBody.handle);
            }

            rigidBody.applyTorqueImpulse(entity.torqueImpulse, true);

            // NOTE: If we want to directly control rotation we have to zero the torque.
            // const rotation = rigidBody.rotation() + entity.rotationSpeed;
            // rigidBody.setRotation(rotation, true);

            if (entity.accel != 0) {
                // FIXME: Does this maintain determinism as math function exists outside of physics engine?
                const rotation = rigidBody.rotation();
                rigidBody.applyImpulse(
                    {
                        x: Math.cos(rotation) * entity.accel,
                        y: Math.sin(rotation) * entity.accel,
                    },
                    true,
                );
            }
        }

        this.world.step();
        this.snapshots.set(round, this.world.takeSnapshot());

        // Update the store with the new positions and rotations
        for (let i = 0; i < store.entities.length; i++) {
            // only care about squares
            const entity = store.entities[i];
            if (!entity.isSquare) {
                continue;
            }

            const rigidBodyHandle = this.rigidBodyHandles.get(entity.id);
            if (rigidBodyHandle == undefined) {
                console.error(
                    'RigidBody handle not found for entity',
                    entity.id,
                );
                continue;
            }

            const rigidBody = this.world.getRigidBody(rigidBodyHandle);
            if (!rigidBody) {
                console.error(
                    'RigidBody not found for handle',
                    rigidBodyHandle,
                );
                continue;
            }

            const position = rigidBody.translation();

            // Set the position on the store
            entity.position.x = position.x;
            entity.position.y = position.y;

            const rotation = rigidBody.rotation();
            entity.rotation = rotation;
        }
    }
}
