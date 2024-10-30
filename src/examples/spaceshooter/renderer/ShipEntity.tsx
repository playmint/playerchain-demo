import {
    Clone,
    Cylinder,
    Html,
    PositionalAudio,
    useGLTF,
} from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useRef, useState } from 'react';
import {
    Color,
    DoubleSide,
    Group,
    Mesh,
    Object3DEventMap,
    PositionalAudio as PositionalAudioImpl,
    Vector3,
} from 'three';
import { getPlayerColor } from '../../../gui/fixtures/player-colors';
import { Input, Tags, hasInput } from '../../spaceshooter';
import sfxDestroy from '../assets/Destroy.mp3?url';
import sfxThrust from '../assets/Thrust_Loop.mp3?url';
import shipGLTF from '../assets/ship.glb?url';
import { ExplodeFX, ExplodeFXHandle } from '../effects/FXExplodeQuarks';
import { SpawnFX, SpawnFXHandle } from '../effects/FXRespawnQuarks';
import fxShootData from '../effects/FXShoot';
import { SparksFX, SparksFXHandle } from '../effects/FXSparksQuarks';
import fxThrusterData from '../effects/FXThruster';
import {
    EntityObject3D,
    InterpolateSpeed,
    assetPath,
    interpolate,
    interpolateEntityPosition,
    interpolateEntityRotation,
    interpolateEntityVisibility,
    updateEntityGeneration,
    useParticleEffect,
} from '../utils/RenderUtils';
import { PlayersRef, WorldRef } from './ShooterRenderer';

export default memo(function ShipEntity({
    eid,
    worldRef,
    playersRef,
    peerId,
}: {
    eid: number;
    worldRef: WorldRef;
    playersRef: PlayersRef;
    peerId: string;
}) {
    const [color, setColor] = useState<Color>();
    const getShipOwner = () =>
        Array.from(worldRef.current.players.entries()).find(
            ([_id, p]) => p.ship === eid,
        ) || [undefined, undefined];
    const groupRef = useRef<Group>(null!);
    const shipRef = useRef<Group<Object3DEventMap>>(null!);
    const thrustRef = useParticleEffect(groupRef, fxThrusterData, [-3.5, 0, 0]);
    const explosionRef = useRef<ExplodeFXHandle>(null!);
    const explosionSfxRef = useRef<PositionalAudioImpl>(null!);
    const thrustSfxRef = useRef<PositionalAudioImpl>(null!);
    const respawnRef = useRef<SpawnFXHandle>(null!);
    const shootRef = useParticleEffect(shipRef, fxShootData, [0, 0, 0]);
    const sparksRef = useRef<SparksFXHandle>(null!);
    const labelRef = useRef<HTMLDivElement>(null!);
    const prevHealthRef = useRef<number | null>(null);
    const markerRef = useRef<Group>(null!);
    const isTopPlayerRef = useRef(false);

    const gltf = useGLTF(assetPath(shipGLTF));
    useEffect(() => {
        if (!gltf) {
            return;
        }
        gltf.scene.scale.set(1, 1, 1);
    }, [gltf]);

    useFrame(({ camera }, deltaTime) => {
        const world = worldRef.current;
        const players = playersRef.current;
        const [ownerId, player] = getShipOwner();
        const isPeerShip = ownerId === peerId;
        const playerIdx = players.findIndex((p) => p.id === ownerId);
        const sortedPlayers = [...players].sort((a, b) => a.score - b.score);
        const topPlayer = sortedPlayers[sortedPlayers.length - 1];

        const group = groupRef.current;
        const ship = shipRef.current as EntityObject3D;
        if (!player) {
            return;
        }

        if (playerIdx > -1 && !color) {
            const playerColor = new Color(
                getPlayerColor(playerIdx) ?? '#ffffff',
            );
            setColor(playerColor);
        }

        // color the ship
        if (color && !(ship as any).__colored) {
            ship.children[0].children[0].traverse((child) => {
                if (child instanceof Mesh) {
                    child.material.color = color;
                    (ship as any).__colored = true;
                }
            });
        }

        isTopPlayerRef.current =
            sortedPlayers.length > 1 &&
            player.ship === topPlayer.ship &&
            topPlayer.score > sortedPlayers[sortedPlayers.length - 2].score;

        // hide ship if not active (not the whole group, just the ship)
        interpolateEntityVisibility(ship, world, eid, 24);
        // lerp ship
        interpolateEntityPosition(
            group,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Fastest,
        );
        const rotationBefore = ship.rotation.z;
        interpolateEntityRotation(
            ship,
            world,
            eid,
            deltaTime,
            InterpolateSpeed.Fastest,
        );
        const rotationDiff = ship.rotation.z - rotationBefore;

        // show ship marker if this ship offscreen
        markerRef.current.visible = false;
        if (!isPeerShip && ship.visible) {
            const indicatorPos = new Vector3(
                camera.position.x,
                camera.position.y,
                group.position.z,
            );
            const shipPos = new Vector3(
                group.position.x,
                group.position.y,
                group.position.z,
            );
            // const lineFromCameraToShip = new Line3(cameraPos, shipPos);
            // move point towards the ship
            indicatorPos.sub(
                indicatorPos
                    .clone()
                    .sub(shipPos)
                    .normalize()
                    .multiplyScalar(34),
            );
            // if the point is in the frustum, set the marker position and show it
            markerRef.current.visible = true;
            markerRef.current.position.x = indicatorPos.x;
            markerRef.current.position.y = indicatorPos.y;
            markerRef.current.position.z = indicatorPos.z;
            markerRef.current.lookAt(
                new Vector3(
                    group.position.x,
                    group.position.y,
                    markerRef.current.position.z,
                ),
            );
        }

        // apply ship roll if we are turning
        const shipInner = ship.children[0].children[0];
        const roll =
            rotationDiff > 0.02 ? -0.75 : rotationDiff < -0.02 ? 0.75 : 0;
        shipInner.rotation.x = interpolate(
            shipInner.rotation.x,
            roll,
            deltaTime,
            InterpolateSpeed.Quick,
        );

        // flash ship if we lost health
        const health = world.components.stats.data.health[eid];
        if (
            prevHealthRef.current === null ||
            world.components.entity.data.generation[eid] !== ship.__generation
        ) {
            prevHealthRef.current = health;
        }

        // Flashing is currently affected by firing bullets and not needed with 1-hit kills
        /*
        if (health > 0) {
            if (health < prevHealthRef.current) {
                // took damage
                ship.children[0].children[0].traverse((child) => {
                    if (child instanceof Mesh) {
                        child.material.emissive = new Color(0.5, 0.5, 0.5);
                    }
                });
            }
        }


        // fade ship color back to normal
        ship.children[0].children[0].traverse((child) => {
            if (child instanceof Mesh) {
                if (child.material.emissive.r > 0) {
                    child.material.emissive = new Color(
                        Math.max(child.material.emissive.r - deltaTime, 0),
                        Math.max(child.material.emissive.g - deltaTime, 0),
                        Math.max(child.material.emissive.b - deltaTime, 0),
                    );
                }
            }
        });
        */

        // create wall sparks
        const hit = world.components.collider.data.hasCollided[eid];
        if (hit && world.hasTag(hit, Tags.IsWall)) {
            if (sparksRef.current) {
                const pos = new Vector3(
                    world.components.collider.data.collisionPointX[eid],
                    world.components.collider.data.collisionPointY[eid],
                    2,
                );
                sparksRef.current.triggerSparks(pos);
                // We should maybe have a sound for this too
            }
        }

        // update thruster effect (if accelerating)
        if (thrustRef.current) {
            const accelerating =
                ship.visible && hasInput(player.input, Input.Forward);
            if (accelerating) {
                thrustRef.current.n = 3;
            } else if (thrustRef.current.n > 0) {
                thrustRef.current.n -= 1;
            }
            const pos = new Vector3(-3.5, 0, 0);
            thrustRef.current.particleSystems.forEach((particleObj) => {
                if (thrustRef.current!.n > 0) {
                    particleObj.start();
                    if (!thrustSfxRef.current.isPlaying) {
                        thrustSfxRef.current.play();
                    }
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
                    thrustSfxRef.current.stop();
                }
                particleObj.update(deltaTime / 2);
            });
        }

        // run explosion effect (if we died)
        if (explosionRef.current) {
            const exploding = prevHealthRef.current > 0 && health <= 0;
            if (exploding) {
                const pos = groupRef.current.position.clone();
                if (explosionRef.current) {
                    if (labelRef.current) {
                        labelRef.current.style.opacity = '0';
                    }
                    explosionRef.current.triggerExplosion(pos);
                }
                // make noise too
                if (!explosionSfxRef.current.isPlaying) {
                    explosionSfxRef.current.play();
                }
            }
        }

        // run respawn effect if generation changed
        if (respawnRef.current) {
            const respawned =
                world.components.entity.data.generation[eid] !==
                ship.__generation;
            if (respawned && world.components.entity.data.active[eid]) {
                const pos = new Vector3(0, 0, 2);
                if (respawnRef.current) {
                    respawnRef.current.triggerSpawn(pos, shipRef.current);
                    if (labelRef.current) {
                        labelRef.current.style.opacity = '1';
                    }
                }
            }
        }

        // run shoot vfx if shooting
        if (shootRef.current) {
            const shooting = hasInput(player.input, Input.Fire);
            shootRef.current.particleSystems.forEach((particleObj) => {
                particleObj.update(deltaTime);
                if (shooting && !particleObj.isPlaying) {
                    const pos = new Vector3(4.2, 0, 0);
                    particleObj.setPosition(pos);
                    particleObj.start();
                }
            });
        }

        // update label
        if (labelRef.current) {
            const label =
                `${isTopPlayerRef.current ? '👑' : ''}` +
                (players[playerIdx].scoreMul > 1
                    ? `&nbsp;x${players[playerIdx].scoreMul}<br/>`
                    : '') +
                (players[playerIdx]?.name || peerId.slice(0, 8));
            // cache txt on element obj to avoid DOM updates if not needed
            if ((labelRef.current as any).__label !== label) {
                (labelRef.current as any).__label = label;
                labelRef.current.innerHTML = label;
            }
        }
        // mark prev states
        updateEntityGeneration(group, world, eid);
        updateEntityGeneration(ship, world, eid);
        prevHealthRef.current = health;
    });

    return (
        <>
            <group ref={groupRef}>
                <ExplodeFX ref={explosionRef} />
                <SpawnFX ref={respawnRef} />
                <SparksFX ref={sparksRef} />
                <Clone
                    ref={shipRef}
                    object={gltf.scene}
                    scale={1}
                    deep={true}
                />
                <Html
                    zIndexRange={[0, 100]}
                    ref={labelRef}
                    style={{
                        fontSize: 11,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        textAlign: 'center',
                        transition: 'opacity 1s',
                    }}
                    position={[3, 5, 0]}
                ></Html>
                <PositionalAudio
                    ref={explosionSfxRef}
                    url={assetPath(sfxDestroy)}
                    distance={500}
                    loop={false}
                />
                <PositionalAudio
                    ref={thrustSfxRef}
                    url={assetPath(sfxThrust)}
                    distance={500}
                    loop={false}
                />
            </group>
            <group ref={markerRef}>
                <Cylinder
                    args={[3, 1, 2, 3]}
                    position={[0, 0, 0]}
                    rotation={[0, 0, Math.PI / 2]}
                    scale={[0.4, 0.5, 0.5]}
                >
                    <meshBasicMaterial
                        attach="material"
                        color={color || 'red'}
                        side={DoubleSide}
                    />
                </Cylinder>
            </group>
        </>
    );
});
