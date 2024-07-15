import { Store } from '../runtime';

export function moveSystem(store: Store) {
    const players = store.entities.filter((entity) => entity.isPlayer);
    const squares = store.entities.filter((entity) => entity.isSquare);

    const accelSpeed = 8; //0.3;
    const rotationSpeed = Math.PI / 10;

    squares.forEach((square) => {
        players.forEach((player) => {
            if (square.owner === player.playerId) {
                if (player.actions.forward) {
                    square.accel = accelSpeed;
                } else if (player.actions.back) {
                    square.accel = -accelSpeed;
                } else {
                    square.accel = 0;
                }
                if (player.actions.left) {
                    square.torqueImpulse = 5;
                } else if (player.actions.right) {
                    square.torqueImpulse = -5;
                } else {
                    square.torqueImpulse = 0;
                }

                // square.velocity.x += Math.cos(square.rotation) * accel;
                // square.velocity.y += Math.sin(square.rotation) * accel;
            }
        });
    });
}
