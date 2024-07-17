import { RigidBodyKind, Store } from '../runtime';

export function collisionSystem(store: Store) {
    const squares = store.entities.filter(
        (entity) => entity.isShip && entity.renderer?.visible,
    );

    squares.forEach((square) => {
        if (!square.physics) {
            return;
        }
        if (square.physics.collisions.length > 0) {
            // console.log(
            //     `collision detected e1: ${square.id} e2: ${square.physics.collisions[0]}`,
            // );

            const entity = store.entities.find(
                (e) => e.id === square.physics!.collisions[0],
            );
            if (entity?.isBullet) {
                square.hits++;
                console.log(`ship: ${square.id} hits: ${square.hits}`);

                if (entity.renderer) {
                    entity.renderer.visible = false;
                }
                if (entity.physics) {
                    entity.physics.rigidBody.kind = RigidBodyKind.None;
                }

                if (square.hits >= 10) {
                    square.renderer!.visible = false;
                    square.physics.rigidBody.kind = RigidBodyKind.None;
                }
            }
        }
    });
}
