import { Des, Ser } from 'seqproto';
import { Entity } from '../runtime/store';

export function serializeEntity(ser: Ser, entity: Entity) {
    ser.serializeUInt32(entity.id);

    ser.serializeBoolean(entity.isShip);
    ser.serializeBoolean(entity.isPlayer);

    ser.serializeFloat32(entity.position.x);
    ser.serializeFloat32(entity.position.y);
    ser.serializeFloat32(entity.position.z);

    ser.serializeFloat32(entity.rotation);
    ser.serializeFloat32(entity.rollAngle);

    ser.serializeFloat32(entity.velocity.x);
    ser.serializeFloat32(entity.velocity.y);

    ser.serializeString(entity.owner);
    ser.serializeString(entity.playerId);

    ser.serializeString(entity.model);
    ser.serializeString(entity.audioClip);
    ser.serializeFloat32(entity.audioPitch);

    // Renderer
    ser.serializeBoolean(!!entity.renderer);
    if (entity.renderer) {
        ser.serializeBoolean(entity.renderer.visible);
        ser.serializeUInt32(entity.renderer.color);
        ser.serializeUInt32(entity.renderer.geometry);
        ser.serializeFloat32(entity.renderer.size.x);
        ser.serializeFloat32(entity.renderer.size.y);
    }
}

export function deserializeEntity(des: Des): Entity {
    const entity = new Entity();
    entity.id = des.deserializeUInt32();

    entity.isShip = des.deserializeBoolean();
    entity.isPlayer = des.deserializeBoolean();

    entity.position = {
        x: des.deserializeFloat32(),
        y: des.deserializeFloat32(),
        z: des.deserializeFloat32(),
    };

    entity.rotation = des.deserializeFloat32();
    entity.rollAngle = des.deserializeFloat32();

    entity.velocity = {
        x: des.deserializeFloat32(),
        y: des.deserializeFloat32(),
    };

    entity.owner = des.deserializeString();
    entity.playerId = des.deserializeString();

    entity.model = des.deserializeString();
    entity.audioClip = des.deserializeString();
    entity.audioPitch = des.deserializeFloat32();

    // Renderer
    const hasRenderer = des.deserializeBoolean();
    if (hasRenderer) {
        entity.renderer = {
            visible: des.deserializeBoolean(),
            color: des.deserializeUInt32(),
            geometry: des.deserializeUInt32(),
            size: {
                x: des.deserializeFloat32(),
                y: des.deserializeFloat32(),
            },
        };
    }

    return entity;
}
