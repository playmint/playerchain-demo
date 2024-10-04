import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Vector3 } from 'three';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
import { PlayerInfo } from './PlayerHUD';
import { WorldRef } from './ShooterRenderer';

const INDICTOR_WIDTH = 20;
const INDICTOR_HEIGHT = 20;

function getAngleRad(ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.atan2(dy, dx);
}

function polarToCartesian(
    centerX: number,
    centerY: number,
    radius: number,
    angleRad: number,
) {
    return {
        x: centerX + radius * Math.cos(angleRad),
        y: centerY + radius * Math.sin(angleRad),
    };
}

export default function EnemyLocation({
    worldRef,
    players,
    peerId,
    camera,
}: {
    worldRef: WorldRef;
    players: PlayerInfo[];
    peerId: string;
    camera?: Camera;
}) {
    const componentRef = useRef<HTMLDivElement>(null);
    const currentRef = componentRef.current;
    const [viewDimensions, setViewDimensions] = useState({
        width: 0,
        height: 0,
    });
    const [viewDiagonal, setViewDiagonal] = useState(0);

    useEffect(() => {
        if (!currentRef) {
            return;
        }
        // Function to update dimensions
        const updateDimensions = () => {
            if (componentRef.current) {
                setViewDimensions({
                    width: componentRef.current.offsetWidth,
                    height: componentRef.current.offsetHeight,
                });
                setViewDiagonal(
                    Math.sqrt(
                        componentRef.current.offsetWidth ** 2 +
                            componentRef.current.offsetHeight ** 2,
                    ),
                );
            }
        };

        // Set initial dimensions
        updateDimensions();

        window.addEventListener('resize', updateDimensions);

        return () => window.removeEventListener('resize', updateDimensions);
    }, [currentRef]);

    if (!worldRef.current) {
        return null;
    }
    if (!camera) {
        return null;
    }

    const playerShip = players.find((player) => player.id === peerId)?.ship;
    const playerX = playerShip
        ? worldRef.current.components.position.data.x[playerShip]
        : 0;
    const playerY = playerShip
        ? worldRef.current.components.position.data.y[playerShip]
        : 0;

    const centerX = viewDimensions.width / 2;
    const centerY = viewDimensions.height / 2;
    const radius = viewDiagonal / 2;

    return (
        <div
            ref={componentRef}
            style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
            }}
        >
            {players.map((player, playerIdx) => {
                if (player.id !== peerId) {
                    const enemyX =
                        worldRef.current.components.position.data.x[
                            player.ship
                        ];
                    const enemyY =
                        worldRef.current.components.position.data.y[
                            player.ship
                        ];

                    // If the enemy is in the frustum, don't render indicator
                    camera.updateMatrixWorld();
                    const projectedPos = new Vector3(enemyX, enemyY, 0).project(
                        camera,
                    );

                    // If in view don't show indicator
                    if (
                        projectedPos.x > -1 &&
                        projectedPos.x < 1 &&
                        projectedPos.y > -1 &&
                        projectedPos.y < 1
                    ) {
                        return null;
                    }

                    const angle = getAngleRad(playerX, playerY, enemyX, enemyY);
                    const { x, y } = polarToCartesian(
                        centerX,
                        centerY,
                        radius,
                        angle,
                    );

                    return (
                        <Enemy
                            key={player.id}
                            x={Math.min(
                                viewDimensions.width - INDICTOR_WIDTH,
                                Math.max(x, 0),
                            )}
                            y={Math.min(
                                viewDimensions.height - INDICTOR_HEIGHT,
                                Math.max(y, 0),
                            )}
                            angle={angle}
                            cssColor={getPlayerColorCSS(playerIdx)}
                        />
                    );
                } else {
                    return null;
                }
            })}
        </div>
    );
}

function Enemy({
    x,
    y,
    angle,
    cssColor,
}: {
    x: number;
    y: number;
    angle: number;
    cssColor: string;
}) {
    const adjustedAngle = angle - Math.PI / 2; // SVG points up
    const angleDeg = adjustedAngle * (180 / Math.PI);

    return (
        <div
            style={{
                position: 'absolute',
                display: 'relative',
                left: x,
                bottom: y,
                width: `${INDICTOR_WIDTH}px`,
                height: `${INDICTOR_HEIGHT}px`,
            }}
        >
            <svg
                style={{
                    width: '100%',
                    height: '100%',
                    top: 0,
                    left: 0,
                    position: 'absolute',
                    transform: `rotate(${-angleDeg}deg)`,
                }}
                viewBox="0 0 700 700"
                preserveAspectRatio="none"
            >
                <path d="M350,0 700,700 350,550 0,700" fill={cssColor} />
            </svg>
        </div>
    );
}
