import { useFrame, useThree } from '@react-three/fiber';
import { Color, Scene, WebGLRenderTarget } from 'three';

export const BufferSceneRenderer = ({
    bufferScene,
    bufferTarget,
}: {
    bufferScene: Scene;
    bufferTarget: WebGLRenderTarget;
}) => {
    const { gl, camera } = useThree();

    useFrame(() => {
        bufferScene.background = new Color(0x000000);
        // Render bufferScene into the texture
        gl.setRenderTarget(bufferTarget);
        gl.render(bufferScene, camera);
        gl.setRenderTarget(null); // Reset render target to default
    });

    return null; // This component does not render anything itself
};
