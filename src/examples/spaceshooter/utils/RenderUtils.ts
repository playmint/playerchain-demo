import { MathUtils, Object3D } from 'three';
import { EntityId, World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';

// vite is messing with the paths of glb assets
export function assetPath(s: string): string {
    return `${location.origin}${s}`;
}
function expDecay(a: number, b: number, decay: number, deltaTime: number) {
    return b + (a - b) * Math.exp(-decay * deltaTime);
}

const lerpyness = 0.8;
export function lerpToEntity(
    o: Object3D,
    world: World<ShooterSchema>,
    eid: EntityId,
) {
    const obj: Object3D & { __generation?: number } = o;
    if (world.components.entity.data.generation[eid] !== obj.__generation) {
        // don't lerp if generation changed
        obj.position.x = world.components.position.data.x[eid];
        obj.position.y = world.components.position.data.y[eid];
        obj.position.z = world.components.position.data.z[eid];
        // obj.rotation.x = world.components.rotation.data.x[eid];
        // obj.rotation.y = world.components.rotation.data.y[eid];
        // obj.rotation.z = world.components.rotation.data.z[eid];
    } else {
        obj.rotation.x = MathUtils.lerp(
            obj.rotation.x,
            world.components.rotation.data.x[eid],
            lerpyness,
        );
        obj.rotation.y = MathUtils.lerp(
            obj.rotation.y,
            world.components.rotation.data.y[eid],
            lerpyness,
        );
        obj.rotation.z = MathUtils.lerp(
            obj.rotation.z,
            world.components.rotation.data.z[eid],
            lerpyness,
        );
        obj.position.x = MathUtils.lerp(
            obj.position.x,
            world.components.position.data.x[eid],
            lerpyness,
        );
        obj.position.y = MathUtils.lerp(
            obj.position.y,
            world.components.position.data.y[eid],
            lerpyness,
        );
        obj.position.z = MathUtils.lerp(
            obj.position.z,
            world.components.position.data.z[eid],
            lerpyness,
        );
    }
    obj.__generation = world.components.entity.data.generation[eid];
    obj.visible = !!world.components.entity.data.active[eid];
}
