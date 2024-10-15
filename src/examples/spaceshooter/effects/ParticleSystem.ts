import {
    AdditiveBlending,
    DynamicDrawUsage,
    Group,
    InstancedMesh,
    Material,
    MathUtils,
    MeshBasicMaterial,
    NormalBlending,
    Object3D,
    PlaneGeometry,
    SRGBColorSpace,
    Texture,
    TextureLoader,
    Vector3,
} from 'three';
import { Particle } from './Particle';

interface Burst {
    time: number;
    minCount: number;
    maxCount: number;
    cycles: number;
    interval: number;
}

interface Emission {
    rateOverTime: number;
    bursts: Burst[];
}

interface Shape {
    type: string;
    radius: number;
    minArc: number;
    maxArc: number;
    alignToDirection: boolean;
}

export interface SizeOverLifetime {
    time: number;
    size: number;
    easing: string;
}

export interface ColorOverLifetime {
    time: number;
    color: [number, number, number, number];
    easing: string;
}

interface Rendering {
    particleTexture: string;
    blendMode: string;
}

export interface ParticleData {
    lifetime: number;
    speed: number;
    dampening: number;
    size: number;
    startRotation: number;
    startColor: number[];
    sizeOverLifetime: SizeOverLifetime[];
    colorOverLifetime: ColorOverLifetime[];
}

class BurstSystem {
    parent: ParticleSystem;
    time: number;
    minCount: number;
    maxCount: number;
    cycles: number;
    interval: number;

    currentIntervalTimer: number = 0;
    currentCycle: number = 0;
    emitCount: number = 0;

    constructor(parent: ParticleSystem, data: Burst) {
        this.parent = parent;

        this.time = data.time;
        this.minCount = data.minCount;
        this.maxCount = data.maxCount;
        this.cycles = data.cycles;
        this.interval = data.interval;
        this.emitCount =
            Math.random() * (this.maxCount - this.minCount) + this.minCount;
        this.currentIntervalTimer = this.interval;
    }

    update(deltaTime: number): boolean {
        // Wait for the interval to pass
        if (this.currentIntervalTimer < this.interval) {
            this.currentIntervalTimer += deltaTime;
            return false;
        }

        for (let i = 0; i < this.emitCount; i++) {
            this.parent.createParticle();
        }
        this.currentCycle++;
        if (this.currentCycle >= this.cycles) {
            this.currentCycle = 0;
            return true;
        }
        // If the burst isn't finished yet, reset the interval timer and get new random emit count
        this.currentIntervalTimer = 0;
        this.emitCount =
            Math.random() * (this.maxCount - this.minCount) + this.minCount;
        return false;
    }
}

export class ParticleEffectData {
    particleSystems: ParticleSystemData[] = [];
    constructor(data: any) {
        for (let i = 0; i < data.particleSystems.length; i++) {
            this.particleSystems.push(
                new ParticleSystemData(data.particleSystems[i]),
            );
        }
    }
    async prepare() {
        return Promise.all(this.particleSystems.map((s) => s.prepare()));
    }
}

export class ParticleEffect {
    particleEffect: ParticleEffectData;
    particleSystems: ParticleSystem[] = [];
    n: number = 0;

    constructor(
        _name: string,
        // scene: Scene,
        parent: Object3D,
        position: Vector3,
        data: ParticleEffectData,
    ) {
        this.particleEffect = data;
        this.particleEffect.particleSystems.forEach((particleSystemData) => {
            this.particleSystems.push(
                new ParticleSystem(
                    'particleSystem',
                    // scene,
                    parent,
                    position,
                    particleSystemData,
                ),
            );
        });
    }

    destroy() {
        this.particleSystems.forEach((particleSystem) => {
            particleSystem.destroy();
        });
    }
}

export class ParticleSystemData {
    duration: number; // Duration of total particle effect (time before looping or stopping)
    particleData: ParticleData;
    maxParticles: number;
    looping: boolean;
    emission: Emission; // Rate of particles per second and bursts
    shape: Shape; // Shape of the emission area
    rendering: Rendering;
    particleTexture!: Texture;

    constructor(data: any) {
        this.duration = data.duration;
        this.particleData = data.particleData;
        this.maxParticles = data.maxParticles;
        this.looping = data.looping;
        this.emission = data.emission;
        this.shape = data.shape;
        this.rendering = data.rendering;
    }

    async prepare() {
        if (!this.particleTexture) {
            const imageLoader = new TextureLoader();
            this.particleTexture = await imageLoader.load(
                this.rendering.particleTexture,
            );
            this.particleTexture.colorSpace = SRGBColorSpace;
        }
    }
}

export class ParticleSystem {
    data: ParticleSystemData;
    // scene: Scene; // Used for world space particles
    group: Group;
    parent: Object3D;
    position: Vector3;
    rotation: number;

    instancedMesh: InstancedMesh;
    material: Material;

    constructor(
        name: string,
        // scene: Scene,
        parent: Object3D,
        position: Vector3,
        data: ParticleSystemData,
    ) {
        // this.scene = scene;
        this.data = data;
        this.group = new Group();
        this.group.name = name;
        this.parent = parent;
        this.parent.add(this.group);
        this.position = position;
        this.rotation = 180;
        const blending =
            this.data.rendering.blendMode === 'additive'
                ? AdditiveBlending
                : NormalBlending;
        this.material = new MeshBasicMaterial({
            map: this.data.particleTexture,
            transparent: true,
            blending: blending,
        });
        this.instancedMesh = new InstancedMesh(
            new PlaneGeometry(),
            this.material,
            this.data.maxParticles,
        );
        this.instancedMesh.instanceMatrix.setUsage(DynamicDrawUsage); // will be updated every frame
        this.instancedMesh.count = 0;
        this.group.add(this.instancedMesh);
    }

    destroy() {
        this.parent.remove(this.group);
    }

    currentDuration: number = 0;
    emissionRateTimer: number = 0;
    currentBurstCounter: number = 0;
    currentBursts: BurstSystem[] = [];
    currentParticles: Particle[] = [];
    isPlaying: boolean = false;

    start() {
        if (this.isPlaying && this.data.looping) {
            return;
        }
        this.currentDuration = 0;
        this.emissionRateTimer = 0;
        this.currentBurstCounter = 0;
        // if(this.currentParticles.length > 0){
        // this.currentParticles = [];
        this.isPlaying = true;
    }

    stop() {
        this.isPlaying = false;
    }

    update(deltaTime: number) {
        // if (!this.isPlaying) {
        //     return;
        // }

        if (this.isPlaying) {
            // Create a particle emission.rateOverTime times per second:
            const timeBetweenParticles = 1 / this.data.emission.rateOverTime;
            if (this.emissionRateTimer > timeBetweenParticles) {
                // Create a particle
                this.createParticle();
                this.emissionRateTimer = 0;
            }

            // Create a burst of particles at a specific time:
            if (
                this.data.emission.bursts.length > 0 &&
                this.currentBurstCounter < this.data.emission.bursts.length
            ) {
                if (
                    this.currentDuration >
                    this.data.emission.bursts[this.currentBurstCounter].time
                ) {
                    const burst = new BurstSystem(
                        this,
                        this.data.emission.bursts[this.currentBurstCounter],
                    );
                    this.currentBursts.push(burst);
                    this.currentBurstCounter++;
                }
            }
        }

        // Update all created bursts
        for (let i = 0; i < this.currentBursts.length; i++) {
            if (this.currentBursts[i].update(deltaTime)) {
                this.currentBursts.splice(i, 1);
            }
        }

        // Update all created particles
        this.instancedMesh.count = this.currentParticles.length;
        for (let i = 0; i < this.currentParticles.length; i++) {
            if (
                this.currentParticles[i].update(
                    this.instancedMesh,
                    deltaTime,
                    i,
                )
            ) {
                this.currentParticles.splice(i, 1);
                this.instancedMesh.count--;
            }
        }
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        this.instancedMesh.computeBoundingSphere();

        this.currentDuration += deltaTime;
        this.emissionRateTimer += deltaTime;
        if (this.currentDuration > this.data.duration) {
            if (this.data.looping) {
                this.currentDuration = 0;
                this.currentBurstCounter = 0;
                this.emissionRateTimer = 0;
            } else {
                this.isPlaying = false;
            }
        }
    }

    setPosition(position: Vector3) {
        this.position = position;
    }

    setRotation(rotation: number) {
        this.rotation = rotation;
    }

    createParticle() {
        const randomDirection = this.randomDirectionWithinArc(
            this.data.shape.minArc,
            this.data.shape.maxArc,
        );
        const emitDirection = this.getDirectionFromAngle(
            this.rotation + randomDirection,
        ).normalize();
        const particleDirection = emitDirection;

        //this.getDirectionFromAngle(this.rotation).normalize();

        // ( this.randomDirectionWithinArc(
        //     this.data.shape.minArc,
        //     this.data.shape.maxArc,
        // ).add(
        //     this.getDirectionFromAngle(this.rotation)
        // )).normalize();
        // .copy(
        //     this.parent.up
        //         .add(
        //             this.randomDirectionWithinArc(
        //                 this.data.shape.minArc,
        //                 this.data.shape.maxArc,
        //             ),
        //         )
        //         .normalize(),
        // )
        // .applyQuaternion(this.parent.quaternion);
        const particle = new Particle(
            this.group,
            this.data.maxParticles,
            this.data.particleData,
            this.getRandomPointInCircle(this.data.shape.radius).add(
                this.position,
            ),
            particleDirection,
            this.data.shape.alignToDirection,
            this.instancedMesh,
        );
        this.currentParticles.push(particle);
    }

    randomDirectionWithinArc(minAngle: number, maxAngle: number): number {
        // Convert degrees to radians
        const minAngleRad = MathUtils.degToRad(minAngle);
        const maxAngleRad = MathUtils.degToRad(maxAngle);

        // Generate a random angle within the specified range
        const randomAngle = MathUtils.lerp(
            minAngleRad,
            maxAngleRad,
            Math.random(),
        );

        // Convert angle to a direction vector
        return randomAngle;
    }

    getRandomPointInCircle(radius) {
        const angle = Math.random() * Math.PI * 2;
        const r = radius * Math.sqrt(Math.random());
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);

        return new Vector3(x, y, 0);
    }

    getDirectionFromAngle(angle: number): Vector3 {
        return new Vector3(Math.cos(angle), Math.sin(angle), 0);
    }
}
