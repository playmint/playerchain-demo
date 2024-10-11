import { PerspectiveCamera } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { memo, useEffect } from 'react';
import { Frustum, Matrix4 } from 'three';
import { DefaultMetrics } from '../../../runtime/metrics';
import {
    EntityObject3D,
    InterpolateSpeed,
    interpolate,
    updateEntityGeneration,
} from '../utils/RenderUtils';
import { getShakeOffset } from './ShakeManager';
import { WorldRef } from './ShooterRenderer';

const CAM_INITIAL_ZOOM = 160;

// camera and scene setup for following a player's ship
export default memo(function PlayerCam({
    worldRef,
    peerId,
    metrics,
}: {
    worldRef: WorldRef;
    peerId: string;
    metrics?: DefaultMetrics;
}) {
    const camera = useThree((state) => state.camera);
    useEffect(() => {
        if (!camera) {
            return;
        }
        (camera as any).__frustum = new Frustum();
    }, [camera]);

    useFrame(({ camera }, deltaTime) => {
        // fps counter
        if (metrics) {
            metrics.fps.add(1);
        }
        // update frustum data
        // NOTE: this is set here but used elsewhere so that we only set it once per frame
        (camera as any).__frustum.setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
                camera.projectionMatrix,
                camera.matrixWorldInverse,
            ),
        );
        // find the player data for viewing peerId
        const world = worldRef.current;
        const player = world.players.get(peerId);
        if (!player) {
            return;
        }
        // find the ship for the player
        if (!player.ship) {
            return;
        }
        // move the camera to the ship
        // snap if ship generation changed
        const snapiness =
            world.components.entity.data.generation[player.ship] ===
            (camera as EntityObject3D).__generation
                ? InterpolateSpeed.Quick * 1.5
                : InterpolateSpeed.Snap;
        camera.position.x = Math.max(
            Math.min(
                interpolate(
                    camera.position.x,
                    world.components.position.data.x[player.ship],
                    deltaTime,
                    snapiness,
                ),
                460,
            ),
            -460,
        );
        camera.position.y = Math.max(
            Math.min(
                interpolate(
                    camera.position.y,
                    world.components.position.data.y[player.ship],
                    deltaTime,
                    snapiness,
                ),
                460, // north extent
            ),
            -460, // south extent
        );
        // calulate velocity magnitude

        // zoom out based on velocity
        const vmag = Math.sqrt(
            world.components.velocity.data.x[player.ship] *
                world.components.velocity.data.x[player.ship] +
                world.components.velocity.data.y[player.ship] *
                    world.components.velocity.data.y[player.ship],
        );
        const zoom = CAM_INITIAL_ZOOM + vmag * 2;
        camera.position.z = interpolate(
            camera.position.z,
            zoom,
            deltaTime,
            InterpolateSpeed.Slow,
        );

        const shakeOffset = getShakeOffset(camera.position, deltaTime);
        // Apply shake offset to the camera
        camera.position.add(shakeOffset);

        // mark generation
        updateEntityGeneration(camera, world, player.ship);
    });
    return (
        <>
            <PerspectiveCamera
                makeDefault
                position={[0, 0, CAM_INITIAL_ZOOM]}
                fov={40}
                near={1}
                far={2000}
            />
            <color attach="background" args={[0x060d37]} />
            <ambientLight color={0x404040} />
            <directionalLight
                position={[1, -1, 1]}
                intensity={8}
                color={0xffaf7b}
            />
            <directionalLight
                position={[-1, 1, 1]}
                intensity={12}
                color={0xffffff}
            />

            <fog attach="fog" args={[0x444466, 100, 1]} />
            {/* <BackgroundGrid /> */}
        </>
    );
});
