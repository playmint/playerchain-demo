import { doc } from 'prettier';
import { text } from 'socket:mime';
import {
    AudioListener,
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
import { AudioAssets, ModelAssets } from '../../substream/assetSystem';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { createGameUI, substreamUISystem } from '../../substream/UISystem';
import { substreamCameraSystem } from '../../substream/cameraSystem';
import { label, substreamLabelSystem } from '../../substream/labelSystem';
import { Store } from '../store';

export class Renderer {
    private rendererCh!: MessagePort;
    private updateStore = new Store();
    private renderStore = new Store();
    private camera!: PerspectiveCamera;
    private uiCreated: boolean = false;
    private listener!: AudioListener;
    private scene!: Scene;
    private renderer!: WebGLRenderer;
    private labelRenderer!: CSS2DRenderer;
    private playerId!: Uint8Array;
    private cWidth!: number;
    private cHeight!: number;
    private clock = new Clock();
    private objectsInTheWorld = new Map();
    private labelsInWorld = new Map();
    private models!: ModelAssets;
    private audio!: AudioAssets;
    private isMuted: boolean = false;

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
        this.models = new ModelAssets();
        await this.models.loadModels();

        this.audio = new AudioAssets();
        await this.audio.loadAudio();

        this.scene = new Scene();
        this.scene.fog = new Fog(0x444466, 100, 400);
        this.scene.background = new Color(0x444466);

        this.renderer = new WebGLRenderer({ antialias: true, canvas: canvas });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(this.cWidth, this.cHeight, false);
        console.log('init renderer');

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        document.body.appendChild(this.labelRenderer.domElement);
        console.log('init labelRenderer');

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
            if (!this.updateStore.entities[i].isShip) {
                continue;
            }

            let obj = this.objectsInTheWorld.get(i);
            if (!obj) {
                obj = new Object3D();
                const model = this.models.getModelClone(
                    this.updateStore.entities[i].model,
                );
                if (model) {
                    obj.attach(model);
                }
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

            obj.children[0].rotation.z = this.expDecay(
                obj.children[0].rotation.z,
                this.updateStore.entities[i].rollAngle,
                4,
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
            if (obj && this.updateStore.entities[i].audioClip != '') {
                let sound = obj?.getObjectByName(
                    this.updateStore.entities[i].audioClip,
                ) as PositionalAudio;
                if (!sound) {
                    const clip = this.audio.getAudio(
                        this.updateStore.entities[i].audioClip,
                        this.listener,
                    );
                    if (clip) {
                        sound = clip;
                    }
                    obj.add(sound);
                    sound.play();
                    console.log('added audio to obj');
                }

                if (sound) {
                    if (this.isMuted) {
                        sound.stop();
                    } else if (!sound.isPlaying) {
                        sound.play();
                    }

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

    private labelSystem(deltaTime: number) {
        for (let i = 0; i < this.renderStore.entities.length; i++) {
            if (this.renderStore.entities[i].labelText == '') {
                continue;
            }

            let labelElement = this.labelsInWorld.get(i);

            if (!labelElement) {
                const index = this.updateStore.entities.findIndex(
                    (entity) =>
                        entity.owner === this.renderStore.entities[i].owner,
                );
                const obj = this.objectsInTheWorld.get(index);

                labelElement = new label();
                labelElement.labelText = this.renderStore.entities[i].labelText;
                labelElement.textColor =
                    this.renderStore.entities[i].owner == this.playerId
                        ? 'yellow'
                        : 'white';

                labelElement.getUIElement();
                obj.add(labelElement.css2dObject);

                this.labelsInWorld.set(i, labelElement);
                console.log(
                    'added label: ',
                    this.renderStore.entities[i].labelText,
                    ', to obj: ',
                    index,
                );
            }
        }
    }

    private uiSystem() {
        if (!this.uiCreated) {
            createGameUI(this.renderStore);
            this.uiCreated = true;
        }
        for (let i = 0; i < this.renderStore.entities.length; i++) {
            if (!this.renderStore.entities[i].isUI) {
                continue;
            }

            let uiElement = this.uiElementsInWorld.get(i);
            if (!uiElement) {
                uiElement = this.renderStore.entities[i].UIElement;
                uiElement.getUIElement();
                this.uiElementsInWorld.set(i, uiElement);
                console.log('added uiElement to scene');
            }
        }
    }

    public toggleMute() {
        this.isMuted = !this.isMuted;
        console.log('toggled mute: ', this.isMuted);
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

            substreamLabelSystem(
                this.updateStore,
                this.renderStore,
                this.playerId,
                deltaTime,
            );
            this.labelSystem(deltaTime);

            substreamUISystem(
                this.updateStore,
                this.renderStore,
                this.playerId,
                this,
                deltaTime,
            );

            this.uiSystem();

            if (this.camera) {
                this.renderer.render(this.scene, this.camera);
                this.labelRenderer.render(this.scene, this.camera); // render labels on top of the main scene
            }
        } catch (e) {
            console.error('render error: ', e);
        }

        window.requestAnimationFrame(this.render.bind(this));
    }
}
