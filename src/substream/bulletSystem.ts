import { GeometryKind, RigidBodyKind, Store } from '../runtime';

const BULLET_SPEED = 4;
const BULLET_SPAWN_OFFSET = 3;
const BULLET_SIZE = 0.5;

export function bulletSystem(store: Store) {
    // const players = store.entities.filter((entity) => entity.isPlayer);
    const shooters = store.entities.filter(
        (entity) => entity.isShip && entity.shootBullet,
    );

    shooters.forEach((shooter) => {
        const bullet = store.add();
        // console.log(`shot fired by entity: ${shooter.id} bullet: ${bullet.id}`);
        bullet.isBullet = true;
        bullet.position.x =
            shooter.position.x +
            Math.cos(shooter.rotation) * BULLET_SPAWN_OFFSET;
        bullet.position.y =
            shooter.position.y +
            Math.sin(shooter.rotation) * BULLET_SPAWN_OFFSET;

        // Takes into account the shooter's velocity which might be handy for slow moving projectiles like bombs
        // bullet.velocity.x =
        //     shooter.velocity.x + Math.cos(shooter.rotation) * BULLET_SPEED;
        // bullet.velocity.y =
        //     shooter.velocity.y + Math.sin(shooter.rotation) * BULLET_SPEED;

        bullet.velocity.x = Math.cos(shooter.rotation) * BULLET_SPEED;
        bullet.velocity.y = Math.sin(shooter.rotation) * BULLET_SPEED;

        bullet.renderer = {
            visible: true,
            color: 0xd3a1ff,
            geometry: GeometryKind.Sphere,
            size: { x: BULLET_SIZE, y: BULLET_SIZE },
        };

        bullet.physics = {
            rigidBody: {
                kind: RigidBodyKind.KinematicVelocity,
                collider: {
                    isSensor: true,
                    size: { x: BULLET_SIZE, y: BULLET_SIZE },
                    checkCollisions: false,
                },
                lockRotations: true,
            },
            collisions: [],
        };
    });
}
