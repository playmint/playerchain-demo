import { EntityId, SystemArgs, system } from '../../../runtime/ecs';
import {
    ColliderType,
    ModelType,
    ShooterSchema,
    Tags,
} from '../../spaceshooter';
import level from '../levels/level_1';
import { Rectangle } from '../utils/PhysicsUtils';
import { BULLET_SPEED } from './bulletSystem';

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
            console.log('wall pieces:', level.walls.length);
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

class Grid {
    private cells: Map<string, Set<number>>;
    private cellSize: number;

    constructor(cellSize: number) {
        this.cells = new Map();
        this.cellSize = cellSize;
    }

    public getCellKey(x: number, y: number): string {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        return `${cellX},${cellY}`;
    }

    public getCellRange(
        x1: number,
        y1: number,
        x2: number,
        y2: number,
    ): string[] {
        const keys: string[] = [];
        const startX = Math.floor(x1 / this.cellSize);
        const endX = Math.floor(x2 / this.cellSize);
        const startY = Math.floor(y1 / this.cellSize);
        const endY = Math.floor(y2 / this.cellSize);

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                keys.push(`${x},${y}`);
            }
        }
        return keys;
    }

    public addEntity(
        entityId: number,
        points: { x: number; y: number }[],
    ): void {
        const xValues = points.map((p) => p.x);
        const yValues = points.map((p) => p.y);
        const x1 = Math.min(...xValues);
        const y1 = Math.min(...yValues);
        const x2 = Math.max(...xValues);
        const y2 = Math.max(...yValues);

        const keys = this.getCellRange(x1, y1, x2, y2);
        for (const key of keys) {
            if (!this.cells.has(key)) {
                this.cells.set(key, new Set());
            }
            this.cells.get(key)!.add(entityId);
        }
    }

    public getNearbyEntities(x: number, y: number): Set<number> {
        const key = this.getCellKey(x, y);
        return this.cells.get(key) || new Set();
    }

    public clear(): void {
        this.cells.clear();
    }
}

export const spacialMap = new Grid(BULLET_SPEED);

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

    spacialMap.addEntity(eid, [rect.a, rect.b, rect.c, rect.d]);

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
