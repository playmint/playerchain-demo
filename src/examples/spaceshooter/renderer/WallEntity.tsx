import { useFrame } from '@react-three/fiber';
import { memo, useRef } from 'react';
import { Group, Mesh } from 'three';
import { WorldRef } from './ShooterRenderer';

export default memo(function WallEntity({
    eid,
    worldRef,
}: {
    eid: number;
    worldRef: WorldRef;
}) {
    const groupRef = useRef<Group>(null!);
    const meshRef = useRef<Mesh>(null!);
    useFrame(() => {
        const world = worldRef.current;
        const obj = groupRef.current;
        obj.position.x = world.components.position.data.x[eid];
        obj.position.y = world.components.position.data.y[eid];
        obj.position.z = world.components.position.data.z[eid];
        obj.rotation.x = world.components.rotation.data.x[eid];
        obj.rotation.y = world.components.rotation.data.y[eid];
        obj.rotation.z = world.components.rotation.data.z[eid];
        meshRef.current.scale.x =
            world.components.model.data.width[eid] || 0.01;
        meshRef.current.scale.y =
            world.components.model.data.height[eid] || 0.01;
        meshRef.current.scale.z =
            world.components.model.data.depth[eid] || 0.01;
    });
    return (
        <group ref={groupRef}>
            <mesh ref={meshRef} scale={1}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={'#696969'} />
            </mesh>
        </group>
    );
});
