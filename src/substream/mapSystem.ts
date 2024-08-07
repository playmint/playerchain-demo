import { GeometryKind, RigidBodyKind, Store } from '../runtime';

interface MapPart {
    position: { x: number; y: number };
    size: { x: number; y: number };
    color: number;
}

export function mapSystem(store: Store, roundNum: number) {
    if (roundNum > 0) {
        return;
    }
    console.log(`mapSystem - initialising map for round ${roundNum}`);

    const mapParts: MapPart[] = [
        {
            position: { x: 50, y: 0 },
            size: { x: 5, y: 50 },
            color: 0xdddddd,
        },
        {
            position: { x: -50, y: 0 },
            size: { x: 5, y: 50 },
            color: 0xdddddd,
        },
        {
            position: { x: 0, y: 50 },
            size: { x: 50, y: 5 },
            color: 0xdddddd,
        },
        {
            position: { x: 0, y: -50 },
            size: { x: 50, y: 5 },
            color: 0xdddddd,
        },
    ];

    mapParts.forEach((mapPart) => {
        const entity = store.add();

        entity.position = { ...mapPart.position, z: 0 };
        entity.renderer = {
            visible: true,
            color: mapPart.color,
            geometry: GeometryKind.Box,
            size: mapPart.size,
        };

        entity.physics = {
            rigidBody: {
                kind: RigidBodyKind.Fixed,
                collider: {
                    isSensor: false,
                    size: {
                        x: mapPart.size.x,
                        y: mapPart.size.y,
                    },
                    checkCollisions: false,
                },
                lockRotations: false,
            },
            collisions: [],
        };
    });
}
