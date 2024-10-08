import { Clone, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import wall_largeGLTF from '../assets/wall_large2.glb?url';
import { assetPath } from '../utils/RenderUtils';

export const WallLarge = ({
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
