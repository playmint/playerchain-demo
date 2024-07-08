import {
    Clock,
    Color,
    DirectionalLight,
    Fog,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { substreamCameraSystem } from '../../substream/cameraSystem';
import { Store } from '../store';

let rendererCh: MessagePort;
let updateStore = new Store();
let renderStore = new Store();
let camera, scene, renderer;
let playerId: Uint8Array;

let cWidth, cHeight;

type Assets = {
    ship?: GLTF;
};
const assets: Assets = {};

// GLTF loader
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
// [!] this /libs dir is populated by the esbuild script at build time
dracoLoader.setDecoderPath('/libs/draco/');
loader.setDRACOLoader(dracoLoader);

function expDecay(a: number, b: number, decay: number, deltaTime: number) {
    return b + (a - b) * Math.exp(-decay * deltaTime);
}

export async function init(
    renderPort,
    canvas,
    width,
    height,
    pixelRatio,
    peerId,
) {
    playerId = peerId;
    cWidth = width;
    cHeight = height;

    renderStore = Store.from([]);

    // set up the channel
    rendererCh = renderPort;
    rendererCh.onmessage = ({ data: entities }) => {
        // console.log('[renderer] recv', entities);
        updateStore = Store.from(entities);
    };

    // load assets
    console.log('loading assets');
    assets.ship = await loader.loadAsync('/assets/ship.glb');
    assets.ship.scene.rotation.x = Math.PI / 2;
    assets.ship.scene.rotation.y = Math.PI / -2;
    console.log('assets ready');

    scene = new Scene();
    scene.fog = new Fog(0x444466, 100, 400);
    scene.background = new Color(0x444466);

    renderer = new WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    console.log('init renderer');

    const light = new DirectionalLight(0xffffff, 1);

    light.position.set(1, 1, 1).normalize();

    scene.add(light);

    const grid = new Mesh(
        new PlaneGeometry(1000, 1000, 100, 100),
        new MeshBasicMaterial({ color: 0x888888, wireframe: true }),
    );

    grid.position.z = -1;

    scene.add(grid);
    render();
}

const objectsInTheWorld = new Map();

function objectSystem(
    updateStore: Store,
    renderStore: Store,
    playerId: Uint8Array,
    deltaTime: number,
) {
    for (let i = 0; i < updateStore.entities.length; i++) {
        // only care about squares
        if (!updateStore.entities[i].isSquare) {
            continue;
        }

        let obj = objectsInTheWorld.get(i);
        if (!obj) {
            obj = new Object3D();
            obj.add(assets.ship!.scene.clone());
            scene.add(obj);
            objectsInTheWorld.set(i, obj);
            console.log('added obj to scene');
        }

        obj.rotation.z = expDecay(
            obj.rotation.z,
            updateStore.entities[i].rotation,
            20,
            deltaTime,
        );

        const decay = 3;
        obj.position.x = expDecay(
            obj.position.x,
            updateStore.entities[i].position.x,
            decay,
            deltaTime,
        );
        obj.position.y = expDecay(
            obj.position.y,
            updateStore.entities[i].position.y,
            decay,
            deltaTime,
        );
        obj.position.z = expDecay(
            obj.position.z,
            updateStore.entities[i].position.z,
            decay,
            deltaTime,
        );
    }
}

function cameraSystem(
    updateStore: Store,
    renderStore: Store,
    playerId: Uint8Array,
    deltaTime: number,
) {
    for (let i = 0; i < renderStore.entities.length; i++) {
        if (!renderStore.entities[i].isCamera) {
            continue;
        }

        if (!camera) {
            camera = new PerspectiveCamera(40, cWidth / cHeight, 1, 1000);
            scene.add(camera);
            console.log('added cam to scene');
        }

        const decay = 4;
        camera.position.x = expDecay(
            camera.position.x,
            renderStore.entities[i].position.x,
            decay,
            deltaTime,
        );
        camera.position.y = expDecay(
            camera.position.y,
            renderStore.entities[i].position.y,
            decay,
            deltaTime,
        );
        camera.position.z = expDecay(
            camera.position.z,
            renderStore.entities[i].position.z,
            decay,
            deltaTime,
        );
    }
}

const clock = new Clock();

function render() {
    try {
        const deltaTime = clock.getDelta();

        // internal systems
        objectSystem(updateStore, renderStore, playerId, deltaTime);
        // This is a game render system, so should be configured from game setup
        substreamCameraSystem(updateStore, renderStore, playerId, deltaTime);
        cameraSystem(updateStore, renderStore, playerId, deltaTime);
        if (camera) {
            renderer.render(scene, camera);
        }
    } catch (e) {
        console.error('render error: ', e);
    }

    self.requestAnimationFrame(render);
}

self.onmessage = function (message) {
    const { data } = message;
    const { type, payload } = data;

    switch (type) {
        case 'init':
            init(
                payload.renderPort,
                payload.drawingSurface,
                payload.width,
                payload.height,
                payload.pixelRatio,
                payload.peerId,
            ).catch((err) => console.error(err));
            break;
    }
};
