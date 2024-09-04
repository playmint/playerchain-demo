import { Clone, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useRef } from 'react';
import { Group, Vector3 } from 'three';
import { World } from '../../../runtime/ecs';
import { Input, ShooterSchema, hasInput } from '../../spaceshooter';
import shipGLTF from '../assets/ship.glb?url';
import fxThrusterData from '../effects/FXThruster';
import {
    InterpolateSpeed,
    assetPath,
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
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);
    const shipRef = useRef<any>(null!);
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
        const ship = shipRef.current;
        if (!player) {
            return;
        }
        // lerp ship
        interpolateEntityVisibility(group, world, eid, deltaTime);
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

        // update generation
        updateEntityGeneration(group, world, eid);
        updateEntityGeneration(ship, world, eid);
    });
    const owner = getShipOwner();
    return (
        <group ref={groupRef}>
            <Clone ref={shipRef} object={gltf.scene} scale={1} />
            <Html style={{ fontSize: 11 }}>{owner?.name}</Html>
        </group>
    );
});
