import { Store } from '../runtime';

export function moveSystem(store: Store) {
    const players = store.entities.filter((entity) => entity.isPlayer);
    const ships = store.entities.filter((entity) => entity.isShip);

    const accelSpeed = 0.3;
    const rotationSpeed = Math.PI / 10;

    ships.forEach((square) => {
        players.forEach((player) => {
            if (square.owner === player.playerId) {
                let accel = 0;
                if (player.actions.forward) {
                    accel += accelSpeed;
                } else if (player.actions.back) {
                    accel -= accelSpeed;
                }
                square.rollAngle = 0;
                if (player.actions.left) {
                    square.rotation += rotationSpeed;
                    square.rollAngle = -0.785398; // 45 degrees in radians
                } else if (player.actions.right) {
                    square.rotation -= rotationSpeed;
                    square.rollAngle = 0.785398;
                }

                square.velocity.x += Math.cos(square.rotation) * accel;
                square.velocity.y += Math.sin(square.rotation) * accel;
            }
        });
    });
}
