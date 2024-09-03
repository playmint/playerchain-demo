import { expect } from 'chai';
import { createEntity, createWorld, query } from '../runtime/ecs';

suite('ecs.test.ts');

type Schema = {
    position?: {
        x: number;
        y: number;
        z: number;
    };
};

test('EcsCreateEntityThenQuery', async () => {
    const { world } = createWorld<Schema>();
    const { entity } = createEntity(world);
    entity.position = { x: 1, y: 2, z: 3 };
    for (const { id, position } of query(world)) {
        expect(id).to.equal(entity.id);
        expect(position!.x).to.equal(1);
        expect(position!.y).to.equal(2);
        expect(position!.z).to.equal(3);
    }
});
