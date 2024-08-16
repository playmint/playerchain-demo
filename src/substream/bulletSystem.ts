import { Store } from '../runtime';

enum GeometryKind {
    Box,
    Sphere,
}

const BULLET_SIZE = 0.5;

export function bulletSystem(store: Store) {
    for (let i = 0; i < 1; i++) {
        const bullet = store.add();
        bullet.isBullet = true;
        bullet.position.x = Math.floor(Math.random() * 100);
        bullet.position.y = Math.floor(Math.random() * 100);

        bullet.renderer = {
            visible: true,
            color: 0xd3a1ff,
            geometry: GeometryKind.Sphere,
            size: { x: BULLET_SIZE, y: BULLET_SIZE },
        };

        // bullet.physics = {
        //     rigidBody: {
        //         kind: RigidBodyKind.KinematicVelocity,
        //         collider: {
        //             isSensor: true,
        //             size: { x: BULLET_SIZE, y: BULLET_SIZE },
        //             checkCollisions: false,
        //         },
        //         lockRotations: true,
        //     },
        //     collisions: [],
        // };
    }
}
