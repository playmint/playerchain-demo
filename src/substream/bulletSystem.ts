import { Store } from '../runtime';

export function bulletSystem(store: Store) {
    const players = store.entities.filter((entity) => entity.isPlayer);
    const squares = store.entities.filter((entity) => entity.isSquare);

    squares.forEach((square) => {
        players.forEach((player) => {
            if (square.owner === player.playerId) {
                if (player.actions.fire) {
                    // spawn a bullet entity
                    const bullet = store.add();
                    bullet.isBullet = true;
                    bullet.position = { ...square.position };
                    bullet.position.x += Math.cos(square.rotation) * 3;
                    bullet.position.y += Math.sin(square.rotation) * 3;
                    bullet.rotation = square.rotation;
                    bullet.owner = player.playerId;

                    // TODO: The velocity should be ship velocity + bullet velocity
                }
            }
        });
    });
}
