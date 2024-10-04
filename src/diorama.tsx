import '@fontsource-variable/recursive/mono.css';
import '@fontsource/material-symbols-outlined';
import { Clone, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Color, Group, Mesh, Object3DEventMap, Vector3 } from 'three';
import shipGLTF from './examples/spaceshooter/assets/ship.glb?url';
import {
    ExplodeFX,
    ExplodeFXHandle,
} from './examples/spaceshooter/effects/FXExplodeQuarks';
import {
    SpawnFX,
    SpawnFXHandle,
} from './examples/spaceshooter/effects/FXRespawnQuarks';
import {
    ShipImpactFX,
    ShipImpactFXHandle,
} from './examples/spaceshooter/effects/FXShipImpactQuarks';
import {
    SparksFX,
    SparksFXHandle,
} from './examples/spaceshooter/effects/FXSparksQuarks';
import { StarFieldFX } from './examples/spaceshooter/effects/FXStarfieldQuarks';
import fxThrusterData from './examples/spaceshooter/effects/FXThruster';
import { BackgroundGrid } from './examples/spaceshooter/renderer/Background';
import {
    EntityObject3D,
    assetPath,
    useParticleEffect,
} from './examples/spaceshooter/utils/RenderUtils';
import { getPlayerColor } from './gui/fixtures/player-colors';
import './gui/styles/reset.css';

const CANVAS_RESIZE = { scroll: true, debounce: { scroll: 50, resize: 0 } };
const CAM_INITIAL_ZOOM = 160;

function Ship() {
    const [shipColor, setShipColor] = useState(0);
    const [respawnTimer, setRespawnTimer] = useState(1);
    const [thrusting, setThrusting] = useState(false);

    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);

    document.addEventListener('keyup', onDocumentKeyUp, false);
    function onDocumentKeyUp(event) {
        const keyCode = event.which;
        if (keyCode == 38) {
            setShipColor((shipColor + 1) % 5);
        }
        if (keyCode == 40) {
            setShipColor((shipColor + 4) % 5);
        }
        if (keyCode == 49) {
            shipRef.current.visible = false;
        }
        if (keyCode == 50) {
            setRespawnTimer(0);
        }
        if (keyCode == 87) {
            setThrusting(!thrusting);
        }
    }

    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        const color = new Color(getPlayerColor(shipColor));
        const group = groupRef.current;
        const ship = shipRef.current as EntityObject3D;

        // color the ship
        ship.children[0].children[0].traverse((child) => {
            if (child instanceof Mesh) {
                child.material.color = color;
            }
        });

        // respawn timer
        if (respawnTimer < 1.1) {
            setRespawnTimer(respawnTimer + deltaTime);
            if (respawnTimer >= 0.35) {
                shipRef.current.visible = true;
            }
        }

        // update thruster effect
        if (thrustRef.current) {
            const pos = new Vector3(-3.5, 0, 0);
            thrustRef.current.particleSystems.forEach((particleObj) => {
                if (thrusting) {
                    particleObj.start();
                    // const rotation = parentObj.children[0].rotation.z;
                    particleObj.setRotation(ship.rotation.z);
                    // Calculate the position based on the angle and offset
                    particleObj.position.x =
                        pos.x * Math.cos(shipRef.current.rotation.z) -
                        pos.y * Math.sin(shipRef.current.rotation.z);
                    particleObj.position.y =
                        pos.x * Math.sin(shipRef.current.rotation.z) +
                        pos.y * Math.cos(shipRef.current.rotation.z);
                } else {
                    particleObj.stop();
                }
                particleObj.update(deltaTime / 2);
            });
        }
    });

    return (
        <group ref={groupRef}>
            <Clone ref={shipRef} object={gltf.scene} scale={1} deep={true} />
        </group>
    );
}

function Particles() {
    const { scene } = useThree();
    const explosionRef = useRef<ExplodeFXHandle>(null!);
    const respawnRef = useRef<SpawnFXHandle>(null!);
    const sparksRef = useRef<SparksFXHandle>(null!);
    const shipImpactRef = useRef<ShipImpactFXHandle>(null!);

    document.addEventListener('keyup', onDocumentKeyUp, false);
    function onDocumentKeyUp(event) {
        const keyCode = event.which;
        if (keyCode == 49) {
            explosionRef.current.triggerExplosion(new Vector3(0, 0, 0), scene);
        }
        if (keyCode == 50) {
            respawnRef.current.triggerSpawn(new Vector3(0, 0, 0), scene);
        }
        if (keyCode == 51) {
            sparksRef.current.triggerSparks(randomInRadius(4));
        }
        if (keyCode == 52) {
            shipImpactRef.current.triggerShipImpact(randomInRadius(4));
        }
    }

    function randomInRadius(radius: number) {
        const rand = Math.random();
        return new Vector3(
            Math.cos(rand * Math.PI * 2) * radius,
            Math.sin(rand * Math.PI * 2) * radius,
            0,
        );
    }

    return (
        <>
            <ExplodeFX ref={explosionRef} />
            <SpawnFX ref={respawnRef} />
            <SparksFX ref={sparksRef} />
            <ShipImpactFX ref={shipImpactRef} />
        </>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            width: '100vw',
            height: '100vh',
        }}
    >
        <Canvas resize={CANVAS_RESIZE}>
            <StarFieldFX />
            <PerspectiveCamera
                makeDefault
                position={[0, 0, CAM_INITIAL_ZOOM]}
                fov={40}
                near={1}
                far={1000}
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
            <BackgroundGrid />
            <Particles />
            <Ship />
        </Canvas>
    </div>,
);
