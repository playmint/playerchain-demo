import { system } from '../../../runtime/ecs';
import { CubesSchema, Input, ObjectType, Tags, hasInput } from '../../cubes';

// system that runs the logic each tick
export default system<CubesSchema>(
    ({ query, object, position, rotation, players, addEntity, addTag }) => {
        // create a spinner if missing
        let spinner = query(Tags.IsSpinner)[0];
        if (!spinner) {
            spinner = addEntity();
            addTag(spinner, Tags.IsSpinner);
            object.type[spinner] = ObjectType.SpinnyBox;
            object.size[spinner] = 1;
            position.x[spinner] = 0;
            position.y[spinner] = 2.5;
            position.z[spinner] = 0;
            rotation.x[spinner] = 0;
            rotation.y[spinner] = 0;
            rotation.z[spinner] = 0;
        } else {
            // make the spinner spin so we know we're still alive
            rotation.x[spinner] += 0.1;
            rotation.y[spinner] += 0.1;
            rotation.z[spinner] += 0.1;
        }
        object.color[spinner] = 0xff2222;

        for (const player of players) {
            // find or create a box for the player
            if (!player.box) {
                player.box = addEntity();
                addTag(player.box, Tags.IsPlayerCube);
                object.type[player.box] = ObjectType.PlayerBox;
                object.size[player.box] = 0.5;
                position.x[player.box] = 0;
                position.y[player.box] = 0;
                position.z[player.box] = 0;
                rotation.x[player.box] = 0;
                rotation.y[player.box] = 0;
                rotation.z[player.box] = 0;
            }
            object.color[player.box] = player.color;

            // handle input to move the player's box
            const speed = 0.4;
            if (hasInput(player.input, Input.Forward)) {
                position.y[player.box] += speed;
            } else if (hasInput(player.input, Input.Back)) {
                position.y[player.box] -= speed;
            }
            if (hasInput(player.input, Input.Left)) {
                position.x[player.box] -= speed;
            } else if (hasInput(player.input, Input.Right)) {
                position.x[player.box] += speed;
            }
        }
    },
);
