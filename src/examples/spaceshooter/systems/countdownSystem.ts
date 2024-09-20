import { system } from "../../../runtime/ecs";
import { Input, ShooterSchema, hasInput } from "../../spaceshooter";

export default system<ShooterSchema>(
    ({
        t,
        players,
        timer,
        deltaTime,
    }) => {
        players.forEach((player) => {
            if (hasInput(player.input, Input.StartTimer)) {
                // start countdown timer:
                players.forEach((player) => {
                    timer.start[player.ship] = t+(3/deltaTime);
                    timer.round[player.ship] = 0;
                });
            }
            if(timer.start[player.ship] !=0 && t > timer.start[player.ship] && timer.round[player.ship] === 0) {
                // start round timer:
                players.forEach((player) => {
                    timer.round[player.ship] = t+(180/deltaTime);
                });
            }
        });
    },
);