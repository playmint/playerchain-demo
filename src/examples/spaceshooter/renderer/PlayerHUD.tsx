import { memo, useEffect, useState } from 'react';
import {
    FIXED_UPDATE_RATE,
    SIM_END,
} from '../../../gui/components/ChannelView';
import { PlayerData } from '../../../runtime/ecs';
import { SESSION_TIME_SECONDS, ShooterSchema } from '../../spaceshooter';
import ReadySetGo from './Countdown';
import EndRoundLeaderBoard from './EndRoundLeaderboard';
import EndSessionButton from './EndSessionButton';
import EnergyBar from './EnergyBar';
import LeaderBoard from './LeaderBoard';
import { WorldRef } from './ShooterRenderer';

export type PlayerInfo = Omit<PlayerData<ShooterSchema['player']>, 'input'> & {
    id: string;
    name: string;
    health: number;
};

export default memo(function PlayerHUD({
    peerId,
    players,
    worldRef,
}: {
    players: PlayerInfo[];
    peerId: string;
    worldRef: WorldRef;
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
            setRemaining(remainingSeconds);
        }, 500);
        return () => clearInterval(timer);
    }, [worldRef]);

    const player = players.find((p) => p.id === peerId);
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
                    <div style={{ padding: 10 }}>
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
                    <EndRoundLeaderBoard players={players} />
                    <EndSessionButton />
                </>
            ) : null}
            {remaining !== 0 && (
                <div
                    style={{
                        display: 'flex',
                        marginBottom: '1rem',
                        alignContent: 'center',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    <div style={{ width: '30%' }}></div>
                    <div
                        style={{
                            flexGrow: 1,
                            marginRight: '1rem',
                            marginLeft: '1rem',
                        }}
                    >
                        {player && <EnergyBar energy={player.health} />}
                    </div>
                    <div style={{ width: '30%' }}>
                        <LeaderBoard players={players} peerId={peerId} />
                    </div>
                </div>
            )}
        </div>
    );
});
