import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Mesh, MeshBasicMaterial } from 'three';
import purpleBulletURL from '../assets/bullet_purple.glb?url';
import redBulletURL from '../assets/bullet_red.glb?url';
import tealBulletURL from '../assets/bullet_teal.glb?url';
import yellowBulletURL from '../assets/bullet_yellow.glb?url';
import { assetPath } from '../utils/RenderUtils';

const MODEL_URLS = [
    tealBulletURL,
    redBulletURL,
    purpleBulletURL,
    yellowBulletURL,
];

export default function useBulletModel(playerIndex: number) {
    const gltf = useGLTF(assetPath(MODEL_URLS[playerIndex]));
    const model = useMemo(() => {
        gltf.scene.scale.set(0.85, 0.85, 0.85);
        gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
                const targetMaterial = new MeshBasicMaterial({
                    map: child.material.map,
                });

                targetMaterial.transparent = true;
                if (targetMaterial.map) {
                    targetMaterial.map.needsUpdate = true;
                }
                child.material = targetMaterial;
            }
        });
        return gltf.scene;
    }, [gltf]);
    return model;
}
