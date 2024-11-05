import {
    Color,
    InstancedMesh,
    MeshBasicMaterial,
    Object3D,
    Vector3,
} from 'three';
import {
    ColorOverLifetime,
    ParticleData,
    SizeOverLifetime,
} from './ParticleSystem.js';

export class Particle {
    data: ParticleData;

    currentLifetime: number = 0;
    dummy!: Object3D;
    startPosition: Vector3;
    direction: Vector3;

    material!: MeshBasicMaterial;

    constructor(
        _parent: Object3D,
        _maxParticles: number,
        data: ParticleData,
        position: Vector3,
        direction: Vector3,
        _alignToDirection: boolean = false,
        _instancedMesh: InstancedMesh,
    ) {
        this.data = data;

        this.direction = direction;

        this.startPosition = position;
        this.dummy = new Object3D();
    }

    update(
        instancedMesh: InstancedMesh,
        deltaTime: number,
        index: number,
    ): boolean {
        const normalizedLifetime = this.currentLifetime / this.data.lifetime;
        const dampenedSpeed =
            this.data.speed *
            Math.exp(-this.data.dampening * this.currentLifetime);

        // Calculate the current position with dampened speed
        const currentPosition = new Vector3(
            this.startPosition.x,
            this.startPosition.y,
            this.startPosition.z,
        ).add(
            new Vector3(
                this.direction.x,
                this.direction.y,
                this.direction.z,
            ).multiplyScalar(dampenedSpeed * this.currentLifetime),
        );
        this.dummy.position.set(
            currentPosition.x,
            currentPosition.y,
            currentPosition.z,
        );

        const size = this.interpolateSize(
            normalizedLifetime,
            this.data.sizeOverLifetime,
        );
        this.dummy.scale.set(
            this.data.size[0] * size,
            this.data.size[1] * size,
            this.data.size[2] * size,
        );

        const color = this.interpolateColor(
            normalizedLifetime,
            this.data.colorOverLifetime,
        );
        const [r, g, b, a] = color;
        instancedMesh.setColorAt(index, new Color(r * a, g * a, b * a));
        if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.needsUpdate = true;
        }

        this.dummy.updateMatrix();
        instancedMesh.setMatrixAt(index, this.dummy.matrix);

        this.currentLifetime += deltaTime;
        if (this.currentLifetime >= this.data.lifetime) {
            // this.dummy.scale.set(0, 0, 0);
            // this.dummy.updateMatrix();
            // instancedMesh.setMatrixAt(index, this.dummy.matrix);
            return true;
        }
        return false;
    }

    interpolateSize(
        time: number,
        sizeOverLifetime: SizeOverLifetime[],
    ): number {
        for (let i = 0; i < sizeOverLifetime.length - 1; i++) {
            const start = sizeOverLifetime[i];
            const end = sizeOverLifetime[i + 1];
            if (time >= start.time && time <= end.time) {
                const t = (time - start.time) / (end.time - start.time);
                const easedT = this.getEasing(sizeOverLifetime[i].easing)(t);
                return start.size + easedT * (end.size - start.size);
            }
        }
        return sizeOverLifetime[sizeOverLifetime.length - 1].size;
    }

    interpolateColor(
        time: number,
        colorOverLifetime: ColorOverLifetime[],
    ): [number, number, number, number] {
        for (let i = 0; i < colorOverLifetime.length - 1; i++) {
            const start = colorOverLifetime[i];
            const end = colorOverLifetime[i + 1];
            if (time >= start.time && time <= end.time) {
                const t = (time - start.time) / (end.time - start.time);
                const easedT = this.getEasing(colorOverLifetime[i].easing)(t);

                const r =
                    start.color[0] + easedT * (end.color[0] - start.color[0]);
                const g =
                    start.color[1] + easedT * (end.color[1] - start.color[1]);
                const b =
                    start.color[2] + easedT * (end.color[2] - start.color[2]);
                const a =
                    start.color[3] + easedT * (end.color[3] - start.color[3]);

                return [r, g, b, a];
            }
        }
        return colorOverLifetime[colorOverLifetime.length - 1].color;
    }

    easingFunctions: { [key: string]: (t: number) => number } = {
        easeIn: this.easeIn,
        easeOut: this.easeOut,
        easeInOut: this.easeInOut,
        linear: this.linear,
    };

    getEasing(easingTag: string): (t: number) => number {
        const easingFunction = this.easingFunctions[easingTag];
        if (!easingFunction) {
            throw new Error(`Unknown easing function: ${easingTag}`);
        }
        return easingFunction;
    }

    easeInOut(t: number): number {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    easeIn(t: number): number {
        return t * t;
    }

    easeOut(t: number): number {
        return t * (2 - t);
    }

    linear(t: number): number {
        return t;
    }
}
