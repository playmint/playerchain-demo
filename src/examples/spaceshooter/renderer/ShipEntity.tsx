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
import { Input, hasInput } from '../../spaceshooter';
import sfxDestroy from '../assets/Destroy.mp3?url';
import sfxThrust from '../assets/Thrust_Loop.mp3?url';
import shipGLTF from '../assets/ship.glb?url';
import fxExplodeData from '../effects/FXExplode';
import fxRespawnData from '../effects/FXRespawn';
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
import { WorldRef } from './ShooterRenderer';

export default memo(function ShipEntity({
    eid,
    worldRef,
}: {
    eid: number;
    worldRef: WorldRef;
}) {
    const getShipOwner = () =>
        Array.from(worldRef.current.players.entries()).find(
            ([_id, p]) => p.ship === eid,
        ) || [undefined, undefined];
    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);
    const explosionRef = useParticleEffect(groupRef, fxExplodeData, [0, 0, 0]);
    const explosionSfxRef = useRef<PositionalAudioImpl>(null!);
    const thrustSfxRef = useRef<PositionalAudioImpl>(null!);
    const respawnRef = useParticleEffect(groupRef, fxRespawnData, [0, 0, 0]);
    const shootRef = useParticleEffect(shipRef, fxShootData, [0, 0, 0]);
    const labelRef = useRef<HTMLDivElement>(null!);
    const prevHealthRef = useRef<number | null>(null);
    console.log('rendering ship', eid);

    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        const world = worldRef.current;
        const [peerId, player] = getShipOwner();
        const color = new Color(peerId ? `#${peerId.slice(0, 6)}` : '#ffffff');
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
        interpolateEntityVisibility(ship, world, eid, deltaTime);
        // lerp ship
        interpolateEntityPosition(
            group,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Quick,
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
            explosionRef.current.particleSystems.forEach((particleObj) => {
                if (exploding && !particleObj.isPlaying) {
                    const pos = new Vector3(0, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                    // make noise too
                    if (!explosionSfxRef.current.isPlaying) {
                        explosionSfxRef.current.play();
                    }
                } else if (
                    particleObj.isPlaying &&
                    world.components.entity.data.generation[eid] !==
                        ship.__generation
                ) {
                    particleObj.stop();
                }
                particleObj.update(deltaTime);
            });
        }

        // run respawn effect if generation changed
        if (respawnRef.current) {
            const respawned =
                world.components.entity.data.generation[eid] !==
                ship.__generation;
            respawnRef.current.particleSystems.forEach((particleObj) => {
                if (
                    respawned &&
                    !particleObj.isPlaying &&
                    world.components.entity.data.active[eid]
                ) {
                    const pos = new Vector3(0, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                }
                particleObj.update(deltaTime);
            });
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

        // mark prev states
        updateEntityGeneration(group, world, eid);
        updateEntityGeneration(ship, world, eid);
        prevHealthRef.current = health;
    });

    const [peerId, _player] = getShipOwner();
    return (
        <group ref={groupRef}>
            <Clone ref={shipRef} object={gltf.scene} scale={1} deep={true} />
            <Html ref={labelRef} style={{ fontSize: 11 }} position={[3, 5, 0]}>
                {peerId?.slice(0, 8)}
            </Html>
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