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

export default system<ShooterSchema>(
    ({
        query,
        rotation,
        physics,
        collider,
        entity,
        position,
        velocity,
        deltaTime,
    }) => {
        const bodies = query(Tags.IsSolidBody);
        const steps = Math.ceil(100 * deltaTime); // number of times we check physics between updates
        // console.log('steps', steps);

        // apply physics
        for (let i = 0; i < steps; i++) {
            for (const eid of bodies) {
                if (i === 0) {
                    collider.hasCollided[eid] = 0; // reset collision flag
                    collider.collisionEntity[eid] = 0; // reset collision flag
                }

                // set position based on velocity
                position.x[eid] = Math.fround(
                    position.x[eid] + (velocity.x[eid] * deltaTime) / steps,
                );
                position.y[eid] = Math.fround(
                    position.y[eid] + (velocity.y[eid] * deltaTime) / steps,
                );
                if (Number.isNaN(position.x[eid])) {
                    throw new Error('BANG');
                }
                const velocityMagnitude = Math.sqrt(
                    velocity.x[eid] ** 2 + velocity.y[eid] ** 2,
                );
                if (velocityMagnitude > physics.maxVelocity[eid]) {
                    const normalizedvelocity = NormalizeVector2({
                        x: velocity.x[eid],
                        y: velocity.y[eid],
                    });
                    velocity.x[eid] = Math.fround(
                        normalizedvelocity.x * physics.maxVelocity[eid],
                    );
                    velocity.y[eid] = Math.fround(
                        normalizedvelocity.y * physics.maxVelocity[eid],
                    );
                }

                // Apply drag based on fixedUpdates
                // velocity.x[eid] *= 1-(physics.drag[eid]/fixedUpdates);
                // velocity.y[eid] *= 1-(physics.drag[eid]/fixedUpdates);

                // handle collisions of circles -> stuff
                if (
                    collider.type[eid] === ColliderType.Circle &&
                    entity.active[eid]
                ) {
                    for (const otherBody of bodies) {
                        if (eid === otherBody) {
                            // ignore self
                            continue;
                        }
                        if (!entity.active[otherBody]) {
                            // ignore invisible entities
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
                        if (entity.parent[otherBody]) {
                            if (
                                entity.parent[otherBody] === entity.parent[eid]
                            ) {
                                // don't collide with siblings
                                continue;
                            }
                        }
                        if (collider.type[otherBody] === ColliderType.Circle) {
                            collideCircle(eid, otherBody, {
                                physics,
                                velocity,
                                position,
                                collider,
                            });
                        } else if (
                            collider.type[otherBody] === ColliderType.Box
                        ) {
                            collideBox(eid, otherBody, {
                                physics,
                                velocity,
                                position,
                                rotation,
                                collider,
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
        physics,
        velocity,
        position,
        collider,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'physics' | 'collider' | 'velocity' | 'position'
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

    const distance = Math.sqrt(
        (circle1.center.x - circle2.center.x) ** 2 +
            (circle1.center.y - circle2.center.y) ** 2,
    );
    // console.log('check', distance, circle1, circle2);
    if (distance < circle1.radius + circle2.radius) {
        // Handle collision
        collider.hasCollided[thisEid] = 1;
        collider.collisionEntity[thisEid] = thatEid;
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
        if (
            physics.isTrigger[thisEid] === 0 &&
            physics.isTrigger[thatEid] === 0
        ) {
            // bullets (etc) shouldn't push ships around
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
        physics,
        velocity,
        position,
        rotation,
        collider,
    }: Pick<
        SystemArgs<ShooterSchema>,
        'physics' | 'collider' | 'velocity' | 'position' | 'rotation'
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
        // const collisionvelocity =
        // {
        //     x: collision.normal.x * Math.abs(velocity.x),
        //     y: collision.normal.y * Math.abs(velocity.y)
        // }
        // velocity.x[thisEid] += collisionvelocity.x * (1+physics.bounciness[thisEid]);
        // velocity.y[thisEid] += collisionvelocity.y * (1+physics.bounciness[thisEid]);

        velocity.x[thisEid] = Math.fround(
            reflectedvelocity.x * physics.bounciness[thisEid],
        );
        velocity.y[thisEid] = Math.fround(
            reflectedvelocity.y * physics.bounciness[thisEid],
        );

        // Adjust position slightly to prevent sticking
        // const collisionDirection: Vector2 = {
        //     x: Math.fround(circle.center.x - collision.point.x),
        //     y: Math.fround(circle.center.y - collision.point.y),
        // };
        // const normalizedCollisionDirection =
        //     NormalizeVector2(collisionDirection);
        position.x[thisEid] = Math.fround(
            collision.point.x + collision.normal.x * circle.radius,
        );
        position.y[thisEid] = Math.fround(
            collision.point.y + collision.normal.y * circle.radius,
        );

        if (physics.applyRotation[thisEid]) {
            // Rotate the object to match the new velocity
            rotation.z[thisEid] = Math.atan2(
                velocity.y[thisEid],
                velocity.x[thisEid],
            );
        }
        return;
    }
}
