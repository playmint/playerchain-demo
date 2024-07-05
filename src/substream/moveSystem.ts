import { Store } from '../runtime';

export function moveSystem(store: Store) {
    const players = store.entities.filter((entity) => entity.isPlayer);
    const squares = store.entities.filter((entity) => entity.isSquare);

    const accelSpeed = 0.5;
    const rotationSpeed = (Math.PI / 180) * 10;

    squares.forEach((square) => {
        players.forEach((player) => {
            if (square.owner === player.playerId) {
                let accel = 0;
                if (player.actions.forward) {
                    accel += accelSpeed;
                } else if (player.actions.back) {
                    accel -= accelSpeed;
                }
                if (player.actions.left) {
                    square.rotation += rotationSpeed;
                } else if (player.actions.right) {
                    square.rotation -= rotationSpeed;
                }

                square.velocity.x += Math.cos(square.rotation) * accel;
                square.velocity.y += Math.sin(square.rotation) * accel;
            }
        });
    });
}
