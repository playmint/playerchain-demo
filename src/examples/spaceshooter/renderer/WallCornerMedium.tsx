import { Clone, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import wall_cornerMediumGLTF from '../assets/wall_cornerMedium2.glb?url';
import { assetPath } from '../utils/RenderUtils';

export const WallCornerMedium = ({
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
