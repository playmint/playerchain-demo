import { Clone, useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import wall_endCapGLTF from '../assets/wall_endCap2.glb?url';
import { assetPath } from '../utils/RenderUtils';

export const WallEndCap = ({
    position,
    rotation,
}: {
    position: Vector3;
    rotation: number;
}) => {
    const { scene: wallEndCap } = useGLTF(assetPath(wall_endCapGLTF));
    return (
        <Clone
            object={wallEndCap}
            position={[position.x, position.y, 0]}
            rotation={[0, 0, rotation]}
            scale={[10, 10, 10]}
            deep
        />
    );
};
