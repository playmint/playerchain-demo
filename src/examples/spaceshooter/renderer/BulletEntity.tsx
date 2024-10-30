import { Clone, PositionalAudio } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useRef, useState } from 'react';
import {
    Group,
    Object3DEventMap,
    PositionalAudio as PositionalAudioImpl,
    Vector3,
} from 'three';
import { Tags } from '../../spaceshooter';
import sfxHit from '../assets/Hit.mp3?url';
import sfxShot from '../assets/Shot.mp3?url';
import {
    ShipImpactFX,
    ShipImpactFXHandle,
} from '../effects/FXShipImpactQuarks';
import { BULLET_LIFETIME } from '../systems/bulletSystem';
import {
    EntityObject3D,
    InterpolateSpeed,
    assetPath,
    interpolateEntityPosition,
    interpolateEntityRotation,
    updateEntityGeneration,
} from '../utils/RenderUtils';
import useBulletModel from './BulletModel';
import { PlayersRef, WorldRef } from './ShooterRenderer';

export default memo(function BulletEntity({
    eid,
    worldRef,
    playersRef,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
}) {
    const [playerIndex, setPlayerIndex] = useState(0);
    const groupRef = useRef<Group>(null!);
    const bulletRef = useRef<Group<Object3DEventMap>>(null!);
    const shotSfxRef = useRef<PositionalAudioImpl>(null!);
    const hitFXRef = useRef<ShipImpactFXHandle>(null!);
    const hitSfxRef = useRef<PositionalAudioImpl>(null!);
    const model = useBulletModel(playerIndex);

    useFrame((_state, deltaTime) => {
        const world = worldRef.current;
        const group = groupRef.current as EntityObject3D;
        const bullet = bulletRef.current;
        // set the player index
        const idx = playersRef.current.findIndex(
            (p) => p.ship === world.components.entity.data.parent[eid],
        );
        if (idx !== playerIndex) {
            setPlayerIndex(idx);
        }
        // during the first few frames of bullet shooting, the bullet is not
        // alighed with the interpolated position of the ship so we hide it for
        // a bit to let the interpolation match better, it's not perfect
        const isMoving =
            !!world.components.entity.data.active[eid] &&
            world.components.stats.data.health[eid] > 0 &&
            world.components.stats.data.health[eid] < BULLET_LIFETIME - 2;

        // only show bullet when it's moving
        bullet.visible = isMoving;

        // track bullet
        interpolateEntityPosition(
            group,
            world,
            eid,
            deltaTime,
            isMoving ? InterpolateSpeed.Fastest : InterpolateSpeed.Quick,
        );
        interpolateEntityRotation(
            group,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Snap,
        );

        // run the pop effect on death
        if (hitFXRef.current) {
            const hit = world.components.collider.data.hasCollided[eid];
            if (hit && world.hasTag(hit, Tags.IsShip)) {
                const pos = new Vector3(
                    world.components.collider.data.collisionPointX[eid],
                    world.components.collider.data.collisionPointY[eid],
                    0,
                );
                hitFXRef.current.triggerShipImpact(pos);
                // make noise too
                if (!hitSfxRef.current.isPlaying) {
                    hitSfxRef.current.play();
                }
            }
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
            <ShipImpactFX ref={hitFXRef} />
            <Clone
                ref={bulletRef}
                object={model}
                scale={0.5}
                position={[0, 0, -1]}
            />
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
