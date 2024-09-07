import { PositionalAudio, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EntityId, World } from '../../../runtime/ecs';
import { RendererProps } from '../../../runtime/game';
import { ModelType, ShooterSchema } from '../../spaceshooter';
import backgroundMusic from '../assets/BGM.mp3?url';
import { assetPath } from '../utils/RenderUtils';
import AudioControls from './AudioControls';
import BulletEntity from './BulletEntity';
import PlayerCam from './PlayerCam';
import PlayerHUD from './PlayerHUD';
import ShipEntity from './ShipEntity';
import WallEntity from './WallEntity';

useGLTF.setDecoderPath('/libs/draco');

const CANVAS_RESIZE = { scroll: true, debounce: { scroll: 50, resize: 0 } };

export type WorldRef = { current: World<ShooterSchema> };

function ModelEntity({ worldRef, eid }: { eid: number; worldRef: WorldRef }) {
    console.log('ModelEntity', eid);
    switch (worldRef.current.components.model.data.type[eid]) {
        case ModelType.Ship:
            return <ShipEntity worldRef={worldRef} eid={eid} />;
        case ModelType.Bullet:
            return <BulletEntity worldRef={worldRef} eid={eid} />;
        case ModelType.Wall:
            return <WallEntity worldRef={worldRef} eid={eid} />;
    }
}

export default memo(function ShooterCanvas({ mod, peerId }: RendererProps) {
    const [nextEntities, setNextEntities] = useState<(EntityId | null)[]>([]);
    const worldRef = useMemo((): WorldRef => ({}) as WorldRef, []);
    const prevEntities = useRef<(EntityId | null)[]>([]);
    const entities = useMemo((): EntityId[] => {
        return Array.from(nextEntities || []).filter(
            (eid) =>
                eid &&
                worldRef.current &&
                worldRef.current.components.model.data.type[eid] !==
                    ModelType.None,
        ) as EntityId[];
    }, [nextEntities, worldRef]);
    // subscribe to updates
    useEffect(() => {
        return mod.subscribe((w: World<ShooterSchema>) => {
            worldRef.current = w;
            const a = prevEntities.current ?? [];
            const b = w.entities;
            const isChanged =
                a.length !== b.length || a.some((v, i) => v !== b[i]);
            if (isChanged) {
                setNextEntities(w.entities);
                prevEntities.current = w.entities;
            }
        });
    }, [mod, peerId, worldRef]);

    if (!worldRef.current) {
        return <div>Loading world...</div>;
    }
    console.log('updating canvas');
    return (
        <>
            <Canvas resize={CANVAS_RESIZE}>
                {entities.map((eid) => (
                    <ModelEntity key={eid} eid={eid} worldRef={worldRef} />
                ))}
                <PlayerCam peerId={peerId} worldRef={worldRef} />
                <PositionalAudio
                    autoplay={true}
                    url={assetPath(backgroundMusic)}
                    distance={50000}
                    loop={true}
                />
                <AudioControls />
            </Canvas>
            <PlayerHUD worldRef={worldRef} peerId={peerId} />
        </>
    );
});
