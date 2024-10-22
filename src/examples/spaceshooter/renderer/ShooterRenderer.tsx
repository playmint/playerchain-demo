import { AdaptiveDpr, PositionalAudio, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EntityId, World } from '../../../runtime/ecs';
import { RendererProps } from '../../../runtime/game';
import { ModelType, ShooterSchema } from '../../spaceshooter';
import backgroundMusic from '../assets/BGM.mp3?url';
import { StarFieldFX } from '../effects/FXStarfieldQuarks';
import { assetPath } from '../utils/RenderUtils';
import AudioControls from './AudioControls';
import { BackgroundModels } from './BackgroundModels';
import { ModelEntity } from './ModelEntity';
import PlayerCam from './PlayerCam';
import PlayerHUD, { PlayerInfo } from './PlayerHUD';
import WallModels from './WallModels';

useGLTF.setDecoderPath('/libs/draco');

const CANVAS_RESIZE = { scroll: true, debounce: { scroll: 50, resize: 0 } };

export type WorldRef = { current: World<ShooterSchema> };
export type PlayersRef = { current: PlayerInfo[] };

export default memo(function ShooterCanvas({
    mod,
    peerId,
    peerNames,
    metrics,
}: RendererProps) {
    const worldRef = useMemo((): WorldRef => ({}) as WorldRef, []);
    const playersRef = useMemo(
        (): PlayersRef => ({ current: [] }) as PlayersRef,
        [],
    );

    // entities to add to the scene
    const [nextEntities, setNextEntities] = useState<(EntityId | null)[]>([]);
    const prevEntities = useRef<(EntityId | null)[]>([]);

    // stuff we send to the hud
    const prevPlayers = useRef<PlayerInfo[]>([]);

    // subscribe to updates
    useEffect(() => {
        return mod.subscribe((w: World<ShooterSchema>) => {
            // try to only update the entities list if it has changed
            // to reduce unnecessary re-renders
            worldRef.current = w;
            // setTick(w.t);
            const a = prevEntities.current ?? [];
            const b = w.entities;
            const isChanged =
                a.length !== b.length || a.some((v, i) => v !== b[i]);
            if (isChanged) {
                setNextEntities(w.entities);
            }
            prevEntities.current = w.entities;
            // try to only update the players list if it has changed
            // to reduce unnecessary re-renders
            const nextPlayers = Array.from(w.players.entries())
                .map(([id, p]) => ({
                    ...p,
                    id,
                    name: peerNames[id] || id.slice(0, 8),
                    health: w.components.stats.data.health[p.ship],
                }))
                .sort((a, b) => (b.id > a.id ? -1 : 1));
            if (
                prevPlayers.current.length !== nextPlayers.length ||
                prevPlayers.current.some((a, i) => {
                    const b = nextPlayers[i];
                    return (
                        a.id !== b.id ||
                        a.health !== b.health ||
                        a.ship !== b.ship ||
                        a.name !== b.name ||
                        a.score !== b.score
                    );
                })
            ) {
                playersRef.current = nextPlayers;
            }
            prevPlayers.current = nextPlayers;
        });
    }, [mod, peerId, peerNames, playersRef, worldRef]);

    const entities = useMemo((): EntityId[] => {
        return Array.from(nextEntities || []).filter(
            (eid) =>
                eid &&
                worldRef.current &&
                worldRef.current.components.model.data.type[eid] !==
                    ModelType.None,
        ) as EntityId[];
    }, [nextEntities, worldRef]);

    if (!worldRef.current) {
        return <></>;
    }
    return (
        <>
            <Canvas id="gamecanvas" resize={CANVAS_RESIZE} dpr={[0.5, 2]}>
                <BackgroundModels rotation={[1.5708, 0, 0]} />
                <StarFieldFX />
                <AdaptiveDpr pixelated />
                {entities.map((eid) => (
                    <ModelEntity
                        key={eid}
                        eid={eid}
                        worldRef={worldRef}
                        playersRef={playersRef}
                        peerId={peerId}
                    />
                ))}
                <PlayerCam
                    peerId={peerId}
                    worldRef={worldRef}
                    metrics={metrics}
                />
                <PositionalAudio
                    autoplay={true}
                    url={assetPath(backgroundMusic)}
                    distance={50000}
                    loop={true}
                />
                <AudioControls />
                <WallModels />
            </Canvas>
            <PlayerHUD
                peerId={peerId}
                playersRef={playersRef}
                worldRef={worldRef}
                metrics={metrics}
                peerNames={peerNames}
            />
        </>
    );
});
