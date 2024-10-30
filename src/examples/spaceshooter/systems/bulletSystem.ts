import { system } from '../../../runtime/ecs';
import {
    Input,
    SESSION_START_SECONDS,
    SESSION_TIME_SECONDS,
    ShooterSchema,
    Tags,
    hasInput,
} from '../../spaceshooter';

export const BULLET_SPEED = 120;
export const BULLET_MAX_VELOCITY = 300;
export const BULLET_LIFETIME = 40; // seconds
export const BULLET_HEALTH_COST = 10;
export const BULLET_INHERIT_VELOCITY = 1; //What % velocity do they inherit from firing ship
export const BULLET_COOLDOWN = 3; // ticks

export const DEATH_TIMER = 2; // seconds to wait after death before respawning

export default system<ShooterSchema>(
    ({
        rotation,
        query,
        hasTag,
        collider,
        players,
        stats,
        entity,
        velocity,
        position,
        deltaTime,
        t,
    }) => {
        const sessionEnd = SESSION_TIME_SECONDS / deltaTime;
        const sessionStart = SESSION_START_SECONDS / deltaTime;
        const bullets = query(Tags.IsBullet);

        // check bullet collisions
        for (const bullet of bullets) {
            // inactive bullets stored in the ship
            if (!entity.active[bullet]) {
                position.x[bullet] = position.x[entity.parent[bullet]];
                position.y[bullet] = position.y[entity.parent[bullet]];
                continue;
            }

            const hit = collider.hasCollided[bullet];
            if (hit && hasTag(hit, Tags.IsShip)) {
                position.x[bullet] = collider.collisionPointX[bullet];
                position.y[bullet] = collider.collisionPointY[bullet];
                velocity.x[bullet] = 0;
                velocity.z[bullet] = 0;
                entity.active[bullet] = 0; // hide on hit
                stats.health[bullet] = 0;
            }

            // run down bullet health
            if (stats.health[bullet] === 0) {
                entity.active[bullet] = 0;
            }
            //Destroy bullets when parent ship dies
            else if (stats.health[entity.parent[bullet]] === 0) {
                entity.active[bullet] = 0;
            } else {
                stats.health[bullet] = Math.max(
                    Math.fround(stats.health[bullet] - deltaTime),
                    0,
                );
            }
        }

        // for each player, fire bullets
        for (const player of players) {
            // skip invalid
            if (!player.ship) {
                return;
            }

            // tick down the shoot timer
            if (player.shootTimer > 0) {
                player.shootTimer = player.shootTimer - 1;
            }

            // No shooting if either round hasn't started (round == 0) or round has ended (t > round)
            if (t >= sessionEnd) {
                return;
            }

            // fire if can
            if (
                entity.active[player.ship] &&
                hasInput(player.input, Input.Fire) &&
                stats.health[player.ship] > BULLET_HEALTH_COST &&
                t < sessionEnd &&
                t > sessionStart &&
                player.shootTimer === 0
            ) {
                // find an available bullet
                const bullet = bullets.find(
                    (eid) =>
                        entity.parent[eid] === player.ship &&
                        !entity.active[eid],
                );
                if (!bullet) {
                    continue;
                }
                player.shootTimer = BULLET_COOLDOWN;
                stats.health[player.ship] -= BULLET_HEALTH_COST;

                position.x[bullet] = position.x[player.ship];
                position.y[bullet] = position.y[player.ship];
                rotation.z[bullet] = rotation.z[player.ship];

                const jitter = (bullet % 2) * 0.05 - 0.05;
                velocity.x[bullet] = Math.fround(
                    velocity.x[player.ship] * BULLET_INHERIT_VELOCITY +
                        Math.cos(rotation.z[player.ship] + jitter) *
                            BULLET_SPEED,
                );
                velocity.y[bullet] = Math.fround(
                    velocity.y[player.ship] * BULLET_INHERIT_VELOCITY +
                        Math.sin(rotation.z[player.ship] + jitter) *
                            BULLET_SPEED,
                );

                stats.health[bullet] = BULLET_LIFETIME; // Bullet "health" is lifetime of bullet before disappearing
                entity.generation[bullet] += 1;
                entity.active[bullet] = 1;
            }
        }
    },
);
