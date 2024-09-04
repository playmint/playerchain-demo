import { memo } from 'react';
import { World } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';
import EnergyBar from './EnergyBar';

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
            <div style={{ display: 'flex', marginBottom: '1rem' }}>
                <div style={{ flexGrow: 1 }}>chat</div>
                <div style={{ width: 300 }}>
                    <EnergyBar energy={health} />
                </div>
                <div style={{ flexGrow: 1 }}>Score: {player.score}</div>
            </div>
        </div>
    );
});
