import { useTexture } from '@react-three/drei';
import { RepeatWrapping } from 'three';
import gridImage from '../assets/grid.png?url';

export function BackgroundGrid() {
    const gridTex = useTexture(gridImage);
    gridTex.wrapS = RepeatWrapping;
    gridTex.wrapT = RepeatWrapping;
    gridTex.repeat.set(100, 100);
    return (
        <mesh position={[0, 0, -10]}>
            <planeGeometry args={[1000, 1000, 100, 100]} />
            <meshStandardMaterial
                map={gridTex}
                wireframe={false}
                color={0x888888}
                opacity={0.2}
            />
        </mesh>
    );
}
