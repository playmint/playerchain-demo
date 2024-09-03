import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { MathUtils, Mesh } from 'three';
import { EntityId, World } from '../../runtime/ecs';
import { RendererProps } from '../../runtime/game';
import { CubesSchema, ObjectType } from '../cubes';

const lerpyness = 0.06;
function PlayerBox({ eid, world }: { eid: number; world: World<CubesSchema> }) {
    const [color, setColor] = useState(0x000000);
    const colorRef = useRef(color);
    const meshRef = useRef<Mesh>(null!);
    useFrame(() => {
        meshRef.current.rotation.x = MathUtils.lerp(
            meshRef.current.rotation.x,
            world.components.rotation.data.x[eid],
            lerpyness,
        );
        meshRef.current.rotation.y = MathUtils.lerp(
            meshRef.current.rotation.y,
            world.components.rotation.data.y[eid],
            lerpyness,
        );
        meshRef.current.rotation.z = MathUtils.lerp(
            meshRef.current.rotation.z,
            world.components.rotation.data.z[eid],
            lerpyness,
        );
        meshRef.current.position.x = MathUtils.lerp(
            meshRef.current.position.x,
            world.components.position.data.x[eid],
            lerpyness,
        );
        meshRef.current.position.y = MathUtils.lerp(
            meshRef.current.position.y,
            world.components.position.data.y[eid],
            lerpyness,
        );
        meshRef.current.position.z = MathUtils.lerp(
            meshRef.current.position.z,
            world.components.position.data.z[eid],
            lerpyness,
        );
        if (world.components.object.data.color[eid] !== colorRef.current) {
            setColor(world.components.object.data.color[eid]);
            colorRef.current = world.components.object.data.color[eid];
        }
        // (meshRef.current.scale as any) =
        //     world.components.object.data.size[eid] || 1;
    });
    return (
        <mesh ref={meshRef} scale={0.5}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={color} />
        </mesh>
    );
}

function SpinnyBox({ eid, world }: { eid: number; world: World<CubesSchema> }) {
    const [color, setColor] = useState(0x000000);
    const colorRef = useRef(color);
    const meshRef = useRef<Mesh>(null!);
    useFrame(() => {
        meshRef.current.rotation.x = MathUtils.lerp(
            meshRef.current.rotation.x,
            world.components.rotation.data.x[eid],
            lerpyness,
        );
        meshRef.current.rotation.y = MathUtils.lerp(
            meshRef.current.rotation.y,
            world.components.rotation.data.y[eid],
            lerpyness,
        );
        meshRef.current.rotation.z = MathUtils.lerp(
            meshRef.current.rotation.z,
            world.components.rotation.data.z[eid],
            lerpyness,
        );
        meshRef.current.position.x = MathUtils.lerp(
            meshRef.current.position.x,
            world.components.position.data.x[eid],
            lerpyness,
        );
        meshRef.current.position.y = MathUtils.lerp(
            meshRef.current.position.y,
            world.components.position.data.y[eid],
            lerpyness,
        );
        meshRef.current.position.z = MathUtils.lerp(
            meshRef.current.position.z,
            world.components.position.data.z[eid],
            lerpyness,
        );
        if (world.components.object.data.color[eid] !== colorRef.current) {
            setColor(world.components.object.data.color[eid]);
            colorRef.current = world.components.object.data.color[eid];
        }
        // matRef.current.color = world.components.object.data.color[eid] as any;
        // (meshRef.current.scale as any) =
        //     world.components.object.data.size[eid] || 1;
    });
    return (
        <mesh ref={meshRef}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={color} />
        </mesh>
    );
}

// type EntityType = RenderSchema & BasicEntity;

function RenderableObject({
    world,
    eid,
}: {
    eid: number;
    world: World<CubesSchema>;
}) {
    switch (world.components.object.data.type[eid]) {
        case ObjectType.PlayerBox:
            return <PlayerBox world={world} eid={eid} />;
        case ObjectType.SpinnyBox:
            return <SpinnyBox world={world} eid={eid} />;
        default:
            return null;
    }
}
export default memo(function CubesRenderer({ mod }: RendererProps) {
    // subscribe to updates
    const [entities, setEntities] = useState<number[]>([]);
    const [world, setWorld] = useState<World<CubesSchema>>();
    useEffect(() => {
        return mod.subscribe((w) => {
            setWorld(w);
            setEntities(w.entities);
        });
    }, [mod]);

    useFrame(() => {});

    const objects: EntityId[] = useMemo(
        () =>
            world
                ? entities.filter(
                      (eid) =>
                          world.components.object.data.type[eid] !==
                          ObjectType.None,
                  )
                : [],
        [entities, world],
    );

    return (
        <>
            {world &&
                objects.map((eid) => (
                    <RenderableObject key={eid} eid={eid} world={world} />
                ))}
        </>
    );
});
