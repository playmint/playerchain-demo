import { Clone, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import { AdditiveBlending, Group, Mesh } from 'three';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import shipGLTF from '../assets/bullet.glb?url';
import {
    InterpolateSpeed,
    assetPath,
    interpolateEntityPosition,
    interpolateEntityRotation,
    interpolateEntityVisibility,
    updateEntityGeneration,
} from '../utils/RenderUtils';

export default memo(function BulletEntity({
    eid,
    world,
}: {
    eid: number;
    world: World<ShooterSchema>;
}) {
    const groupRef = useRef<Group>(null!);
    const gltf = useGLTF(assetPath(shipGLTF));
    const model = useMemo(() => {
        gltf.scene.scale.set(1, 1, 1);
        gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
                child.material.blending = AdditiveBlending;
            }
        });
        return gltf.scene;
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        interpolateEntityVisibility(groupRef.current, world, eid);
        interpolateEntityPosition(
            groupRef.current,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Fastest,
        );
        interpolateEntityRotation(
            groupRef.current,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Snap,
        );
        updateEntityGeneration(groupRef.current, world, eid);
    });

    return (
        <group ref={groupRef}>
            <Clone object={model} scale={1} />
        </group>
    );
});
