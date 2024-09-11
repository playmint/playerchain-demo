import { system } from "../../../runtime/ecs";
import { Input, ShooterSchema, hasInput } from "../../spaceshooter";

export default system<ShooterSchema>(
    ({
        t,
        players,
        startTimer,
    }) => {
        players.forEach((player) => {
            if (hasInput(player.input, Input.StartTimer)) {
                players.forEach((player) => {
                    startTimer[player.ship] = t+100;
                });
            }
        });
    },
);