import { system } from '../../../runtime/ecs';
import { ShooterSchema, Tags } from '../../spaceshooter';
import { DEATH_TIMER } from './bulletSystem';
import { BULLET_DAMAGE } from './shipSystem';

const SCORE_HIT = 0;
const SCORE_KILL = 100;
const TOP_PLAYER_KILL_BONUS = 50;
const MAX_MULTIPLIER = 5;
const HEALTH_REGEN_PERC = 3;

export default system<ShooterSchema>(
    ({ query, players, entity, collider, stats, velocity, deltaTime }) => {
        // regen ship health
        for (const ship of query(Tags.IsShip)) {
            // regen ship health
            if (entity.active[ship] && stats.health[ship] < 100) {
                stats.health[ship] = Math.min(
                    stats.health[ship] + HEALTH_REGEN_PERC,
                    100,
                );
            }
            // tick down the death timer
            const player = players.find((p) => p.ship === ship);
            if (player && player.deathTimer > 0) {
                player.deathTimer = Math.max(
                    Math.fround(player.deathTimer - deltaTime),
                    0,
                );
            }
        }

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
            const hit = collider.hasCollided[bullet];
            if (!hit) {
                continue;
            }

            // ignore if target is not a player ship
            const player = players.find((p) => p.ship === hit);
            if (!player) {
                continue;
            }

            // calc new health
            const targetHealth = Math.max(
                Math.fround(stats.health[hit] - BULLET_DAMAGE),
                0,
            );

            // handle taking damage
            if (stats.health[hit] != targetHealth) {
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
                            hit === topPlayer.ship &&
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
                        shooter.kills++;
                        player.deaths++;
                        // start the death timer
                        player.deathTimer = DEATH_TIMER;
                        velocity.x[hit] = 0;
                        velocity.y[hit] = 0;
                        entity.active[hit] = 0;
                        // reset multiplier
                        player.scoreMul = 1;
                    } else {
                        shooter.score += SCORE_HIT;
                    }
                }
            }

            // update health
            stats.health[hit] = targetHealth;
        }
    },
);
