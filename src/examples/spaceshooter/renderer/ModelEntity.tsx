import { memo } from 'react';
import { ModelType } from '../../spaceshooter';
import BulletEntity from './BulletEntity';
import ShipEntity from './ShipEntity';
import type { PlayersRef, WorldRef } from './ShooterRenderer';
import { Scene } from 'three';

export const ModelEntity = memo(function ModelEntity({
    worldRef,
    eid,
    playersRef,
    bufferScene,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
    bufferScene: Scene;
}) {
    console.log('ModelEntity', eid);
    switch (worldRef.current.components.model.data.type[eid]) {
        case ModelType.Ship:
            return (
                <ShipEntity
                    worldRef={worldRef}
                    eid={eid}
                    playersRef={playersRef}
                    bufferScene={bufferScene}
                />
            );
        case ModelType.Bullet:
            return <BulletEntity worldRef={worldRef} eid={eid} />;
    }
});
