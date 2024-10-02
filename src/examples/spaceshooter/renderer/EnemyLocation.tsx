import { useEffect, useMemo, useRef, useState } from 'react';
import { getPlayerColorCSS } from '../../../gui/fixtures/player-colors';
// import styles from './EndRoundLeaderBoard.module.css';
import { PlayerInfo } from './PlayerHUD';
import { WorldRef } from './ShooterRenderer';

function Enemy({ x, y, cssColor }: { x: number; y: number; cssColor: string }) {
    const width = 10;
    const height = 10;

    return (
        <div
            style={{
                position: 'absolute',
                left: x - width / 2,
                bottom: y - height / 2,
                width: `${width}px`,
                height: `${height}px`,
                borderRadius: '50%',
                backgroundColor: cssColor,
            }}
        ></div>
    );
}

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
}: {
    worldRef: WorldRef;
    players: PlayerInfo[];
    peerId: string;
}) {
    const componentRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        // Function to update dimensions
        const updateDimensions = () => {
            if (componentRef.current) {
                setDimensions({
                    width: componentRef.current.offsetWidth,
                    height: componentRef.current.offsetHeight,
                });
            }
        };

        // Set initial dimensions
        updateDimensions();

        window.addEventListener('resize', updateDimensions);

        return () => window.removeEventListener('resize', updateDimensions);
    }, []); // Empty dependency array means this effect runs once on mount

    if (!worldRef.current) {
        return null;
    }

    // Memoize this?
    // const playerShip = players.find((player) => player.id === peerId)?.ship;

    const playerShip = players.find((player) => player.id === peerId)?.ship;
    const playerX = playerShip
        ? worldRef.current.components.position.data.x[playerShip]
        : 0;
    const playerY = playerShip
        ? worldRef.current.components.position.data.y[playerShip]
        : 0;

    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const radius = dimensions.height / 2;

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
                            x={x}
                            y={y}
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
