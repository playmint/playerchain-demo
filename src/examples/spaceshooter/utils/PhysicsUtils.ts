export interface Vector2 {
    x: number;
    y: number;
}

export interface Circle {
    center: Vector2;
    radius: number;
}

export interface Rectangle {
    a: Vector2;
    b: Vector2;
    c: Vector2;
    d: Vector2;
}

export interface Collision {
    collision: boolean;
    point: Vector2;
    normal: Vector2;
}

export function reflectVector(velocity: Vector2, normal: Vector2): Vector2 {
    const dotProduct = velocity.x * normal.x + velocity.y * normal.y;
    return {
        x: Math.fround(velocity.x - 2 * dotProduct * normal.x),
        y: Math.fround(velocity.y - 2 * dotProduct * normal.y),
    };
}

export function perpendicularVector(
    velocity: Vector2,
    normal: Vector2,
): Vector2 {
    const dotProduct = velocity.x * normal.x + velocity.y * normal.y;
    const projection = {
        x: dotProduct * normal.x,
        y: dotProduct * normal.y,
    };
    return {
        x: Math.fround(velocity.x - projection.x),
        y: Math.fround(velocity.y - projection.y),
    };
}

function crossProduct(p1: Vector2, p2: Vector2): number {
    return Math.fround(p1.x * p2.y - p1.y * p2.x);
}

function subtractPoints(p1: Vector2, p2: Vector2): Vector2 {
    return { x: Math.fround(p1.x - p2.x), y: Math.fround(p1.y - p2.y) };
}

export function pointInRectangle(
    point: Vector2,
    rectangle: Rectangle,
): boolean {
    const { a, b, c, d } = rectangle;
    const AB = subtractPoints(b, a);
    const AP = subtractPoints(point, a);
    const BC = subtractPoints(c, b);
    const BP = subtractPoints(point, b);
    const CD = subtractPoints(d, c);
    const CP = subtractPoints(point, c);
    const DA = subtractPoints(a, d);
    const DP = subtractPoints(point, d);

    const cross1 = crossProduct(AB, AP);
    const cross2 = crossProduct(BC, BP);
    const cross3 = crossProduct(CD, CP);
    const cross4 = crossProduct(DA, DP);

    return (
        (cross1 <= 0 && cross2 <= 0 && cross3 <= 0 && cross4 <= 0) ||
        (cross1 >= 0 && cross2 >= 0 && cross3 >= 0 && cross4 >= 0)
    );
}

function distanceSquared(p1: Vector2, p2: Vector2): number {
    return Math.fround((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

function dotProduct(p1: Vector2, p2: Vector2): number {
    return Math.fround(p1.x * p2.x + p1.y * p2.y);
}

function intersectCircle(
    circle: Circle,
    segment: [Vector2, Vector2],
): { intersects: boolean; closestPoint: Vector2 } {
    const { center, radius } = circle;
    const [p1, p2] = segment;

    let closestPoint: Vector2;
    const segmentLengthSquared = distanceSquared(p1, p2);
    if (segmentLengthSquared === 0) {
        closestPoint = p1;
    } else {
        const t = Math.max(
            0,
            Math.min(
                1,
                dotProduct(
                    { x: center.x - p1.x, y: center.y - p1.y },
                    { x: p2.x - p1.x, y: p2.y - p1.y },
                ) / segmentLengthSquared,
            ),
        );

        closestPoint = {
            x: Math.fround(p1.x + t * (p2.x - p1.x)),
            y: Math.fround(p1.y + t * (p2.y - p1.y)),
        };
    }

    return {
        intersects:
            distanceSquared(center, closestPoint) <= Math.fround(radius ** 2),
        closestPoint: closestPoint,
    };
}

function getNormal(p1: Vector2, p2: Vector2): Vector2 {
    const edge = { x: Math.fround(p2.x - p1.x), y: Math.fround(p2.y - p1.y) };
    const normal = { x: edge.y, y: -edge.x }; // Rotate the edge vector 90 degrees to get the normal
    return NormalizeVector2(normal); // Normalize the normal vector
}

export function intersectCircleRectangle(
    circle: Circle,
    rectangle: Rectangle,
    velocity: Vector2,
): Collision {
    const { center, radius } = circle;
    const { a, b, c, d } = rectangle;

    let intersectEdge = intersectCircle({ center, radius }, [a, b]);
    if (intersectEdge.intersects) {
        // bottom edge
        const normal = getNormal(a, b);
        return {
            collision: true,
            point: intersectEdge.closestPoint,
            normal: normal,
        };
    }
    intersectEdge = intersectCircle({ center, radius }, [b, c]);
    if (intersectEdge.intersects) {
        // right edge
        const normal = getNormal(b, c);
        return {
            collision: true,
            point: intersectEdge.closestPoint,
            normal: normal,
        };
    }
    intersectEdge = intersectCircle({ center, radius }, [c, d]);
    if (intersectEdge.intersects) {
        // top edge
        const normal = getNormal(c, d);
        return {
            collision: true,
            point: intersectEdge.closestPoint,
            normal: normal,
        };
    }
    intersectEdge = intersectCircle({ center, radius }, [d, a]);
    if (intersectEdge.intersects) {
        // left edge
        const normal = getNormal(d, a);
        return {
            collision: true,
            point: intersectEdge.closestPoint,
            normal: normal,
        };
    }
    if (pointInRectangle(center, rectangle)) {
        // console.log('too far inside geometry - wind it back');
        const normalizedVelocity = NormalizeVector2(velocity);
        const newPoint = {
            x: Math.fround(center.x - normalizedVelocity.x * radius),
            y: Math.fround(center.y - normalizedVelocity.y * radius),
        };
        return intersectCircleRectangle(
            { center: newPoint, radius: radius },
            rectangle,
            velocity,
        );
    } else {
        return {
            collision: false,
            point: circle.center,
            normal: { x: 0, y: 0 },
        };
    }
}

export function NormalizeVector2(
    vector: Vector2,
    preCalculatedMag?: number,
): Vector2 {
    const magnitude =
        preCalculatedMag ??
        Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    return {
        x: Math.fround(vector.x / magnitude),
        y: Math.fround(vector.y / magnitude),
    };
}
