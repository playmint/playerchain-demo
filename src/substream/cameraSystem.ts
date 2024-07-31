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
    const playerShip = updateStore.entities.find(
        (entity) => entity.isShip && entity.owner === peerId,
    );
    let camera = renderStore.entities
        .filter((entity) => entity.isCamera)
        .find(() => true);

    if (!playerShip) {
        return;
    }

    if (!camera) {
        camera = renderStore.add();
        camera.isCamera = true;
        console.log('added camera');
    }

    const lookAhead = 1; //  Set to 1 to center player in screen. >1 to look ahead. <1 to lag behind.

    camera.position.x =
        playerShip.position.x + playerShip.velocity.x * lookAhead;
    camera.position.y =
        playerShip.position.y + playerShip.velocity.y * lookAhead;

    const vec = new Vector2(playerShip.velocity.x, playerShip.velocity.y);
    camera.position.z = expDecay(
        camera.position.z,
        Math.min(100 + vec.length() * 2, 130),
        2,
        deltaTime,
    );
}
