import { PerspectiveCamera } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo } from 'react';
import { MathUtils } from 'three';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import { BackgroundGrid } from './Background';

// camera and scene setup for following a player's ship
export default memo(function PlayerCam({
    world,
    peerId,
}: {
    world: World<ShooterSchema>;
    peerId: string;
}) {
    useFrame(({ camera }) => {
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
        camera.position.x = MathUtils.lerp(
            camera.position.x,
            world.components.position.data.x[player.ship],
            0.1,
        );
        camera.position.y = MathUtils.lerp(
            camera.position.y,
            world.components.position.data.y[player.ship],
            0.1,
        );
        // camera.position.z = world.components.position.data.z[player.ship];
    });
    return (
        <>
            <PerspectiveCamera
                makeDefault
                position={[0, 0, 190]}
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
