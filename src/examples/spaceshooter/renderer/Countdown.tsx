import { useMemo, useState } from 'react';
import styles from './EndRoundLeaderBoard.module.css';
import EndRoundLeaderBoard from './EndRoundLeaderboard';
import { PlayerInfo } from './PlayerHUD';
import { WorldRef } from './ShooterRenderer';

export default function Countdown(props: {
    currentTick: number;
    player: PlayerInfo;
    worldRef: WorldRef;
    players: PlayerInfo[];
    peerId: string;
}) {
    const [startTime, setStartTime] = useState(0);
    const [roundTime, setRoundTime] = useState(0);
    const timer = useMemo(() => {
        const date = new Date(0);
        if (props.currentTick < startTime) {
            return (
                <div
                    style={{
                        flexGrow: 1,
                        marginRight: '1rem',
                        marginLeft: '1rem',
                    }}
                >
                    <span className={styles.countdownText}>
                        {Math.ceil(((startTime - props.currentTick) / 60) * 3)}
                    </span>
                    <span className={styles.countdownText2}>
                        {Math.ceil(((startTime - props.currentTick) / 60) * 3)}
                    </span>
                </div>
            );
        } else if (props.currentTick < roundTime) {
            date.setSeconds(
                Math.ceil(((roundTime - props.currentTick) / 60) * 180),
            );
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
            if (
                props.worldRef.current.components.timer.data.start[
                    props.player.ship
                ] > 0
            ) {
                if (startTime == 0) {
                    setStartTime(
                        props.worldRef.current.components.timer.data.start[
                            props.player.ship
                        ],
                    );
                    console.log('start time set');
                } else if (
                    props.worldRef.current.components.timer.data.round[
                        props.player.ship
                    ] > 0 &&
                    roundTime == 0
                ) {
                    setRoundTime(
                        props.worldRef.current.components.timer.data.round[
                            props.player.ship
                        ],
                    );
                    console.log('round time set');
                } else if (startTime > 0 && roundTime > 0) {
                    return null;
                    return (
                        <EndRoundLeaderBoard
                            players={props.players}
                            peerId={props.peerId}
                            player={props.player}
                        />
                    );
                }
            } else {
                return '';
            }
        }
    }, [
        props.currentTick,
        props.peerId,
        props.player,
        props.players,
        props.worldRef,
        roundTime,
        startTime,
    ]);
    return timer;
}
