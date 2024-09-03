import { Clone, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import { AdditiveBlending, Group, Mesh } from 'three';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import shipGLTF from '../assets/bullet.glb?url';
import { assetPath, lerpToEntity } from '../utils/RenderUtils';

export default memo(function BulletEntity({
    eid,
    world,
}: {
    eid: number;
    world: World<ShooterSchema>;
}) {
    const generation = useRef(0);
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
    useFrame(() => {
        if (
            generation.current !== world.components.entity.data.generation[eid]
        ) {
            generation.current = world.components.entity.data.generation[eid];
            groupRef.current.position.x = world.components.position.data.x[eid];
            groupRef.current.position.y = world.components.position.data.y[eid];
            groupRef.current.position.z = world.components.position.data.z[eid];
            groupRef.current.rotation.z = world.components.rotation.data.z[eid];
            groupRef.current.visible =
                !!world.components.entity.data.active[eid];
        } else {
            lerpToEntity(groupRef.current, world, eid);
        }
    });
    return (
        <group ref={groupRef}>
            <Clone object={model} scale={1} />
        </group>
    );
});
