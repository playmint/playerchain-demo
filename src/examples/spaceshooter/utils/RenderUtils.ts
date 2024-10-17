import { useFrame } from '@react-three/fiber';
import { MutableRefObject, useRef } from 'react';
import { MathUtils, Object3D, Vector3 } from 'three';
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
    __visible?: number;
};

export enum InterpolateMethod {
    Linear,
    ExpDecay,
}

export enum InterpolateSpeed {
    Snap = -1,
    Fastest = 9.8,
    Quick = 5,
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
    method: InterpolateMethod = InterpolateMethod.ExpDecay,
) {
    if (speed === InterpolateSpeed.Snap) {
        return b;
    }
    if (speed === undefined) {
        speed = InterpolateSpeed.Quick;
    }
    if (Math.abs(a - b) < 0.001) {
        return b;
    }
    switch (method) {
        case InterpolateMethod.Linear:
            return MathUtils.lerp(a, b, speed * deltaTime);
        case InterpolateMethod.ExpDecay:
            return b + (a - b) * Math.exp(-speed * deltaTime);
    }
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
    method?: InterpolateMethod,
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
        method,
    );
    obj.position.y = interpolate(
        obj.position.y,
        world.components.position.data.y[eid],
        deltaTime,
        speed,
        method,
    );
    obj.position.z = interpolate(
        obj.position.z,
        world.components.position.data.z[eid],
        deltaTime,
        speed,
        method,
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
    delay: number, // frames
) {
    const isActive = world.components.entity.data.active[eid];
    if (isActive && !obj.visible) {
        if (typeof obj.__visible !== 'number') {
            obj.__visible = -delay;
        }
        obj.__visible++;
        if (obj.__visible >= 1) {
            obj.visible = true;
            obj.__visible = -delay;
        }
    } else if (!isActive && obj.visible) {
        obj.visible = false;
        obj.__visible = -delay;
    }
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
        console.log('loading particle effect');
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
