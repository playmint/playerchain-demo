import { useEffect, useMemo, useRef, useState } from 'react';
// import styles from './EndRoundLeaderBoard.module.css';
import { PlayerInfo } from './PlayerHUD';
import { WorldRef } from './ShooterRenderer';

function Enemy({ x, y }: { x: number; y: number }) {
    return <div style={{ position: 'absolute', left: x, bottom: y }}>👾</div>;
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
    const radius = 200; // Distance in px from the center

    return (
        <div
            ref={componentRef}
            style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(255, 0, 0, 0.1)',
            }}
        >
            {players.map((player) => {
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
                        <div key={player.id}>
                            {player.id}
                            <br />
                            {`Angle: ${angle.toFixed(2)}°`}
                            <Enemy x={x} y={y} />
                        </div>
                    );
                }
                return (
                    <div key={player.id}>
                        {player.id} (you)
                        <br />
                    </div>
                );
            })}
        </div>
    );
}
