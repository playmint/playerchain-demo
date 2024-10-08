import { Vector3 } from 'three';

interface ShakeEvent {
    intensity: number;
    frequency: number;
    position: Vector3;
    decay: number;
    duration: number;
}

let activeShakes: ShakeEvent[] = [];

export function addShake(event: ShakeEvent) {
    activeShakes.push(event);
}

export function getShakeOffset(
    cameraPosition: Vector3,
    deltaTime: number,
): Vector3 {
    const shakeOffset = new Vector3(0, 0, 0);

    activeShakes = activeShakes.filter((shake) => {
        const distance = cameraPosition.distanceTo(shake.position);
        const attenuation = 1 / (distance + 1);

        const shakeIntensity = shake.intensity * attenuation;
        shakeOffset.x +=
            Math.sin(shake.duration * shake.frequency) * shakeIntensity;
        shakeOffset.y +=
            Math.sin(shake.duration * shake.frequency - shake.frequency / 5) *
            shakeIntensity;

        shake.intensity -= shake.decay * deltaTime;
        shake.duration -= deltaTime;

        return shake.intensity > 0 && shake.duration > 0;
    });

    return shakeOffset;
}
