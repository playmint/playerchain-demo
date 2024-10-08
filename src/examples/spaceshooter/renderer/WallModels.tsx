import { useGLTF } from '@react-three/drei';
import { memo, useEffect, useRef } from 'react';
import * as THREE from 'three';
import wall_cornerMediumGLTF from '../assets/wall_cornerMedium2.glb?url';
import wall_largeGLTF from '../assets/wall_large2.glb?url';
import wall_mediumGLTF from '../assets/wall_medium2.glb?url';
import levelData from '../levels/level_1';
import { assetPath } from '../utils/RenderUtils';

export default memo(function WallModels() {
    const { models } = levelData;

    const { scene: wallMedium } = useGLTF(assetPath(wall_mediumGLTF));
    const { scene: wallLarge } = useGLTF(assetPath(wall_largeGLTF));
    const { scene: wallCornerMedium } = useGLTF(
        assetPath(wall_cornerMediumGLTF),
    );

    const groupRef = useRef<THREE.Group>(null);

    useEffect(() => {
        if (groupRef.current) {
            placeModels();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const placeModels = () => {
        if (!groupRef.current) {
            return;
        }

        models.forEach((model) => {
            let modelInstance;
            switch (model.name) {
                case 'wallLarge':
                    modelInstance = wallLarge.clone();
                    break;
                case 'wallMedium':
                    modelInstance = wallMedium.clone();
                    break;
                case 'wallCornerMedium':
                    modelInstance = wallCornerMedium.clone();
                    break;
                default:
                    console.warn(`Unknown model name: ${model.name}`);
                    return;
            }

            if (modelInstance) {
                modelInstance.position.set(
                    model.position.x,
                    model.position.y,
                    0,
                );
                modelInstance.rotation.z = model.rotation;
                modelInstance.scale.set(10, 10, 10);

                if (groupRef.current) {
                    groupRef.current.add(modelInstance);
                }
            }
        });
        console.log('Rendered wall models');
    };

    return <group ref={groupRef} />;
});
