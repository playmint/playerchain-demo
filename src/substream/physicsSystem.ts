import { Store } from '../runtime';

export function physicsSystem(store: Store) {
    const ships = store.entities.filter((entity) => entity.isShip);

    ships.forEach((ship) => {
        ship.prevPosition.x = ship.position.x;
        ship.prevPosition.y = ship.position.y;

        ship.position.x += ship.velocity.x;
        ship.position.y += ship.velocity.y;
    });
}
