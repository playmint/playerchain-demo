import { Clone, PositionalAudio, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import {
    AdditiveBlending,
    Group,
    Mesh,
    Object3DEventMap,
    PositionalAudio as PositionalAudioImpl,
    Vector3,
} from 'three';
import sfxHit from '../assets/Hit.mp3?url';
import sfxShot from '../assets/Shot.mp3?url';
import shipGLTF from '../assets/bullet.glb?url';
import fxPopData from '../effects/FXShoot';
import { BULLET_LIFETIME } from '../systems/bulletSystem';
import {
    EntityObject3D,
    InterpolateMethod,
    InterpolateSpeed,
    assetPath,
    interpolateEntityPosition,
    interpolateEntityRotation,
    interpolateEntityVisibility,
    updateEntityGeneration,
    useParticleEffect,
} from '../utils/RenderUtils';
import { WorldRef } from './ShooterRenderer';

export default memo(function BulletEntity({
    eid,
    worldRef,
}: {
    eid: number;
    worldRef: WorldRef;
}) {
    const groupRef = useRef<Group>(null!);
    const bulletRef = useRef<Group<Object3DEventMap>>(null!);
    const popRef = useParticleEffect(groupRef, fxPopData, [0, 0, 0]);
    const shotSfxRef = useRef<PositionalAudioImpl>(null!);
    const hitSfxRef = useRef<PositionalAudioImpl>(null!);
    const gltf = useGLTF(assetPath(shipGLTF));
    const model = useMemo(() => {
        gltf.scene.scale.set(1.1, 1.1, 1.1);
        gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
                child.material.blending = AdditiveBlending;
            }
        });
        return gltf.scene;
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        const world = worldRef.current;
        const group = groupRef.current as EntityObject3D;
        const bullet = bulletRef.current;
        // during the first few frames of bullet shooting, the bullet is not
        // alighed with the interpolated position of the ship so we hide it for
        // a bit and snap position to make it look bit better
        const isNewlySpawned =
            world.components.stats.data.health[eid] > BULLET_LIFETIME - 1;
        if (isNewlySpawned) {
            bullet.visible = false;
        } else {
            interpolateEntityVisibility(bullet, world, eid);
        }
        // track bullet
        interpolateEntityPosition(
            group,
            world,
            eid,
            deltaTime,
            isNewlySpawned
                ? InterpolateSpeed.Snap
                : InterpolateSpeed.Fastest * 2,
            InterpolateMethod.Linear,
        );
        interpolateEntityRotation(
            group,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Snap,
        );

        // run the pop effect on death
        if (popRef.current) {
            const hit = world.components.collider.data.hasCollided[eid];
            popRef.current.particleSystems.forEach((particleObj) => {
                particleObj.update(deltaTime);
                if (hit && !particleObj.isPlaying) {
                    const pos = new Vector3(0, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                    // make noise too
                    if (!hitSfxRef.current.isPlaying) {
                        hitSfxRef.current.play();
                    }
                }
            });
        }

        // play the shot sfx on bullet spawn
        if (
            group.__generation !== undefined &&
            group.__generation !==
                world.components.entity.data.generation[eid] &&
            !shotSfxRef.current.isPlaying
        ) {
            // audioRef.current.setVolume(0.5);
            shotSfxRef.current.play();
        }

        // keep generation in sync
        updateEntityGeneration(group, world, eid);
    });

    return (
        <group ref={groupRef}>
            <Clone ref={bulletRef} object={model} scale={0.5} />
            <PositionalAudio
                ref={shotSfxRef}
                url={assetPath(sfxShot)}
                distance={500}
                loop={false}
            />
            <PositionalAudio
                ref={hitSfxRef}
                url={assetPath(sfxHit)}
                distance={500}
                loop={false}
            />
        </group>
    );
});
