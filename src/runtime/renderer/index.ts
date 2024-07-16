import {
    AudioListener,
    AudioLoader,
    Clock,
    Color,
    DirectionalLight,
    Fog,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneGeometry,
    PositionalAudio,
    Scene,
    WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { substreamCameraSystem } from '../../substream/cameraSystem';
import { Store } from '../store';

export class Renderer {
    private rendererCh!: MessagePort;
    private updateStore = new Store();
    private renderStore = new Store();
    private camera!: PerspectiveCamera;
    private listener!: AudioListener;
    private scene!: Scene;
    private renderer!: WebGLRenderer;
    private playerId!: Uint8Array;
    private cWidth!: number;
    private cHeight!: number;
    private clock = new Clock();
    private objectsInTheWorld = new Map();
    private assets: { ship?: GLTF; shipAudio?: AudioBuffer } = {};

    constructor() {}

    static async create({
        renderPort,
        peerId,
    }: {
        renderPort: MessagePort;
        peerId: Uint8Array;
    }) {
        const instance = new Renderer();
        await instance.init(renderPort, peerId);
        return instance;
    }

    private async init(renderPort: MessagePort, peerId: Uint8Array) {
        this.playerId = peerId;

        const canvas = document.getElementById('viewport');
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new Error('Canvas element not found');
        }

        this.cWidth = canvas.clientWidth;
        this.cHeight = canvas.clientHeight;

        this.renderStore = Store.from([]);

        // set up the channel
        this.rendererCh = renderPort;
        this.rendererCh.onmessage = ({ data: entities }) => {
            this.updateStore = Store.from(entities);
        };

        // load assets
        console.log('loading assets');
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('/libs/draco/');
        loader.setDRACOLoader(dracoLoader);

        this.assets.ship = await loader.loadAsync('/assets/ship.glb');
        this.assets.ship.scene.rotation.x = Math.PI / 2;
        this.assets.ship.scene.rotation.y = Math.PI / -2;
        console.log('assets ready');

        const audioLoader = new AudioLoader();
        this.assets.shipAudio = await audioLoader.loadAsync('/assets/ufo.mp3');

        this.scene = new Scene();
        this.scene.fog = new Fog(0x444466, 100, 400);
        this.scene.background = new Color(0x444466);

        this.renderer = new WebGLRenderer({ antialias: true, canvas: canvas });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.cWidth, this.cHeight, false);
        console.log('init renderer');

        const light = new DirectionalLight(0xffffff, 1);
        light.position.set(1, 1, 1).normalize();
        this.scene.add(light);

        const grid = new Mesh(
            new PlaneGeometry(1000, 1000, 100, 100),
            new MeshBasicMaterial({ color: 0x888888, wireframe: true }),
        );
        grid.position.z = -1;
        this.scene.add(grid);

        this.render();
    }

    private expDecay(a: number, b: number, decay: number, deltaTime: number) {
        return b + (a - b) * Math.exp(-decay * deltaTime);
    }

    private objectSystem(deltaTime: number) {
        for (let i = 0; i < this.updateStore.entities.length; i++) {
            if (!this.updateStore.entities[i].isSquare) {
                continue;
            }

            let obj = this.objectsInTheWorld.get(i);
            if (!obj) {
                obj = new Object3D();
                obj.add(this.assets.ship!.scene.clone());
                this.scene.add(obj);
                this.objectsInTheWorld.set(i, obj);
                console.log('added obj to scene');
            }

            obj.rotation.z = this.expDecay(
                obj.rotation.z,
                this.updateStore.entities[i].rotation,
                20,
                deltaTime,
            );

            const decay = 6;
            obj.position.x = this.expDecay(
                obj.position.x,
                this.updateStore.entities[i].position.x,
                decay,
                deltaTime,
            );
            obj.position.y = this.expDecay(
                obj.position.y,
                this.updateStore.entities[i].position.y,
                decay,
                deltaTime,
            );
            obj.position.z = this.expDecay(
                obj.position.z,
                this.updateStore.entities[i].position.z,
                decay,
                deltaTime,
            );
        }
    }

    private audioSystem(deltaTime: number) {
        for (let i = 0; i < this.updateStore.entities.length; i++) {
            const obj = this.objectsInTheWorld.get(i);
            if (obj && this.updateStore.entities[i].playAudio) {
                let sound = obj?.getObjectByName(
                    'shipAudio',
                ) as PositionalAudio;
                if (!sound) {
                    sound = new PositionalAudio(this.listener);
                    sound.setBuffer(this.assets.shipAudio!);
                    sound.setRefDistance(10);
                    sound.setLoop(true);
                    sound.setVolume(0.5);
                    sound.name = 'shipAudio';
                    obj.add(sound);
                    sound.play();
                    console.log('added audio to obj');
                }

                if (sound) {
                    sound.setPlaybackRate(
                        this.updateStore.entities[i].audioPitch,
                    );
                }
            }
        }
    }

    private cameraSystem(deltaTime: number) {
        for (let i = 0; i < this.renderStore.entities.length; i++) {
            if (!this.renderStore.entities[i].isCamera) {
                continue;
            }

            if (!this.camera) {
                this.camera = new PerspectiveCamera(
                    40,
                    this.cWidth / this.cHeight,
                    1,
                    1000,
                );
                this.scene.add(this.camera);
                console.log('added cam to scene');
                // create an AudioListener and add it to the camera
                this.listener = new AudioListener();
                this.camera.add(this.listener);
            }

            const decay = 4;
            this.camera.position.x = this.expDecay(
                this.camera.position.x,
                this.renderStore.entities[i].position.x,
                decay,
                deltaTime,
            );
            this.camera.position.y = this.expDecay(
                this.camera.position.y,
                this.renderStore.entities[i].position.y,
                decay,
                deltaTime,
            );
            this.camera.position.z = this.expDecay(
                this.camera.position.z,
                this.renderStore.entities[i].position.z,
                decay,
                deltaTime,
            );
        }
    }

    private render() {
        try {
            const deltaTime = this.clock.getDelta();

            // internal systems
            this.objectSystem(deltaTime);
            // This is a game render system, so should be configured from game setup
            substreamCameraSystem(
                this.updateStore,
                this.renderStore,
                this.playerId,
                deltaTime,
            );
            this.cameraSystem(deltaTime);

            this.audioSystem(deltaTime);

            if (this.camera) {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (e) {
            console.error('render error: ', e);
        }

        window.requestAnimationFrame(this.render.bind(this));
    }
}
