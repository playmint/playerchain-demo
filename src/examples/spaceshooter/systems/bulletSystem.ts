import { system } from '../../../runtime/ecs';
import { Input, ShooterSchema, Tags, hasInput } from '../../spaceshooter';

export const BULLET_SPEED = 80;
export const BULLET_MAX_VELOCITY = 80;
export const BULLET_LIFETIME = 18;
export const SHIP_SHOOT_COOLOFF = 2;
export const BULLET_HEALTH_COST = 15;

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
        timer,
    }) => {
        const bullets = query(Tags.IsBullet);

        // check bullet collisions
        for (const bullet of bullets) {
            // skip inactive entities
            if (!entity.active[bullet]) {
                continue;
            }

            // CHECKME I THINK I MESSED THIS UP IN THE PORT
            if (
                collider.hasCollided[bullet] &&
                hasTag(collider.collisionEntity[bullet], Tags.IsShip)
            ) {
                // && IsBullet[physics.collisionEntity[bullet]])
                // stats.health[bullet] = 0;
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

            // No shooting if either round hasn't started (round == 0) or round has ended (t > round)
            if (timer.round[player.ship] <= t) {
                return;
            }

            // run down the shoot timer
            if (stats.shootTimer[player.ship] > 0) {
                stats.shootTimer[player.ship] = Math.fround(
                    stats.shootTimer[player.ship] - deltaTime,
                );
            } else if (stats.shootTimer[player.ship] < 0) {
                stats.shootTimer[player.ship] = 0;
            }

            // fire if can
            if (
                entity.active[player.ship] &&
                hasInput(player.input, Input.Fire) &&
                stats.shootTimer[player.ship] === 0 &&
                stats.health[player.ship] > BULLET_HEALTH_COST
            ) {
                // find an available bullet
                const bullet = bullets.find(
                    (eid) =>
                        entity.parent[eid] === player.ship &&
                        !entity.active[eid],
                );
                if (!bullet) {
                    console.log('no bullets');
                    continue;
                }
                stats.health[player.ship] -= BULLET_HEALTH_COST;
                stats.shootTimer[player.ship] = SHIP_SHOOT_COOLOFF;
                position.x[bullet] = position.x[player.ship];
                position.y[bullet] = position.y[player.ship];
                rotation.z[bullet] = rotation.z[player.ship];
                velocity.x[bullet] = Math.fround(
                    velocity.x[player.ship] +
                        Math.cos(rotation.z[player.ship]) * BULLET_SPEED,
                );
                velocity.y[bullet] = Math.fround(
                    velocity.y[player.ship] +
                        Math.sin(rotation.z[player.ship]) * BULLET_SPEED,
                );

                stats.health[bullet] = BULLET_LIFETIME; // Bullet "health" is lifetime of bullet before disappearing
                entity.generation[bullet] += 1;
                entity.active[bullet] = 1;
            }
        }
    },
);
     