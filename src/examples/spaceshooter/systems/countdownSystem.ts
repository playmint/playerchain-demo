import { system } from "../../../runtime/ecs";
import { Input, ShooterSchema, hasInput } from "../../spaceshooter";

export default system<ShooterSchema>(
    ({
        t,
        players,
        startTimer,
        roundTimer,
        deltaTime,
    }) => {
        players.forEach((player) => {
            if (hasInput(player.input, Input.StartTimer)) {
                // start countdown timer:
                players.forEach((player) => {
                    startTimer[player.ship] = t+(3/deltaTime);
                    roundTimer[player.ship] = 0;
                });
            }
            if(t > startTimer[player.ship] && roundTimer[player.ship] === 0) {
                // start round timer:
                players.forEach((player) => {
                    roundTimer[player.ship] = t+(180/deltaTime);
                });
            }
        });
    },
);