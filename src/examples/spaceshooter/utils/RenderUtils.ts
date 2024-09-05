import { useFrame } from '@react-three/fiber';
import { MutableRefObject, useRef } from 'react';
import { Object3D, Vector3 } from 'three';
import { useAsyncEffect } from '../../../gui/hooks/use-async';
import { EntityId, World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import { ParticleEffect, ParticleEffectData } from '../effects/ParticleSystem';

// use when vite is messing with the paths of assets
export function assetPath(s: string): string {
    return `${location.origin}${s}`;
}

export type EntityObject3D = Object3D & {
    __generation?: number;
};

export enum InterpolateSpeed {
    Snap = -1,
    Fastest = 10,
    Quick = 9,
    Smooth = 2.5,
    Slow = 0.5,
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

// like lerp, but framerate independent
export function interpolate(
    a: number,
    b: number,
    deltaTime: number,
    speed?: InterpolateSpeed,
) {
    if (speed === InterpolateSpeed.Snap) {
        return b;
    }
    if (speed === undefined) {
        speed = InterpolateSpeed.Quick;
    }
    return b + (a - b) * Math.exp(-speed * deltaTime);
}

// export function interpolate3(a: Vec3, b: Vec3, speed: InterpolateSpeed, deltaTime: number) {
//     a.x = interpolate(a.x, b.x, speed, deltaTime);
//     a.y = interpolate(a.y, b.y, speed, deltaTime);
//     a.z = interpolate(a.z, b.z, speed, deltaTime);
// }

export function interpolateEntityPosition(
    obj: EntityObject3D,
    world: World<ShooterSchema>,
    eid: EntityId,
    deltaTime: number,
    decay?: InterpolateSpeed,
) {
    const speed =
        world.components.entity.data.generation[eid] !== obj.__generation
            ? InterpolateSpeed.Snap // never interpolate generation changes
            : (decay ?? InterpolateSpeed.Quick);
    // console.log('speed', speed);
    obj.position.x = interpolate(
        obj.position.x,
        world.components.position.data.x[eid],
        deltaTime,
        speed,
    );
    obj.position.y = interpolate(
        obj.position.y,
        world.components.position.data.y[eid],
        deltaTime,
        speed,
    );
    obj.position.z = interpolate(
        obj.position.z,
        world.components.position.data.z[eid],
        deltaTime,
        speed,
    );
}

export function interpolateEntityRotation(
    obj: EntityObject3D,
    world: World<ShooterSchema>,
    eid: EntityId,
    deltaTime: number,
    decay?: InterpolateSpeed,
) {
    const speed =
        world.components.entity.data.generation[eid] !== obj.__generation
            ? InterpolateSpeed.Snap // never interpolate generation changes
            : (decay ?? InterpolateSpeed.Quick);
    // console.log('speed', speed);
    obj.rotation.x = interpolate(
        obj.rotation.x,
        world.components.rotation.data.x[eid],
        deltaTime,
        speed,
    );
    obj.rotation.y = interpolate(
        obj.rotation.y,
        world.components.rotation.data.y[eid],
        deltaTime,
        speed,
    );
    obj.rotation.z = interpolate(
        obj.rotation.z,
        world.components.rotation.data.z[eid],
        deltaTime,
        speed,
    );
}

export function interpolateEntityVisibility(
    obj: EntityObject3D,
    world: World<ShooterSchema>,
    eid: EntityId,
    _deltaTime?: number,
    _decay?: InterpolateSpeed,
) {
    obj.visible = !!world.components.entity.data.active[eid];
}

export function updateEntityGeneration(
    obj: EntityObject3D,
    world: World<ShooterSchema>,
    eid: EntityId,
) {
    obj.__generation = world.components.entity.data.generation[eid];
}

// places a particle effect at the given parent + position
// returns a ref that will be null until the asset is loaded
export function useParticleEffect(
    parent: MutableRefObject<Object3D>,
    config: any, // yuk any
    position: [number, number, number],
) {
    const asset = useRef<ParticleEffectData | null>(null);
    const effect = useRef<ParticleEffect | null>(null);
    useAsyncEffect(async () => {
        const data = new ParticleEffectData(config);
        await data.prepare();
        asset.current = data;
    }, []);
    useFrame(() => {
        if (!asset.current) {
            return;
        }
        if (!parent) {
            return;
        }
        if (!effect.current) {
            effect.current = new ParticleEffect(
                'ShipThrusterFX',
                parent.current,
                new Vector3(...position),
                asset.current,
            );
        }
    });
    return effect;
}
