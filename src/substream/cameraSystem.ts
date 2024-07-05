import { Store } from '../runtime';

export function substreamCameraSystem(
    updateStore: Store,
    renderStore: Store,
    peerId: Uint8Array,
) {
    //console.log('entities: ', store.entities);
    const ship = updateStore.entities.find(
        (entity) => entity.isSquare && entity.owner === peerId,
    );
    let camera = renderStore.entities
        .filter((entity) => entity.isCamera)
        .find(() => true);

    if (!ship) return;

    if (!camera) {
        camera = renderStore.add();
        camera.isCamera = true;
        console.log('added camera');
    }

    camera.position.x = ship.position.x;
    camera.position.y = ship.position.y;
    camera.position.z = 100;
}
