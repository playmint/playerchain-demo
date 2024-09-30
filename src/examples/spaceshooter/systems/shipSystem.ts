import { EntityId, SystemArgs, system } from '../../../runtime/ecs';
import {
    ColliderType,
    Input,
    ModelType,
    ShooterSchema,
    Tags,
    hasInput,
} from '../../spaceshooter';

export const SHIP_THRUST_RATE = 100;
export const SHIP_ROTATION_RATE = Math.fround(Math.PI / 0.7);
export const SHIP_RESPAWN_RADIUS = 400;
export const SHIP_MAX_VELOCITY = 80;

export default system<ShooterSchema>(
    ({
        t,
        rotation,
        players,
        addEntity,
        addTag,
        physics,
        position,
        model,
        collider,
        stats,
        entity,
        velocity,
        deltaTime,
        timer,
    }) => {
        // create a ship entity for each player
        for (const player of players) {
            // find or create a box for the player
            if (!player.ship) {
                player.ship = addShip({
                    addEntity,
                    addTag,
                    position,
                    physics,
                    model,
                    collider,
                    stats,
                    entity,
                });
                // set round timer:
                timer.round[player.ship] = 0;
            }

            // reset ship stats
            stats.hasExploded[player.ship] = 0;
            stats.hasRespawned[player.ship] = 0;

            // respawn ship if requested or if it's the first spawn generation
            if (
                hasInput(player.input, Input.Respawn) ||
                entity.generation[player.ship] === 0
            ) {
                console.log('respawning ship');
                resetShip(player.ship, {
                    model,
                    position,
                    rotation,
                    velocity,
                    stats,
                    entity,
                });
            }
            if (entity.active[player.ship] && timer.round[player.ship] > t) {
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
    physics,
    model,
    position,
    collider,
    stats,
    entity,
}: Pick<
    SystemArgs<ShooterSchema>,
    | 'addEntity'
    | 'addTag'
    | 'physics'
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
    stats.shootTimer[eid] = 0;
    // stats.canShoot[eid] = 1;
    position.x[eid] = eid / 100;
    collider.type[eid] = ColliderType.Circle;
    collider.radius[eid] = 3;
    physics.applyRotation[eid] = 0;
    physics.drag[eid] = 0.01;
    physics.bounciness[eid] = 0.25;
    stats.health[eid] = 100;
    stats.deathTimer[eid] = 200;
    stats.hasExploded[eid] = 0;
    stats.hasRespawned[eid] = 0;
    stats.multiplier[eid] = 1;
    entity.generation[eid] = 0;
    // stats.initialSpawn[eid] = 1;

    // Pool 20 bullets:
    for (let i = 0; i < 20; i++) {
        addBullet(eid, {
            addEntity,
            addTag,
            model,
            stats,
            physics,
            collider,
            entity,
        });
    }

    console.log('new ship eid: ', eid);
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
        physics,
        collider,
    }: Pick<
        SystemArgs<ShooterSchema>,
        | 'addEntity'
        | 'addTag'
        | 'entity'
        | 'model'
        | 'stats'
        | 'physics'
        | 'collider'
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
    physics.applyRotation[eid] = 1;
    physics.drag[eid] = 0;
    physics.isTrigger[eid] = 1;
    physics.bounciness[eid] = 1;
    stats.damage[eid] = 34;
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
    // const randomPoint = getRandomPointOnCircle(SHIP_RESPAWN_RADIUS);
    // position.x[eid] = randomPoint.x;
    // position.y[eid] = randomPoint.y;
    position.x[eid] = eid * 0.01;
    position.y[eid] = 0;
    rotation[eid] = 0;
    velocity.x[eid] = 0;
    velocity.y[eid] = 0;
    // LastUpdated[eid] = { lastUpdated: 0 };
    stats.shootTimer[eid] = 0;
    // stats.canShoot[eid] = 1;
    stats.health[eid] = 100;
    stats.hasRespawned[eid] = 1; // use generation instead?
    // stats.initialSpawn[eid] = 0; // use generation instead
    entity.generation[eid]++;
}

// FIXME: needs determinisitic
// function getRandomPointOnCircle(radius) {
//     const angle = Math.fround(Math.random() * 2 * Math.PI); // Random angle between 0 and 2π
//     const x = Math.fround(radius * Math.cos(angle)); // X-coordinate
//     const y = Math.fround(radius * Math.sin(angle)); // Y-coordinate

//     return { x: x, y: y };
// }
