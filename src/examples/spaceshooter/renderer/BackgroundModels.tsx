import { useGLTF } from '@react-three/drei';
import React, { useMemo } from 'react';
import { MeshBasicMaterial } from 'three';
import shipGLTF from '../assets/BaackgroundElements/BaackgroundElements.glb?url';
import { assetPath } from '../utils/RenderUtils';

// Memoize the GLTF and modify its children only once
export function BackgroundModels(props) {
    // Load and memoize the GLTF to avoid re-processing on every render
    const gltf = useGLTF(assetPath(shipGLTF));

    // Preprocess the scene only once
    const processedScene = useMemo(() => {
        gltf.scene.traverse((child) => {
            if (child.isMesh) {
                // Set flags that won't change
                child.castShadow = false;
                child.receiveShadow = false;
                child.frustumCulled = false;

                // Create a single material instance and reuse it
                const targetMaterial = new MeshBasicMaterial({
                    map: child.material.map,
                });

                targetMaterial.transparent = true;
                targetMaterial.map.needsUpdate = true;
                child.material = targetMaterial;

                // Set additional material properties
                child.material.depthWrite = true;
            }
        });
        return gltf.scene;
    }, [gltf.scene]); // Dependencies ensure this runs only when the scene changes

    // Prevent unnecessary re-renders of the component using React.memo
    return (
        <group {...props} dispose={null}>
            <primitive object={processedScene} />
        </group>
    );
}

// Preload the GLTF for faster loading
useGLTF.preload(assetPath(shipGLTF));
