import { Clone, Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useRef } from 'react';
import { Group, MathUtils } from 'three';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import shipGLTF from '../assets/ship.glb?url';
import { assetPath, lerpToEntity } from '../utils/RenderUtils';
import ShipThrusterFX from './Particles';

export default memo(function ShipEntity({
    eid,
    world,
}: {
    eid: number;
    world: World<ShooterSchema>;
}) {
    const player = Array.from(world.players.values()).find(
        (p) => p.ship === eid,
    );
    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<any>(null!);
    const fxRot = useRef<any>({ x: 0, y: 0, z: 0 });
    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);
    useFrame(() => {
        // shipRef.current.rotation.z = world.components.rotation.data.z[eid];
        groupRef.current.position.x = MathUtils.lerp(
            groupRef.current.position.x,
            world.components.position.data.x[eid],
            0.2,
        );
        groupRef.current.position.y = MathUtils.lerp(
            groupRef.current.position.y,
            world.components.position.data.y[eid],
            0.2,
        );
        groupRef.current.position.z = MathUtils.lerp(
            groupRef.current.position.z,
            world.components.position.data.z[eid],
            0.2,
        );

        shipRef.current.rotation.x = MathUtils.lerp(
            shipRef.current.rotation.x,
            world.components.rotation.data.x[eid],
            0.05,
        );
        shipRef.current.rotation.y = MathUtils.lerp(
            shipRef.current.rotation.y,
            world.components.rotation.data.y[eid],
            0.05,
        );
        shipRef.current.rotation.z = MathUtils.lerp(
            shipRef.current.rotation.z,
            world.components.rotation.data.z[eid],
            0.05,
        );
        fxRot.current.z = shipRef.current.rotation.z;
    });
    return (
        <group ref={groupRef}>
            <Clone ref={shipRef} object={gltf.scene} scale={1} />
            <Html style={{ fontSize: 11 }}>{player?.name}</Html>
            <ShipThrusterFX
                active={true}
                position={[-4, 0, 0]}
                rotation={fxRot.current}
            />
        </group>
    );
});
