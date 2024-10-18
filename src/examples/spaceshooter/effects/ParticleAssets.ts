import { Object3D, Scene, Vector3 } from 'three';
import FXThruster from './FXThruster';
import { ParticleEffect, ParticleEffectData } from './ParticleSystem';

const particleCollection: ParticleCollection = {
    particleAssets: [
        // {
        //     name: 'shootFX',
        //     path: '/data/particleData/ShootFXParticles.json',
        // },
        // {
        //     name: 'bulletPopFX',
        //     path: '/data/particleData/ShootFXParticles.json',
        // },
        // {
        //     name: 'shipExplodeFX',
        //     path: '/data/particleData/ShipExplodeFXParticles.json',
        // },
        {
            name: 'thrusterFX',
            effect: FXThruster,
        },
        // {
        //     name: 'respawnFX',
        //     path: '/data/particleData/RespawnFXParticles.json',
        // },
    ],
};

export interface ParticleAsset {
    name: string;
    effect: ParticleEffectData;
}

export interface ParticleCollection {
    particleAssets: ParticleAsset[];
}

export class ParticleAssets {
    particleCollection: ParticleCollection;

    constructor() {
        this.particleCollection = particleCollection;
    }

    async loadParticles() {
        await Promise.all(
            this.particleCollection.particleAssets.flatMap((asset) =>
                asset.effect.particleSystems.map((s) => s.prepare()),
            ),
        );

        console.log('particles ready');
    }

    getParticleSystemClone(
        particleNumber: number,
        scene: Scene,
        parent: Object3D,
        position: Vector3,
    ): ParticleEffect | undefined {
        return new ParticleEffect(
            this.particleCollection.particleAssets[particleNumber].name,
            scene,
            parent,
            position,
            this.particleCollection.particleAssets[particleNumber].effect,
        );
    }
}

export async function createParticleSystems(): Promise<ParticleAssets> {
    const pa = new ParticleAssets();
    await pa.loadParticles();
    return pa;
}
