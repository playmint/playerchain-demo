import { useMemo, useState } from 'react';
import styles from './EndRoundLeaderBoard.module.css';
import EndRoundLeaderBoard from './EndRoundLeaderboard';
import { PlayerInfo } from './PlayerHUD';
import { WorldRef } from './ShooterRenderer';

export default function Countdown({
    player,
    worldRef,
    players,
    peerId,
}: {
    player: PlayerInfo;
    worldRef: WorldRef;
    players: PlayerInfo[];
    peerId: string;
}) {
    const currentTick = 1000;
    const [startTime, setStartTime] = useState(0);
    const [roundTime, setRoundTime] = useState(0);
    const timer = useMemo(() => {
        const date = new Date(0);
        if (currentTick < startTime) {
            return (
                <div
                    style={{
                        flexGrow: 1,
                        marginRight: '1rem',
                        marginLeft: '1rem',
                    }}
                >
                    <span className={styles.countdownText}>
                        {Math.ceil(((startTime - currentTick) / 60) * 3)}
                    </span>
                    <span className={styles.countdownText2}>
                        {Math.ceil(((startTime - currentTick) / 60) * 3)}
                    </span>
                </div>
            );
        } else if (currentTick < roundTime) {
            date.setSeconds(Math.ceil(((roundTime - currentTick) / 60) * 180));
            const timeString = date.toISOString().substring(11, 19);
            return (
                <div
                    style={{
                        position: 'absolute',
                        top: '30px',
                        width: '100%',
                    }}
                >
                    {timeString}
                </div>
            );
        } else {
            if (worldRef.current.components.timer.data.start[player.ship] > 0) {
                if (startTime == 0) {
                    setStartTime(
                        worldRef.current.components.timer.data.start[
                            player.ship
                        ],
                    );
                    console.log('start time set');
                } else if (
                    worldRef.current.components.timer.data.round[player.ship] >
                        0 &&
                    roundTime == 0
                ) {
                    setRoundTime(
                        worldRef.current.components.timer.data.round[
                            player.ship
                        ],
                    );
                    console.log('round time set');
                } else if (startTime > 0 && roundTime > 0) {
                    return (
                        <EndRoundLeaderBoard
                            players={players}
                            peerId={peerId}
                            player={player}
                        />
                    );
                }
            } else {
                return '';
            }
        }
    }, [peerId, player, players, roundTime, startTime, worldRef]);
    return timer;
}
