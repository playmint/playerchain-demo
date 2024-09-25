import { Clone, Html, PositionalAudio, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useRef } from 'react';
import {
    Color,
    Group,
    Mesh,
    Object3DEventMap,
    PositionalAudio as PositionalAudioImpl,
    Vector3,
} from 'three';
import { getPlayerColor } from '../../../gui/fixtures/player-colors';
import { Input, Tags, hasInput } from '../../spaceshooter';
import sfxDestroy from '../assets/Destroy.mp3?url';
import sfxThrust from '../assets/Thrust_Loop.mp3?url';
import shipGLTF from '../assets/ship.glb?url';
import fxShootData from '../effects/FXShoot';
import fxThrusterData from '../effects/FXThruster';
import {
    EntityObject3D,
    InterpolateSpeed,
    assetPath,
    interpolate,
    interpolateEntityPosition,
    interpolateEntityRotation,
    interpolateEntityVisibility,
    updateEntityGeneration,
    useParticleEffect,
} from '../utils/RenderUtils';
import { PlayersRef, WorldRef } from './ShooterRenderer';
import { ExplodeFX, ExplodeFXHandle } from '../effects/FXExplodeQuarks';
import { SpawnFX, SpawnFXHandle } from '../effects/FXRespawnQuarks';
import { SparksFX, SparksFXHandle } from '../effects/FXSparksQuarks';

export default memo(function ShipEntity({
    eid,
    worldRef,
    playersRef,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
}) {
    const getShipOwner = () =>
        Array.from(worldRef.current.players.entries()).find(
            ([_id, p]) => p.ship === eid,
        ) || [undefined, undefined];
    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);
    const explosionRef = useRef<ExplodeFXHandle>(null!);
    const explosionSfxRef = useRef<PositionalAudioImpl>(null!);
    const thrustSfxRef = useRef<PositionalAudioImpl>(null!);
    const respawnRef = useRef<SpawnFXHandle>(null!);
    const shootRef = useParticleEffect(shipRef, fxShootData, [0, 0, 0]);
    const sparksRef = useRef<SparksFXHandle>(null!);
    const labelRef = useRef<HTMLDivElement>(null!);
    const prevHealthRef = useRef<number | null>(null);

    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        const world = worldRef.current;
        const players = playersRef.current;
        const [peerId, player] = getShipOwner();
        const playerIdx = players.findIndex((p) => p.id === peerId);
        const color = new Color(peerId ? getPlayerColor(playerIdx) : '#ffffff');
        const group = groupRef.current;
        const ship = shipRef.current as EntityObject3D;
        if (!player) {
            return;
        }
        // color the ship
        ship.children[0].children[0].traverse((child) => {
            if (child instanceof Mesh) {
                child.material.color = color;
            }
        });
        // hide ship if not active (not the whole group, just the ship)
        interpolateEntityVisibility(ship, world, eid, 400);
        // lerp ship
        interpolateEntityPosition(
            group,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Quick * 2,
        );
        interpolateEntityRotation(
            ship,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Quick,
        );
        // apply ship roll if we are turning
        const shipInner = ship.children[0].children[0];
        const roll = hasInput(player.input, Input.Left)
            ? -0.4
            : hasInput(player.input, Input.Right)
              ? 0.4
              : 0;
        shipInner.rotation.x = interpolate(
            shipInner.rotation.x,
            roll,
            deltaTime,
            InterpolateSpeed.Smooth,
        );
        // flash ship if we lost health
        const health = world.components.stats.data.health[eid];
        if (
            prevHealthRef.current === null ||
            world.components.entity.data.generation[eid] !== ship.__generation
        ) {
            prevHealthRef.current = health;
        }
        if (health > 0) {
            if (health < prevHealthRef.current) {
                // took damage
                ship.children[0].children[0].traverse((child) => {
                    if (child instanceof Mesh) {
                        child.material.emissive = new Color(0.5, 0.5, 0.5);
                    }
                });
            }
        }
        // fade ship color back to normal
        ship.children[0].children[0].traverse((child) => {
            if (child instanceof Mesh) {
                if (child.material.emissive.r > 0) {
                    child.material.emissive = new Color(
                        Math.max(child.material.emissive.r - deltaTime, 0),
                        Math.max(child.material.emissive.g - deltaTime, 0),
                        Math.max(child.material.emissive.b - deltaTime, 0),
                    );
                }
            }
        });

        // create wall sparks
        const hit = world.components.collider.data.hasCollided[eid];
        if (hit && !world.hasTag(world.components.collider.data.collisionEntity[eid], Tags.IsShip) &&
            !world.hasTag(world.components.collider.data.collisionEntity[eid], Tags.IsBullet)) {
            if (sparksRef.current) {
                const pos = new Vector3(
                    world.components.collider.data.collisionPointX[eid],
                    world.components.collider.data.collisionPointY[eid],
                    0,
                );
                sparksRef.current.triggerSparks(pos);
                // We should maybe have a sound for this too
            }
        }

        // update thruster effect
        if (thrustRef.current) {
            const thrusting =
                world.components.entity.data.active[eid] &&
                hasInput(player.input, Input.Forward);
            const pos = new Vector3(-3.5, 0, 0);
            thrustRef.current.particleSystems.forEach((particleObj) => {
                if (thrusting) {
                    particleObj.start();
                    if (!thrustSfxRef.current.isPlaying) {
                        thrustSfxRef.current.play();
                    }
                    // const rotation = parentObj.children[0].rotation.z;
                    particleObj.setRotation(ship.rotation.z);
                    // Calculate the position based on the angle and offset
                    particleObj.position.x =
                        pos.x * Math.cos(shipRef.current.rotation.z) -
                        pos.y * Math.sin(shipRef.current.rotation.z);
                    particleObj.position.y =
                        pos.x * Math.sin(shipRef.current.rotation.z) +
                        pos.y * Math.cos(shipRef.current.rotation.z);
                } else {
                    particleObj.stop();
                    thrustSfxRef.current.stop();
                }
                particleObj.update(deltaTime / 2);
            });
        }

        // run explosion effect (if we died)
        if (explosionRef.current) {
            const exploding = prevHealthRef.current > 0 && health <= 0;
            if (exploding){
                const pos = new Vector3(0, 0, 0);
                if(explosionRef.current){
                    explosionRef.current.triggerExplosion(pos, shipRef.current);
                }
                // make noise too
                if (!explosionSfxRef.current.isPlaying) {
                    explosionSfxRef.current.play();
                }
            }
        }

        // run respawn effect if generation changed
        if (respawnRef.current) {
            const respawned =
            world.components.entity.data.generation[eid] !==
            ship.__generation;
            if (
                respawned &&
                world.components.entity.data.active[eid]
            ) {
                const pos = new Vector3(0, 0, 0);
                if(respawnRef.current){
                    respawnRef.current.triggerSpawn(pos, shipRef.current);
                }
            }
        }

        // run shoot vfx if shooting
        if (shootRef.current) {
            const shooting = hasInput(player.input, Input.Fire);
            shootRef.current.particleSystems.forEach((particleObj) => {
                particleObj.update(deltaTime);
                if (shooting && !particleObj.isPlaying) {
                    const pos = new Vector3(4.2, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                }
            });
        }

        // show hide label
        // TODO: wrap Html in a Group so can hide with three... this is messy
        if (
            labelRef.current &&
            world.components.entity.data.active[eid] &&
            labelRef.current.style.display !== 'block'
        ) {
            labelRef.current.style.display = 'block';
        } else if (
            !world.components.entity.data.active[eid] &&
            labelRef.current.style.display !== 'none'
        ) {
            labelRef.current.style.display = 'none';
        }
        if (labelRef.current) {
            labelRef.current.innerHTML =
                players[playerIdx]?.name || peerId.slice(0, 8);
        }
        // mark prev states
        updateEntityGeneration(group, world, eid);
        updateEntityGeneration(ship, world, eid);
        prevHealthRef.current = health;
    });

    return (
        <group ref={groupRef}>
            <ExplodeFX ref={explosionRef} />
            <SpawnFX ref={respawnRef} />
            <SparksFX ref={sparksRef} />
            <Clone ref={shipRef} object={gltf.scene} scale={1} deep={true} />
            <Html
                zIndexRange={[0, 100]}
                ref={labelRef}
                style={{
                    fontSize: 11,
                    pointerEvents: 'none',
                    userSelect: 'none',
                }}
                position={[3, 5, 0]}
            ></Html>
            <PositionalAudio
                ref={explosionSfxRef}
                url={assetPath(sfxDestroy)}
                distance={500}
                loop={false}
            />
            <PositionalAudio
                ref={thrustSfxRef}
                url={assetPath(sfxThrust)}
                distance={500}
                loop={false}
            />
        </group>
    );
});
