import { EntityId, SystemArgs, system } from '../../../runtime/ecs';
import {
    ColliderType,
    Input,
    ModelType,
    SESSION_START_SECONDS,
    SESSION_TIME_SECONDS,
    ShooterSchema,
    Tags,
    hasInput,
} from '../../spaceshooter';
import level from '../levels/level_1';


export const SHIP_THRUST_RATE = 73;
export const SHIP_ROTATION_RATE = Math.fround(Math.PI / 0.75);
export const SHIP_RESPAWN_RADIUS = level.spawnRadius;
export const SHIP_MAX_VELOCITY = 70;
export const BULLET_DAMAGE = 100;
export const BULLET_BOUNCINESS = 1;
export const SHIP_BOUNCINESS = 0.85;

export default system<ShooterSchema>(
    ({
        t,
        rotation,
        players,
        addEntity,
        addTag,
        position,
        model,
        collider,
        stats,
        entity,
        velocity,
        deltaTime,
    }) => {
        const sessionEnd = SESSION_TIME_SECONDS / deltaTime;
        const sessionStart = SESSION_START_SECONDS / deltaTime;
        // create a ship entity for each player
        for (const player of players) {
            // find or create a box for the player
            if (!player.ship) {
                player.ship = addShip({
                    addEntity,
                    addTag,
                    position,
                    model,
                    collider,
                    stats,
                    entity,
                });
            }

            // respawn ship if requested or if it's the first spawn generation
            if (
                hasInput(player.input, Input.Respawn) ||
                (stats.health[player.ship] === 0 && player.deathTimer) === 0 ||
                entity.generation[player.ship] === 0
            ) {
                resetShip(player.ship, {
                    model,
                    position,
                    rotation,
                    velocity,
                    stats,
                    entity,
                });
            }

            // apply thrust/rotation
            if (
                entity.active[player.ship] &&
                t < sessionEnd &&
                t > sessionStart
            ) {
                // calc thurst for input
                const thrust = hasInput(player.input, Input.Forward)
                    ? SHIP_THRUST_RATE
                    : hasInput(player.input, Input.Back)
                      ? -(SHIP_THRUST_RATE * 0.1) // reverse thrust is weaker
                      : 0;

                // apply ship rotation
                if (hasInput(player.input, Input.Left)) {
                    rotation.z[player.ship] = Math.fround(
                        rotation.z[player.ship] +
                            SHIP_ROTATION_RATE * deltaTime,
                    );
                } else if (hasInput(player.input, Input.Right)) {
                    rotation.z[player.ship] = Math.fround(
                        rotation.z[player.ship] -
                            SHIP_ROTATION_RATE * deltaTime,
                    );
                }

                // apply thrust in direction
                velocity.x[player.ship] = Math.fround(
                    velocity.x[player.ship] +
                        Math.cos(rotation.z[player.ship]) * thrust * deltaTime,
                );
                velocity.y[player.ship] = Math.fround(
                    velocity.y[player.ship] +
                        Math.sin(rotation.z[player.ship]) * thrust * deltaTime,
                );
            }
        }
    },
);

function addShip({
    addEntity,
    addTag,
    model,
    position,
    collider,
    stats,
    entity,
}: Pick<
    SystemArgs<ShooterSchema>,
    | 'addEntity'
    | 'addTag'
    | 'position'
    | 'model'
    | 'collider'
    | 'stats'
    | 'entity'
>): EntityId {
    const eid = addEntity();
    addTag(eid, Tags.IsShip);
    addTag(eid, Tags.IsSolidBody); // let physics move this entity
    model.type[eid] = ModelType.Ship;
    entity.active[eid] = 0;
    position.x[eid] = eid / 100;
    collider.type[eid] = ColliderType.Circle;
    collider.radius[eid] = 3.5;
    stats.health[eid] = 100;
    entity.generation[eid] = 0;

    // Pool bullets:
    for (let i = 0; i < 10; i++) {
        addBullet(eid, {
            addEntity,
            addTag,
            model,
            stats,
            collider,
            entity,
        });
    }

    return eid;
}

function addBullet(
    shipEid: EntityId,
    {
        addEntity,
        addTag,
        entity,
        model,
        stats,
        collider,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'addEntity' | 'addTag' | 'entity' | 'model' | 'stats' | 'collider'
    >,
): EntityId {
    const eid = addEntity();
    addTag(eid, Tags.IsBullet);
    addTag(eid, Tags.IsSolidBody); // let physics move this entity
    entity.parent[eid] = shipEid;
    model.type[eid] = ModelType.Bullet;
    entity.active[eid] = 0;
    collider.type[eid] = ColliderType.Circle;
    collider.radius[eid] = 0.9;
    stats.health[eid] = 100;
    return eid;
}

function resetShip(
    eid: EntityId,
    {
        position,
        rotation,
        velocity,
        stats,
        entity,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'model' | 'position' | 'rotation' | 'velocity' | 'stats' | 'entity'
    >,
) {
    entity.active[eid] = 1;
    const randomPoint = getRandomPointOnCircle(SHIP_RESPAWN_RADIUS);
    position.x[eid] = randomPoint.x;
    position.y[eid] = randomPoint.y;

    // point the ship to the center
    rotation.z[eid] = Math.atan2(-position.y[eid], -position.x[eid]);

    velocity.x[eid] = 0;
    velocity.y[eid] = 0;
    stats.health[eid] = 100;
    entity.generation[eid]++;
}

function getRandomPointOnCircle(radius) {
    const angle = Math.fround(Math.random() * 2 * Math.PI); // Random angle between 0 and 2π
    const x = Math.fround(radius * Math.cos(angle)); // X-coordinate
    const y = Math.fround(radius * Math.sin(angle)); // Y-coordinate

    return { x: x, y: y };
}
