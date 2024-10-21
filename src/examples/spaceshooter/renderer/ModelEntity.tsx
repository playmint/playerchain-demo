import { memo } from 'react';
import { ModelType } from '../../spaceshooter';
import BulletEntity from './BulletEntity';
import ShipEntity from './ShipEntity';
import type { PlayersRef, WorldRef } from './ShooterRenderer';

export const ModelEntity = memo(function ModelEntity({
    worldRef,
    eid,
    playersRef,
    peerId,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
    peerId: string;
}) {
    switch (worldRef.current.components.model.data.type[eid]) {
        case ModelType.Ship:
            return (
                <ShipEntity
                    worldRef={worldRef}
                    eid={eid}
                    playersRef={playersRef}
                    peerId={peerId}
                />
            );
        case ModelType.Bullet:
            return (
                <BulletEntity
                    worldRef={worldRef}
                    eid={eid}
                    playersRef={playersRef}
                />
            );
    }
});
