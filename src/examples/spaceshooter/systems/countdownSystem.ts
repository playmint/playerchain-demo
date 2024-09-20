import { system } from '../../../runtime/ecs';
import { ShooterSchema } from '../../spaceshooter';

export default system<ShooterSchema>(({ t, players, timer, deltaTime }) => {
    if (t === 1) {
        players.forEach((player) => {
            timer.start[player.ship] = t + 3 / deltaTime;
            timer.round[player.ship] = 0;
        });
    } else {
        players.forEach((player) => {
            if (
                timer.start[player.ship] != 0 &&
                t > timer.start[player.ship] &&
                timer.round[player.ship] === 0
            ) {
                // start round timer:
                players.forEach((player) => {
                    timer.round[player.ship] = t + 180 / deltaTime;
                });
            }
        });
    }
});
