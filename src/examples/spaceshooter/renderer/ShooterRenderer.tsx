import { useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { memo, useEffect, useState } from 'react';
import { EntityId, World } from '../../../runtime/ecs';
import { RendererProps } from '../../../runtime/game';
import { ModelType, ShooterSchema } from '../../spaceshooter';
import BulletEntity from './BulletEntity';
import PlayerCam from './PlayerCam';
import PlayerHUD from './PlayerHUD';
import ShipEntity from './ShipEntity';
import WallEntity from './WallEntity';

useGLTF.setDecoderPath('/libs/draco');

const CANVAS_RESIZE = { scroll: true, debounce: { scroll: 50, resize: 0 } };

function ModelEntity({
    world,
    eid,
}: {
    eid: number;
    world: World<ShooterSchema>;
}) {
    switch (world.components.model.data.type[eid]) {
        case ModelType.Ship:
            return <ShipEntity world={world} eid={eid} />;
        case ModelType.Bullet:
            return <BulletEntity world={world} eid={eid} />;
        case ModelType.Wall:
            return <WallEntity world={world} eid={eid} />;
    }
}

const GameView = memo(function GameView({
    world,
    peerId,
}: {
    world: World<ShooterSchema>;
    changeMe: any;
    peerId: string;
}) {
    const objects = world.entities.filter(
        (eid) =>
            !!eid && world.components.model.data.type[eid] !== ModelType.None,
    ) as EntityId[];

    if (!world) {
        return null;
    }
    // console.log('updating game view');

    return (
        <>
            {objects.map((eid) => (
                <ModelEntity key={eid} eid={eid} world={world} />
            ))}
            <PlayerCam peerId={peerId} world={world} />
        </>
    );
});

export default memo(function ShooterCanvas({ mod, peerId }: RendererProps) {
    // subscribe to updates
    const [world, setWorld] = useState<World<ShooterSchema>>();
    useEffect(() => {
        return mod.subscribe((w: World<ShooterSchema>) => {
            setWorld({ ...w }); // fixme: reernder less!!!!
        });
    }, [mod, peerId]);
    if (!world) {
        return <div>NO WORLD</div>;
    }
    // console.log('updating canvas');
    return (
        <>
            <Canvas resize={CANVAS_RESIZE}>
                <GameView
                    world={world}
                    peerId={peerId}
                    changeMe={world.entities}
                />
            </Canvas>
            <PlayerHUD world={world} peerId={peerId} />
        </>
    );
});
