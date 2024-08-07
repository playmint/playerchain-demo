import { Store } from '../runtime';

const ROUNDS_PER_SHOT = 2;

export function moveSystem(store: Store, roundNum: number) {
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

                if (
                    player.actions.fire &&
                    square.lastShotRound + ROUNDS_PER_SHOT < roundNum
                ) {
                    square.lastShotRound = roundNum;
                    square.shootBullet = true;
                } else {
                    square.shootBullet = false;
                }

                square.velocity.x += Math.cos(square.rotation) * accel;
                square.velocity.y += Math.sin(square.rotation) * accel;
                square.force.x = Math.cos(square.rotation) * accel;
                square.force.y = Math.sin(square.rotation) * accel;
            }
        });
    });
}
