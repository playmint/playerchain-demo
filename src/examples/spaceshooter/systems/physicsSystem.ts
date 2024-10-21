import { EntityId, SystemArgs, system } from '../../../runtime/ecs';
import { ColliderType, ShooterSchema, Tags } from '../../spaceshooter';
import {
    Circle,
    Collision,
    NormalizeVector2,
    Rectangle,
    Vector2,
    intersectCircleRectangle,
    reflectVector,
} from '../utils/PhysicsUtils';
import { BULLET_MAX_VELOCITY } from './bulletSystem';
import {
    BULLET_BOUNCINESS,
    SHIP_BOUNCINESS,
    SHIP_MAX_VELOCITY,
} from './shipSystem';

export default system<ShooterSchema>(
    ({
        query,
        hasTag,
        rotation,
        collider,
        entity,
        position,
        velocity,
        deltaTime,
    }) => {
        const bodies = query(Tags.IsSolidBody);
        const otherBodies = bodies.filter(
            (eid) => !hasTag(eid, Tags.IsBullet) && entity.active[eid],
        );
        const steps = 1; // number of times we check physics between updates

        // apply physics
        for (let i = 0; i < steps; i++) {
            for (const eid of bodies) {
                //reset
                if (i === 0) {
                    collider.hasCollided[eid] = 0;
                }

                // skip inactive entities
                if (!entity.active[eid]) {
                    continue;
                }

                // we only care about ships and bullets
                if (!(hasTag(eid, Tags.IsBullet) || hasTag(eid, Tags.IsShip))) {
                    continue;
                }

                // set position based on velocity
                const velocityMagnitude = Math.sqrt(
                    velocity.x[eid] ** 2 + velocity.y[eid] ** 2,
                );
                const maxVelocity = hasTag(eid, Tags.IsBullet)
                    ? BULLET_MAX_VELOCITY
                    : hasTag(eid, Tags.IsShip)
                      ? SHIP_MAX_VELOCITY
                      : 10;
                if (velocityMagnitude > maxVelocity) {
                    const normalizedvelocity = NormalizeVector2(
                        {
                            x: velocity.x[eid],
                            y: velocity.y[eid],
                        },
                        velocityMagnitude,
                    );
                    velocity.x[eid] = Math.fround(
                        normalizedvelocity.x * maxVelocity,
                    );
                    velocity.y[eid] = Math.fround(
                        normalizedvelocity.y * maxVelocity,
                    );
                }
                position.x[eid] = Math.fround(
                    position.x[eid] + (velocity.x[eid] * deltaTime) / steps,
                );
                position.y[eid] = Math.fround(
                    position.y[eid] + (velocity.y[eid] * deltaTime) / steps,
                );

                // handle collisions of circles -> stuff
                if (
                    collider.type[eid] === ColliderType.Circle &&
                    entity.active[eid]
                ) {
                    for (const otherBody of otherBodies) {
                        if (eid === otherBody) {
                            // ignore self
                            continue;
                        }
                        if (entity.parent[eid] === otherBody) {
                            // don't collide with our own parent
                            continue;
                        }
                        if (eid === entity.parent[otherBody]) {
                            // don't collide with our own children
                            continue;
                        }
                        if (
                            entity.parent[otherBody] &&
                            entity.parent[otherBody] === entity.parent[eid]
                        ) {
                            // don't collide with siblings
                            continue;
                        }
                        if (collider.type[otherBody] === ColliderType.Circle) {
                            collideCircle(eid, otherBody, {
                                velocity,
                                position,
                                collider,
                                hasTag,
                            });
                        } else if (
                            collider.type[otherBody] === ColliderType.Box
                        ) {
                            collideBox(eid, otherBody, {
                                velocity,
                                position,
                                rotation,
                                collider,
                                hasTag,
                            });
                        }
                    }
                }
            }
        }
    },
);

function collideCircle(
    thisEid: EntityId,
    thatEid: EntityId,
    {
        velocity,
        position,
        collider,
        hasTag,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'collider' | 'velocity' | 'position' | 'hasTag'
    >,
) {
    // Detect collisions with other circles
    const vel = {
        x: velocity.x[thisEid],
        y: velocity.y[thisEid],
    };
    const circle1: Circle = {
        center: {
            x: position.x[thisEid],
            y: position.y[thisEid],
        },
        radius: collider.radius[thisEid],
    };
    const circle2 = {
        center: {
            x: position.x[thatEid],
            y: position.y[thatEid],
        },
        radius: collider.radius[thatEid],
    };

    // cull out early if we can
    if (
        Math.abs(circle1.center.x - circle2.center.x) >
        circle1.radius + circle2.radius
    ) {
        return;
    }
    if (
        Math.abs(circle1.center.y - circle2.center.y) >
        circle1.radius + circle2.radius
    ) {
        return;
    }

    const distance = Math.sqrt(
        (circle1.center.x - circle2.center.x) ** 2 +
            (circle1.center.y - circle2.center.y) ** 2,
    );
    // console.log('check', distance, circle1, circle2);
    if (distance < circle1.radius + circle2.radius) {
        // Handle collision
        collider.hasCollided[thisEid] = thatEid;
        const collisionDirection: Vector2 = {
            x: circle1.center.x - circle2.center.x,
            y: circle1.center.y - circle2.center.y,
        };
        const normalizedCollisionDirection =
            NormalizeVector2(collisionDirection);
        const collisionPoint = {
            x: Math.fround(
                circle2.center.x +
                    (normalizedCollisionDirection.x || 0) *
                        (circle2.radius + circle1.radius),
            ),
            y: Math.fround(
                circle2.center.y +
                    (normalizedCollisionDirection.y || 0) *
                        (circle2.radius + circle1.radius),
            ),
        };
        // console.log('collisionPoint', collisionPoint);

        collider.collisionPointX[thisEid] = collisionPoint.x;
        collider.collisionPointY[thisEid] = collisionPoint.y;

        if (!hasTag(thisEid, Tags.IsBullet)) {
            // bullets don't push ships
            position.x[thisEid] = collisionPoint.x;
            position.y[thisEid] = collisionPoint.y;

            velocity.x[thisEid] = velocity.x[thatEid];
            velocity.y[thisEid] = velocity.y[thatEid];
            velocity.x[thatEid] = vel.x;
            velocity.y[thatEid] = vel.y;
        }
        return;
    }
}

function collideBox(
    thisEid: EntityId,
    thatEid: EntityId,
    {
        velocity,
        position,
        rotation,
        collider,
        hasTag,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'collider' | 'velocity' | 'position' | 'rotation' | 'hasTag'
    >,
) {
    // Detect collisions with walls
    const point: Vector2 = {
        x: position.x[thisEid],
        y: position.y[thisEid],
    };
    const circle = {
        center: point,
        radius: collider.radius[thisEid],
    };

    const rect: Rectangle = {
        a: {
            x: collider.aX[thatEid],
            y: collider.aY[thatEid],
        },
        b: {
            x: collider.bX[thatEid],
            y: collider.bY[thatEid],
        },
        c: {
            x: collider.cX[thatEid],
            y: collider.cY[thatEid],
        },
        d: {
            x: collider.dX[thatEid],
            y: collider.dY[thatEid],
        },
    };
    const vel = {
        x: velocity.x[thisEid],
        y: velocity.y[thisEid],
    };
    const collision: Collision = intersectCircleRectangle(circle, rect, {
        x: velocity.x[thisEid],
        y: velocity.y[thisEid],
    });
    if (collision.collision) {
        const reflectedvelocity = reflectVector(vel, collision.normal);

        const bounciness = hasTag(thisEid, Tags.IsBullet)
            ? BULLET_BOUNCINESS
            : hasTag(thisEid, Tags.IsShip)
              ? SHIP_BOUNCINESS
              : 0;
        velocity.x[thisEid] = Math.fround(reflectedvelocity.x * bounciness);
        velocity.y[thisEid] = Math.fround(reflectedvelocity.y * bounciness);

        position.x[thisEid] = Math.fround(
            collision.point.x + collision.normal.x * circle.radius,
        );
        position.y[thisEid] = Math.fround(
            collision.point.y + collision.normal.y * circle.radius,
        );
        collider.hasCollided[thisEid] = thatEid;
        collider.collisionPointX[thisEid] = collision.point.x;
        collider.collisionPointY[thisEid] = collision.point.y;

        if (hasTag(thisEid, Tags.IsBullet)) {
            // Rotate the object to match the new velocity
            rotation.z[thisEid] = Math.atan2(
                velocity.y[thisEid],
                velocity.x[thisEid],
            );
        }
        return;
    }
}
