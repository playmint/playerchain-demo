import '@fontsource-variable/recursive/mono.css';
import '@fontsource/material-symbols-outlined';
import { Clone, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
    Color,
    Group,
    LinearFilter,
    Mesh,
    NearestFilter,
    Object3DEventMap,
    SRGBColorSpace,
    Scene,
    Vector3,
    WebGLRenderTarget,
} from 'three';
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
    ShockwaveFX,
    ShockwaveFXHandle,
} from './examples/spaceshooter/effects/FXShockwaveQuarks';
import {
    SparksFX,
    SparksFXHandle,
} from './examples/spaceshooter/effects/FXSparksQuarks';
import { StarFieldFX } from './examples/spaceshooter/effects/FXStarfieldQuarks';
import fxThrusterData from './examples/spaceshooter/effects/FXThruster';
import { BackgroundModels } from './examples/spaceshooter/renderer/BackgroundModels';
import { BufferSceneRenderer } from './examples/spaceshooter/renderer/BufferSceneRenderer';
import useBulletModel from './examples/spaceshooter/renderer/BulletModel';
import { FPSLimiter } from './examples/spaceshooter/renderer/FPSLimiter';
import { getShakeOffset } from './examples/spaceshooter/renderer/ShakeManager';
import WallModels from './examples/spaceshooter/renderer/WallModels';
import { SHIP_MAX_VELOCITY } from './examples/spaceshooter/systems/shipSystem';
import {
    EntityObject3D,
    InterpolateSpeed,
    assetPath,
    interpolate,
    useParticleEffect,
} from './examples/spaceshooter/utils/RenderUtils';
import { getPlayerColor } from './gui/fixtures/player-colors';
import './gui/styles/reset.css';

const CANVAS_RESIZE = { scroll: true, debounce: { scroll: 50, resize: 0 } };
const CAM_INITIAL_ZOOM = 160;
const RENDER_BUFFER_SCENE = false; // Set to true to show hidden particles for warp effect!

function Ship() {
    const [shipColor, setShipColor] = useState(0);
    const [respawnTimer, setRespawnTimer] = useState(1);
    const [thrusting, setThrusting] = useState(false);

    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);

    useEffect(() => {
        document.addEventListener('keyup', onDocumentKeyUp, false);
        function onDocumentKeyUp(event) {
            const keyCode = event.which;
            if (keyCode == 67) {
                setShipColor((shipColor + 1) % 5);
            }
            if (keyCode == 86) {
                setShipColor((shipColor + 4) % 5);
            }
            if (keyCode == 49) {
                shipRef.current.visible = false;
                setThrusting(false);
            }
            if (keyCode == 50) {
                setRespawnTimer(0);
            }
            if (keyCode == 87) {
                setThrusting(!thrusting);
            }
        }
    }, [shipColor, thrusting]);

    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);

    useFrame((_state, deltaTime) => {
        const color = new Color(getPlayerColor(shipColor));
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
            const pos = new Vector3(40 - 3.5, 0, 0);
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
            <Clone
                ref={shipRef}
                object={gltf.scene}
                position={[40, 0, 0]}
                scale={1}
                deep={true}
            />
        </group>
    );
}

function Particles(props: { bufferScene: Scene }) {
    const { scene } = useThree();
    const explosionRef = useRef<ExplodeFXHandle>(null!);
    const shockwaveRef = useRef<ShockwaveFXHandle>(null!);
    const respawnRef = useRef<SpawnFXHandle>(null!);
    const sparksRef = useRef<SparksFXHandle>(null!);
    const shipImpactRef = useRef<ShipImpactFXHandle>(null!);

    useEffect(() => {
        function onDocumentKeyUp(event: KeyboardEvent) {
            const keyCode = event.which;
            if (keyCode === 49) {
                explosionRef.current.triggerExplosion(new Vector3(40, 0, 0));
            }
            if (keyCode === 50) {
                respawnRef.current.triggerSpawn(new Vector3(40, 0, 0), scene);
            }
            if (keyCode === 51) {
                sparksRef.current.triggerSparks(
                    randomInRadius(4).add(new Vector3(40, 0, 0)),
                );
            }
            if (keyCode === 52) {
                shipImpactRef.current.triggerShipImpact(
                    randomInRadius(4).add(new Vector3(40, 0, 0)),
                );
            }
        }

        // Add the event listener
        document.addEventListener('keyup', onDocumentKeyUp);

        // Cleanup function to remove the event listener when the component unmounts
        return () => {
            document.removeEventListener('keyup', onDocumentKeyUp);
        };
    }, [scene]);

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
            <ShockwaveFX ref={shockwaveRef} scene={props.bufferScene} />
            <SpawnFX ref={respawnRef} />
            <SparksFX ref={sparksRef} />
            <ShipImpactFX ref={shipImpactRef} />
        </>
    );
}

function Bullet() {
    const bullet = useBulletModel(0);
    return <Clone object={bullet} position={[60, 0, -1]} deep />;
}

function Diorama() {
    const [velocity, setVelocity] = useState(0);
    const [camPos, setCamPos] = useState(new Vector3(0, 0, CAM_INITIAL_ZOOM));
    const [camVel, setCamVel] = useState(new Vector3(0, 0, 0));
    const { scene } = useThree();
    const bufferScene = useMemo(() => new Scene(), []);
    const bufferTarget = useMemo(() => {
        const target = new WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: LinearFilter,
                magFilter: NearestFilter,
                colorSpace: SRGBColorSpace,
            },
        );
        return target;
    }, []);

    useEffect(() => {
        document.addEventListener('keyup', onDocumentKeyUp, false);
        document.addEventListener('keydown', onDocumentKeyDown, false);
        function onDocumentKeyUp(event) {
            const keyCode = event.which;
            if (keyCode == 90) {
                setVelocity(
                    velocity > 0 ? 0 : Math.sqrt(SHIP_MAX_VELOCITY * 10),
                );
            }
            if (keyCode == 37 || keyCode == 39) {
                setCamVel(new Vector3(0, camVel.y, camVel.z));
            }
            if (keyCode == 40 || keyCode == 38) {
                setCamVel(new Vector3(camVel.x, 0, camVel.z));
            }
        }

        function onDocumentKeyDown(event) {
            const keyCode = event.which;
            if (keyCode == 37) {
                setCamVel(new Vector3(-100, camVel.y, camVel.z));
            }
            if (keyCode == 39) {
                setCamVel(new Vector3(100, camVel.y, camVel.z));
            }
            if (keyCode == 38) {
                setCamVel(new Vector3(camVel.x, 100, camVel.z));
            }
            if (keyCode == 40) {
                setCamVel(new Vector3(camVel.x, -100, camVel.z));
            }
        }
    }, [camVel, velocity]);

    useFrame(({ camera }, deltaTime) => {
        setCamPos(camPos.add(camVel.clone().multiplyScalar(deltaTime)));
        camera.position.set(camPos.x, camPos.y, camPos.z);

        // zoom out based on velocity
        const vmag = velocity;
        const zoom = CAM_INITIAL_ZOOM + vmag * 2;
        camera.position.z = interpolate(
            camera.position.z,
            zoom,
            deltaTime,
            InterpolateSpeed.Snap,
        );

        // Apply shake offset to the camera
        const shakeOffset = getShakeOffset(camPos, deltaTime);
        camera.position.add(shakeOffset);
    });

    return (
        <>
            <BackgroundModels rotation={[1.5708, 0, 0]} />
            <FPSLimiter fps={60} />
            <StarFieldFX />
            <PerspectiveCamera
                makeDefault
                position={[0, 0, CAM_INITIAL_ZOOM]}
                fov={40}
                near={1}
                far={2000}
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

            {/* <BackgroundGrid /> */}
            <Particles
                bufferScene={RENDER_BUFFER_SCENE ? scene : bufferScene}
            />
            <Ship />
            <Bullet />
            <BufferSceneRenderer
                bufferScene={bufferScene}
                bufferTarget={bufferTarget}
            />
            <WallModels />
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
            <Diorama />
        </Canvas>
    </div>,
);
