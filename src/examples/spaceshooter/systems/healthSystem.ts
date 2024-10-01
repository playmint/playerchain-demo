import { system } from '../../../runtime/ecs';
import { ShooterSchema, Tags } from '../../spaceshooter';

const SCORE_HIT = 0;
const SCORE_KILL = 100;
const TOP_PLAYER_KILL_BONUS = 50;
const MAX_MULTIPLIER = 5;
const HEALTH_REGEN_PERC = 1;
const HEALTH_REGEN_TIME = 1; // To slow down the regen, increase this number

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
                    if (targetHealth === 0) {
                        // give bonus points for killing the top player
                        const topPlayer = players.reduce((a, b) =>
                            a.score > b.score ? a : b,
                        );

                        if (
                            target === topPlayer.ship &&
                            topPlayer.score > shooter.score
                        ) {
                            shooter.score += TOP_PLAYER_KILL_BONUS;
                        }

                        // give points for kill. Multiply by both players' multipliers
                        shooter.score +=
                            SCORE_KILL * shooter.scoreMul * player.scoreMul;

                        // increase multiplier
                        if (shooter.scoreMul < MAX_MULTIPLIER) {
                            shooter.scoreMul++;
                        }

                        // handle ship kill
                        // start the death timer
                        stats.deathTimer[target] = 200;
                        // mark as exploded and stop
                        stats.hasExploded[target] = 1;
                        // audio.play[target] = AudioClip.Explosion;
                        velocity.x[target] = 0;
                        velocity.y[target] = 0;
                        entity.active[target] = 0;
                        // reset multiplier
                        player.scoreMul = 1;
                    } else {
                        shooter.score += SCORE_HIT;
                    }
                }
            }

            // update health
            stats.health[target] = targetHealth;
        }

        for (const ship of query(Tags.IsShip)) {
            if (stats.health[ship] > 0) {
                stats.regenTimer[ship] = Math.max(
                    Math.fround(stats.regenTimer[ship] - deltaTime),
                    0,
                );

                if (stats.regenTimer[ship] === 0) {
                    stats.regenTimer[ship] = HEALTH_REGEN_TIME;

                    stats.health[ship] = Math.min(
                        stats.health[ship] + HEALTH_REGEN_PERC,
                        100,
                    );
                }
            }

            // tick down the death timer
            stats.deathTimer[ship] = Math.max(
                Math.fround(stats.deathTimer[ship] - deltaTime),
                0,
            );
        }
    },
);
