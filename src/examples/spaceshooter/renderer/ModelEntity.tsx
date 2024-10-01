import { memo } from 'react';
import { ModelType } from '../../spaceshooter';
import BulletEntity from './BulletEntity';
import ShipEntity from './ShipEntity';
import type { PlayersRef, WorldRef } from './ShooterRenderer';
import WallEntity from './WallEntity';

export const ModelEntity = memo(function ModelEntity({
    worldRef,
    eid,
    playersRef,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
}) {
    console.log('ModelEntity', eid);
    switch (worldRef.current.components.model.data.type[eid]) {
        case ModelType.Ship:
            return (
                <ShipEntity
                    worldRef={worldRef}
                    eid={eid}
                    playersRef={playersRef}
                />
            );
        case ModelType.Bullet:
            return <BulletEntity worldRef={worldRef} eid={eid} />;
        case ModelType.Wall:
            return <WallEntity worldRef={worldRef} eid={eid} />;
    }
});
