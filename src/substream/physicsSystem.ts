import { Store } from '../runtime';

export function physicsSystem(store: Store) {
    const squares = store.entities.filter((entity) => entity.isSquare);

    squares.forEach((square) => {
        square.position.x += square.velocity.x;
        square.position.y += square.velocity.y;
    });
}
