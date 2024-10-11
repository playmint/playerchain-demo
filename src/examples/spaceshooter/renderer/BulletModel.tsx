import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { AdditiveBlending, Mesh, MeshBasicMaterial } from 'three';
import shipGLTF from '../assets/bullet.glb?url';
import { assetPath } from '../utils/RenderUtils';

export default function BulletModel() {
    const gltf = useGLTF(assetPath(shipGLTF));
    useMemo(() => {
        gltf.scene.scale.set(1.1, 1.1, 1.1);
        gltf.scene.traverse((child) => {
            if (child instanceof Mesh) {
                // child.material.blending = AdditiveBlending;
                const targetMaterial = new MeshBasicMaterial({
                    map: child.material.map,
                });

                targetMaterial.transparent = true;
                targetMaterial.map.needsUpdate = true;
                child.material = targetMaterial;
            }
        });
        return gltf.scene;
    }, [gltf]);
    return gltf.scene;
}
