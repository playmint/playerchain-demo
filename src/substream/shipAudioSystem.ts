import { Store } from '../runtime';

export function shipAudioSystem(store: Store) {
    const squares = store.entities.filter((entity) => entity.isShip);

    squares.forEach((square) => {
        square.audioPitch =
            1 +
            Math.sqrt(
                square.velocity.x * square.velocity.x +
                    square.velocity.y * square.velocity.y,
            ) /
                10;
    });
}
