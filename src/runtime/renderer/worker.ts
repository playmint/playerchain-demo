import {
    Camera,
    Color,
    DirectionalLight,
    Fog,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Group } from '../../../build/mac/substream-dev.app/Contents/Resources/libs/tween.module';
import { substreamCameraSystem } from '../../substream/cameraSystem';
import { Store } from '../store';
import type { Entity } from '../store';

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
        }

        const target = new Vector3(
            updateStore.entities[i].position.x,
            updateStore.entities[i].position.y,
            updateStore.entities[i].position.z,
        );
        obj.rotation.z = updateStore.entities[i].rotation;
        obj.position.lerp(target, 0.3);
    }
}

function cameraSystem(
    updateStore: Store,
    renderStore: Store,
    playerId: Uint8Array,
) {
    for (let i = 0; i < renderStore.entities.length; i++) {
        // only care about squares
        if (!renderStore.entities[i].isCamera) {
            continue;
        }

        if (!camera) {
            camera = new PerspectiveCamera(40, cWidth / cHeight, 1, 1000);
            scene.add(camera);
        }

        const target = new Vector3(
            renderStore.entities[i].position.x,
            renderStore.entities[i].position.y,
            renderStore.entities[i].position.z,
        );
        camera.position.lerp(target, 0.3);
    }
}

function render() {
    try {
        objectSystem(updateStore, renderStore, playerId);
        cameraSystem(updateStore, renderStore, playerId);
        // This is a game render system, so should be configured from game setup
        substreamCameraSystem(updateStore, renderStore, playerId);
        if (camera) renderer.render(scene, camera);
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
