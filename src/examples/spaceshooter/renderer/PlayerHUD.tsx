import { memo, useEffect, useState } from 'react';
import {
    FIXED_UPDATE_RATE,
    SIM_END,
} from '../../../gui/components/ChannelView';
import { PlayerData } from '../../../runtime/ecs';
import { DefaultMetrics } from '../../../runtime/metrics';
import { SESSION_TIME_SECONDS, ShooterSchema } from '../../spaceshooter';
import ReadySetGo from './Countdown';
import EndRoundLeaderBoard from './EndRoundLeaderboard';
import EnergyBar from './EnergyBar';
import LeaderBoard from './LeaderBoard';
import PlayAgainButton from './PlayAgainButton';
import { PlayersRef, WorldRef } from './ShooterRenderer';

export type PlayerInfo = Omit<PlayerData<ShooterSchema['player']>, 'input'> & {
    id: string;
    name: string;
    health: number;
};

export default memo(function PlayerHUD({
    peerId,
    playersRef,
    worldRef,
    metrics,
}: {
    playersRef: PlayersRef;
    peerId: string;
    worldRef: WorldRef;
    metrics?: DefaultMetrics;
}) {
    const [remaining, setRemaining] = useState(-1);
    useEffect(() => {
        const timer = setInterval(() => {
            if (!worldRef.current) {
                return;
            }
            const tick = worldRef.current.t;
            const remainingTicks = Math.max(0, SIM_END - tick);
            const remainingSeconds =
                remainingTicks * (FIXED_UPDATE_RATE / 1000);
            // format as MM:SS with leading zeros
            if (remainingSeconds === 0) {
                metrics?.cps.disable();
            }
            setRemaining(remainingSeconds);
        }, 1000);
        return () => clearInterval(timer);
    }, [worldRef, metrics]);

    const player = playersRef.current?.find((p) => p.id === peerId);
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                color: 'white',
                display: 'flex',
                flexDirection: 'column',
                textAlign: 'center',
            }}
        >
            <div></div>
            <div style={{ flexGrow: 1 }}>
                {remaining > 0 && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '30px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            padding: '10px',
                            fontSize: '20px',
                        }}
                    >
                        {String(Math.floor(remaining / 60)).padStart(2, '0')}:
                        {String(Math.ceil(remaining % 60)).padStart(2, '0')}
                    </div>
                )}
            </div>
            {remaining > 0 && SESSION_TIME_SECONDS - remaining < 3 ? (
                <ReadySetGo
                    n={3 - Math.floor(SESSION_TIME_SECONDS - remaining)}
                />
            ) : remaining === 0 ? (
                <>
                    <EndRoundLeaderBoard players={playersRef.current} />
                    <PlayAgainButton />
                </>
            ) : null}
            {remaining !== 0 && (
                <div
                    style={{
                        display: 'flex',
                        alignContent: 'center',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ width: '30%' }}></div>
                    <div
                        style={{
                            position: 'absolute',
                            top: '30px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '50%',
                            maxWidth: '300px',
                        }}
                    >
                        {player && <EnergyBar energy={player.health} />}
                    </div>
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '30px',
                            right: '30px',
                            width: 'auto',
                        }}
                    >
                        <LeaderBoard
                            players={playersRef.current}
                            peerId={peerId}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});
