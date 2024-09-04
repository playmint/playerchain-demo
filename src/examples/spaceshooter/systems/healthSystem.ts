import { system } from '../../../runtime/ecs';
import { ShooterSchema, Tags } from '../../spaceshooter';

const SCORE_HIT = 1;
const SCORE_KILL = 1000;

export default system<ShooterSchema>(
    ({ query, players, entity, collider, stats, velocity, deltaTime }) => {
        // for each thing that can give damage...
        for (const bullet of query(Tags.IsBullet)) {
            // ignore invisible bullets
            if (!entity.active[bullet]) {
                continue;
            }
            // ignore if already dead
            if (stats.health[bullet] <= 0) {
                continue;
            }
            // ignore if not currently colliding
            if (!collider.hasCollided[bullet]) {
                continue;
            }
            const target = collider.collisionEntity[bullet];

            // calc new health
            const targetHealth = Math.max(
                Math.fround(stats.health[target] - stats.damage[bullet]),
                0,
            );

            const player = players.find((p) => p.ship === target);

            // ignore if target is not a player ship
            if (!player) {
                continue;
            }

            // handle taking damage
            if (stats.health[target] != targetHealth) {
                // give points for hitting and kills
                const shooter = players.find(
                    (p) => p.ship === entity.parent[bullet],
                );
                if (shooter) {
                    shooter.score +=
                        targetHealth === 0 ? SCORE_KILL : SCORE_HIT;
                    // handle ship kill
                    if (targetHealth === 0) {
                        // start the death timer
                        stats.deathTimer[target] = 200;
                        // mark as exploded and stop
                        stats.hasExploded[target] = 1;
                        // audio.play[target] = AudioClip.Explosion;
                        velocity.x[target] = 0;
                        velocity.y[target] = 0;
                        entity.active[target] = 0;
                    }
                }
            }

            // update health
            stats.health[target] = targetHealth;
        }

        // tick down the death timer
        for (const ship of query(Tags.IsShip)) {
            stats.deathTimer[ship] = Math.max(
                Math.fround(stats.deathTimer[ship] - deltaTime),
                0,
            );
        }
    },
);
