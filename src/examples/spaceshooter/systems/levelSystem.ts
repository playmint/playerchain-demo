import { EntityId, SystemArgs, system } from '../../../runtime/ecs';
import {
    ColliderType,
    ModelType,
    ShooterSchema,
    Tags,
} from '../../spaceshooter';
import level from '../levels/level_1';
import { Rectangle } from '../utils/PhysicsUtils';

export default system<ShooterSchema>(
    ({
        query,
        addEntity,
        addTag,
        model,
        position,
        rotation,
        collider,
        entity,
    }) => {
        // find or create walls for the level
        let walls = query(Tags.IsWall);
        if (walls.length === 0) {
            walls = level.walls.map((wall) =>
                addWall(wall, {
                    addEntity,
                    addTag,
                    model,
                    position,
                    rotation,
                    collider,
                    entity,
                }),
            );
        }

        // do something with walls...
    },
);

interface Wall {
    position: { x: number; y: number };
    width: number;
    rotation: number;
}

function addWall(
    wall: Wall,
    {
        addEntity,
        addTag,
        model,
        position,
        rotation,
        collider,
        entity,
    }: Pick<
        SystemArgs<ShooterSchema>,
        | 'addEntity'
        | 'addTag'
        | 'model'
        | 'position'
        | 'rotation'
        | 'collider'
        | 'entity'
    >,
): EntityId {
    const eid = addEntity();
    addTag(eid, Tags.IsWall);
    addTag(eid, Tags.IsSolidBody);
    position.x[eid] = wall.position.x;
    position.y[eid] = wall.position.y;
    position.z[eid] = 0;
    rotation.z[eid] = wall.rotation;
    console.log('added wall', eid, wall);

    model.type[eid] = ModelType.Wall;
    model.width[eid] = wall.width;
    model.height[eid] = level.wallColliderWidth;
    model.depth[eid] = 5;

    const rect = convertToRectangle(
        wall.position.x,
        wall.position.y,
        wall.width + 1,
        level.wallColliderWidth,
        wall.rotation,
    );

    collider.type[eid] = ColliderType.Box;
    collider.aX[eid] = rect.a.x;
    collider.aY[eid] = rect.a.y;
    collider.bX[eid] = rect.b.x;
    collider.bY[eid] = rect.b.y;
    collider.cX[eid] = rect.c.x;
    collider.cY[eid] = rect.c.y;
    collider.dX[eid] = rect.d.x;
    collider.dY[eid] = rect.d.y;

    // collider.width[eid] = wall.width;
    // collider.height[eid] = wall.height;

    entity.active[eid] = 1;
    return eid;
}

function convertToRectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
): Rectangle {
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    // Original points relative to the center
    const points = [
        { x: -halfWidth, y: -halfHeight }, // a
        { x: halfWidth, y: -halfHeight }, // b
        { x: halfWidth, y: halfHeight }, // c
        { x: -halfWidth, y: halfHeight }, // d
    ];

    // Rotate each point around the center:
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const rotatedPoints = points.map((point) => ({
        x: x + point.x * cos - point.y * sin,
        y: y + point.x * sin + point.y * cos,
    }));

    return {
        a: rotatedPoints[0],
        b: rotatedPoints[1],
        c: rotatedPoints[2],
        d: rotatedPoints[3],
    };
}
