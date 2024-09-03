import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Group, Vector3 } from 'three';
import { useAsyncEffect } from '../../../gui/hooks/use-async';
import fxThrusterData from '../effects/FXThruster';
import { ParticleEffect, ParticleEffectData } from '../effects/ParticleSystem';

export default function ShipThrusterFX({
    position,
    active,
    rotation,
}: {
    rotation: { x: number; y: number; z: number };
    position: [number, number, number];
    active: boolean;
}) {
    const group = useRef<Group>(null);
    const asset = useRef<ParticleEffectData | null>(null);
    const effect = useRef<ParticleEffect | null>(null);
    useAsyncEffect(async () => {
        await fxThrusterData.prepare();
        asset.current = fxThrusterData;
    }, []);

    useEffect(() => {
        return () => effect.current?.destroy();
    }, []);

    useFrame((_state, deltaTime) => {
        if (!parent) {
            return;
        }
        if (!asset.current) {
            return;
        }
        if (!group.current) {
            return;
        }
        if (!effect.current) {
            effect.current = new ParticleEffect(
                'ShipThrusterFX',
                group.current,
                new Vector3(...position),
                asset.current,
            );
        }
        const parentObj = group.current;
        effect.current.particleSystems.forEach((particleObj) => {
            if (active) {
                particleObj.start();
                // const rotation = parentObj.children[0].rotation.z;
                particleObj.setRotation(rotation.z);
                // Create a new Vector3 to store the result
                const pos = new Vector3(...position);
                const angleInRadians = rotation.z; //MathUtils.degToRad(rotation);
                // Calculate the position based on the angle and offset
                particleObj.position.x =
                    pos.x * Math.cos(rotation.z) - pos.y * Math.sin(rotation.z);
                parentObj.position.y =
                    pos.x * Math.sin(angleInRadians) +
                    pos.y * Math.cos(angleInRadians);
            } else {
                particleObj.stop();
            }
            particleObj.update(deltaTime / 2);
        });
    });
    return <group ref={group}></group>;
}
