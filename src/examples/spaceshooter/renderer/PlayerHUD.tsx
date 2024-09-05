import { memo } from 'react';
import { PlayerData, World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import EnergyBar from './EnergyBar';
import LeaderBoard from './LeaderBoard';

type PlayerDataWithId = PlayerData<ShooterSchema['player']> & { id: string };

export default memo(function PlayerHUD({
    peerId,
    world,
}: {
    world: World<ShooterSchema>;
    peerId: string;
}) {
    const player = world.players.get(peerId);
    if (!player) {
        return null;
    }
    const health = world.components.stats.data.health[player.ship];
    const players = Array.from(world.players.entries()).map((p) => ({
        id: p[0],
        ...p[1],
    })) as PlayerDataWithId[];
    // console.log('updating player hud');
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
                    <EnergyBar energy={health} />
                </div>
                <div style={{ width: '30%' }}>
                    <LeaderBoard players={players} peerId={peerId} />
                </div>
            </div>
        </div>
    );
});
