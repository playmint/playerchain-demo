import { memo } from 'react';
import { PlayerData } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
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
}: {
    players: PlayerInfo[];
    peerId: string;
    worldRef: WorldRef;
}) {
    const player = players.find((p) => p.id === peerId);
    if (!player) {
        return null;
    }
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
            <div style={{ flexGrow: 1 }}></div>
            {/* <Countdown
                currentTick={tick}
                player={player}
                worldRef={worldRef}
                players={players}
                peerId={peerId}
            /> */}
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
                    <EnergyBar energy={player.health} />
                </div>
                <div style={{ width: '30%' }}>
                    <LeaderBoard players={players} peerId={peerId} />
                </div>
            </div>
        </div>
    );
});
