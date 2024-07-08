import { Vector2 } from 'three';
import { Store } from '../runtime';

function expDecay(a: number, b: number, decay: number, deltaTime: number) {
    return b + (a - b) * Math.exp(-decay * deltaTime);
}

export function substreamCameraSystem(
    updateStore: Store,
    renderStore: Store,
    peerId: Uint8Array,
    deltaTime: number,
) {
    //console.log('entities: ', store.entities);
    const ship = updateStore.entities.find(
        (entity) => entity.isSquare && entity.owner === peerId,
    );
    let camera = renderStore.entities
        .filter((entity) => entity.isCamera)
        .find(() => true);

    if (!ship) {
        return;
    }

    if (!camera) {
        camera = renderStore.add();
        camera.isCamera = true;
        console.log('added camera');
    }

    camera.position.x = ship.position.x;
    camera.position.y = ship.position.y;

    const vec = new Vector2(ship.velocity.x, ship.velocity.y);
    camera.position.z = expDecay(
        camera.position.z,
        Math.min(100 + vec.length() * 2, 130),
        2,
        deltaTime,
    );
}
