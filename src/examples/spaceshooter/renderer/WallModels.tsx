import { Clone, useGLTF } from '@react-three/drei';
import { memo } from 'react';
import { Vector3 } from 'three';
import wall_cornerMediumGLTF from '../assets/wall_cornerMedium2.glb?url';
import wall_largeGLTF from '../assets/wall_large2.glb?url';
import wall_mediumGLTF from '../assets/wall_medium2.glb?url';
import levelData from '../levels/level_1';
import { assetPath } from '../utils/RenderUtils';

const WallLarge = ({
    position,
    rotation,
}: {
    position: Vector3;
    rotation: number;
}) => {
    const { scene: wallLarge } = useGLTF(assetPath(wall_largeGLTF));
    return (
        <Clone
            object={wallLarge}
            position={[position.x, position.y, 0]}
            rotation={[0, 0, rotation]}
            scale={[10, 10, 10]}
            deep
        />
    );
};

const WallMedium = ({
    position,
    rotation,
}: {
    position: Vector3;
    rotation: number;
}) => {
    const { scene: wallMedium } = useGLTF(assetPath(wall_mediumGLTF));
    return (
        <Clone
            object={wallMedium}
            position={[position.x, position.y, 0]}
            rotation={[0, 0, rotation]}
            scale={[10, 10, 10]}
            deep
        />
    );
};

const WallCornerMedium = ({
    position,
    rotation,
}: {
    position: Vector3;
    rotation: number;
}) => {
    const { scene: wallCornerMedium } = useGLTF(
        assetPath(wall_cornerMediumGLTF),
    );
    return (
        <Clone
            object={wallCornerMedium}
            position={[position.x, position.y, 0]}
            rotation={[0, 0, rotation]}
            scale={[10, 10, 10]}
            deep
        />
    );
};

export default memo(function WallModels() {
    const { models } = levelData;

    return (
        <group>
            {models.map((model, index) => {
                const position = new Vector3(
                    model.position.x,
                    model.position.y,
                    0,
                );
                switch (model.name) {
                    case 'wallLarge':
                        return (
                            <WallLarge
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    case 'wallMedium':
                        return (
                            <WallMedium
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    case 'wallCornerMedium':
                        return (
                            <WallCornerMedium
                                key={index}
                                position={position}
                                rotation={model.rotation}
                            />
                        );
                    default:
                        console.warn(`Unknown model name: ${model.name}`);
                        return null;
                }
            })}
        </group>
    );
});
