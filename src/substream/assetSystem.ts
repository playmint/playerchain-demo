import { AudioListener, AudioLoader, Object3D, PositionalAudio } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ModelAsset {
    name: string;
    path: string;
    scale: number;
    gltf: GLTF;
}

interface ModelCollection {
    models: ModelAsset[];
}

export class ModelAssets {
    modelCollection!: ModelCollection;

    async loadModels() {
        console.log('loading models');

        this.modelCollection = JSON.parse(
            await (await fetch('/data/assetData/modelAssets.json')).text(),
        ) as ModelCollection;

        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/libs/draco/');
        loader.setDRACOLoader(dracoLoader);

        await Promise.all(
            this.modelCollection.models.map(async (model) => {
                model.gltf = await loader.loadAsync(model.path);
                model.gltf.scene.scale.set(
                    model.scale,
                    model.scale,
                    model.scale,
                );
            }),
        );

        console.log('models ready');
    }

    getModelClone(modelName: string): Object3D | undefined {
        return this.modelCollection.models
            .find((model) => model.name == modelName)
            ?.gltf?.scene.clone();
    }
}

interface AudioAsset {
    name: string;
    path: string;
    volume: number;
    looping: boolean;
    spatial: boolean;
    spatialDistance: number;
    clip: AudioBuffer;
}

interface AudioCollection {
    audioClips: AudioAsset[];
}

export class AudioAssets {
    audioCollection!: AudioCollection;

    async loadAudio() {
        console.log('loading audio clips');

        this.audioCollection = JSON.parse(
            await (await fetch('../data/assetData/audioAssets.json')).text(),
        ) as AudioCollection;

        const loader = new AudioLoader();
        await Promise.all(
            this.audioCollection.audioClips.map(async (audio) => {
                audio.clip = await loader.loadAsync(audio.path);
            }),
        );

        console.log('audio clips loaded');
    }

    getAudio(
        clipName: string,
        listener: AudioListener,
    ): PositionalAudio | undefined {
        const asset = this.audioCollection.audioClips.find(
            (audio) => audio.name == clipName,
        );
        if (asset) {
            const audio = new PositionalAudio(listener);
            audio.setBuffer(asset.clip);
            audio.setVolume(asset.volume);
            audio.setLoop(asset.looping);
            audio.setRefDistance(asset.spatialDistance);
            audio.name = asset.name;
            return audio;
        }
        console.log('audio clip not found: ', clipName);
        return undefined;
    }
}
