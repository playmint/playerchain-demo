import { Clone, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import wall_mediumGLTF from '../assets/wall_medium2.glb?url';
import { assetPath } from '../utils/RenderUtils';

export const WallMedium = ({
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
