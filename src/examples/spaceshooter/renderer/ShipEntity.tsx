import { Clone, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useRef } from 'react';
import { Color, Group, Mesh, Object3DEventMap, Vector3 } from 'three';
import { World } from '../../../runtime/ecs';
import { Input, ShooterSchema, hasInput } from '../../spaceshooter';
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

export default memo(function ShipEntity({
    eid,
    world,
}: {
    eid: number;
    world: World<ShooterSchema>;
}) {
    const getShipOwner = () =>
        Array.from(world.players.values()).find((p) => p.ship === eid);
    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);
    const explosionRef = useParticleEffect(groupRef, fxExplodeData, [0, 0, 0]);
    const respawnRef = useParticleEffect(groupRef, fxRespawnData, [0, 0, 0]);
    const shootRef = useParticleEffect(shipRef, fxShootData, [0, 0, 0]);
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
        const player = getShipOwner(); // inefficient, but there's only a few players
        const group = groupRef.current;
        const ship = shipRef.current as EntityObject3D;
        if (!player) {
            return;
        }
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

        // run shoot effect if shooting
        if (shootRef.current) {
            const shooting = hasInput(player.input, Input.Fire);
            shootRef.current.particleSystems.forEach((particleObj) => {
                particleObj.update(deltaTime);
                if (shooting && !particleObj.isPlaying) {
                    const pos = new Vector3(4.2, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                    console.log('shootfx');
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
    const owner = getShipOwner();
    return (
        <group ref={groupRef}>
            <Clone ref={shipRef} object={gltf.scene} scale={1} deep={true} />
            <Html ref={labelRef} style={{ fontSize: 11 }}>
                {owner?.name}
            </Html>
        </group>
    );
});
