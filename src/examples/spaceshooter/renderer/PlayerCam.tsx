import { PerspectiveCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo } from 'react';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import { InterpolateSpeed, interpolate } from '../utils/RenderUtils';
import { BackgroundGrid } from './Background';

const CAM_INITIAL_ZOOM = 160;

// camera and scene setup for following a player's ship
export default memo(function PlayerCam({
    world,
    peerId,
}: {
    world: World<ShooterSchema>;
    peerId: string;
}) {
    useFrame(({ camera }, deltaTime) => {
        // find the player data for viewing peerId
        const player = world.players.get(peerId);
        if (!player) {
            return;
        }
        // find the ship for the player
        if (!player.ship) {
            return;
        }
        // move the camera to the ship
        camera.position.x = interpolate(
            camera.position.x,
            world.components.position.data.x[player.ship],
            deltaTime,
            InterpolateSpeed.Smooth,
        );
        camera.position.y = interpolate(
            camera.position.y,
            world.components.position.data.y[player.ship],
            deltaTime,
            InterpolateSpeed.Smooth,
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
    });
    return (
        <>
            <PerspectiveCamera
                makeDefault
                position={[0, 0, CAM_INITIAL_ZOOM]}
                fov={40}
                near={1}
                far={1000}
            />
            {/* <color attach="background" args={[0xffffff]} /> */}
            <ambientLight color={0x404040} intensity={100} />
            <directionalLight position={[-1, 1, 1]} intensity={2} />
            <directionalLight position={[1, -1, 1]} intensity={10} />
            <fog attach="fog" args={[0x444466, 100, 1]} />
            <BackgroundGrid />
        </>
    );
});
