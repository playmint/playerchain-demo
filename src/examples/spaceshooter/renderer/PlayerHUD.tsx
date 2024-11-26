import { memo, useEffect, useState } from 'react';
import platform from 'runtime:platform';
import {
    FIXED_UPDATE_RATE,
    SIM_END,
} from '../../../gui/components/ChannelView';
import { PlayerData } from '../../../runtime/ecs';
import { DefaultMetrics } from '../../../runtime/metrics';
import { SESSION_TIME_SECONDS, ShooterSchema } from '../../spaceshooter';
import Chat from './Chat';
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
    peerNames,
}: {
    playersRef: PlayersRef;
    peerId: string;
    worldRef: WorldRef;
    metrics?: DefaultMetrics;
    peerNames: Record<string, string>;
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
        }, 500);
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
            }}
        >
            <div></div>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    flexWrap: 'nowrap',
                    justifyContent: 'space-between',
                    alignItems: 'stretch',
                    alignContent: 'stretch',
                    height: '100%',
                }}
            >
                {/* Top row */}
                <div
                    style={{
                        display: 'flex',
                        flexGrow: 0,
                        flexShrink: 1,
                        padding: '1.5rem',
                        justifyContent: 'center',
                    }}
                >
                    {player && <EnergyBar energy={player.health} />}
                </div>
                {/* Middle row */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '1.5rem',
                    }}
                >
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
                </div>
                {/* Bottom row */}
                <div
                    style={{
                        display: 'flex',
                        flexGrow: 0,
                        flexShrink: 1,
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        padding: '1.5rem',
                    }}
                >
                    <div
                        style={{
                            flex: 1,
                            maxWidth: '33%',
                            overflowWrap: 'break-word',
                        }}
                    >
                        {!platform.isMobile && (
                            <Chat
                                peerNames={peerNames}
                                players={playersRef.current}
                            />
                        )}
                    </div>

                    <div
                        style={{
                            flex: 1,
                            fontSize: '1.25rem',
                            textAlign: 'center',
                        }}
                    >
                        {remaining > 0 && (
                            <>
                                {String(Math.floor(remaining / 60)).padStart(
                                    2,
                                    '0',
                                )}
                                :
                                {String(Math.ceil(remaining % 60)).padStart(
                                    2,
                                    '0',
                                )}
                            </>
                        )}
                    </div>
                    <div style={{ flex: 1 }}>
                        {remaining !== 0 && !platform.isMobile && (
                            <LeaderBoard
                                players={playersRef.current}
                                peerId={peerId}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});
