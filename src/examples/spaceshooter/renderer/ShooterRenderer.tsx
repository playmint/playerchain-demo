import { PositionalAudio, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    Color,
    LinearFilter,
    NearestFilter,
    Scene,
    WebGLRenderTarget,
import { Camera } from 'three';
import { EntityId, World } from '../../../runtime/ecs';
import { RendererProps } from '../../../runtime/game';
import { ModelType, ShooterSchema } from '../../spaceshooter';
import backgroundMusic from '../assets/BGM.mp3?url';
import { StarFieldFX } from '../effects/FXStarfieldQuarks';
import { assetPath } from '../utils/RenderUtils';
import AudioControls from './AudioControls';
import { BackgroundModels } from './BackgroundModels';
import { FPSLimiter } from './FPSLimiter';
import { ModelEntity } from './ModelEntity';
import PlayerCam from './PlayerCam';
import PlayerHUD, { PlayerInfo } from './PlayerHUD';
import ShipEntity from './ShipEntity';
import { StarFieldFX } from '../effects/FXStarfieldQuarks';
import { Color, LinearFilter, NearestFilter, Scene, WebGLRenderTarget } from 'three';
import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { WarpEffect } from './WarpEffect';
import { ToneMappingMode } from 'postprocessing';

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
    const [nextPlayers, setNextPlayers] = useState<PlayerInfo[]>([]);
    const prevPlayers = useRef<PlayerInfo[]>([]);
    const [tick, setTick] = useState(0);
    const [camera, setCamera] = useState<Camera>();
    const bufferScene = useMemo(() => new Scene(), []);
    const bufferTarget = useMemo(() => {
        const target = new WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: LinearFilter,
                magFilter: NearestFilter,
            },
        );
        return target;
    }, []);

    // subscribe to updates
    useEffect(() => {
        return mod.subscribe((w: World<ShooterSchema>) => {
            // try to only update the entities list if it has changed
            // to reduce unnecessary re-renders
            worldRef.current = w;
            setTick(w.t);
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
                setNextPlayers(nextPlayers);
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
        return <div>Loading world....</div>;
    }
    return (
        <>
            <Canvas resize={CANVAS_RESIZE} frameloop="demand">
                <BackgroundModels rotation={[1.5708, 0, 0]} />
                <StarFieldFX />
                <FPSLimiter fps={60} />
                {entities.map((eid) => (
                    <ModelEntity
                        key={eid}
                        eid={eid}
                        worldRef={worldRef}
                        playersRef={playersRef}
                        bufferScene={bufferScene}
                    />
                ))}
                <PlayerCam
                    peerId={peerId}
                    worldRef={worldRef}
                    metrics={metrics}
                    setCamera={setCamera}
                />
                <PositionalAudio
                    autoplay={true}
                    url={assetPath(backgroundMusic)}
                    distance={50000}
                    loop={true}
                />
                <AudioControls />
                <WallModels />
                <EffectComposer>
                    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
                    <WarpEffect
                        strength={0.01}
                        tBuffer={bufferTarget.texture}
                    />
                </EffectComposer>
            </Canvas>
            <PlayerHUD
                peerId={peerId}
                players={nextPlayers}
                tick={tick}
                worldRef={worldRef}
                camera={camera}
            />
        </>
    );
});
