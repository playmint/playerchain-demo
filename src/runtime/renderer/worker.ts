import {
    Color,
    Fog,
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Store } from '../store';
import type { Entity } from '../store';

let rendererCh: MessagePort;
let store = new Store();
let camera, scene, renderer;

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

export async function init(renderPort, canvas, width, height, pixelRatio) {
    // set up the channel
    rendererCh = renderPort;
    rendererCh.onmessage = ({ data: entities }) => {
        // console.log('[renderer] recv', entities);
        store = Store.from(entities);
    };

    // load assets
    console.log('loading assets');
    assets.ship = await loader.loadAsync('/assets/ship.glb');
    console.log('assets ready');

    camera = new PerspectiveCamera(40, width / height, 1, 1000);
    camera.position.z = 100;

    scene = new Scene();
    scene.fog = new Fog(0x444466, 100, 400);
    scene.background = new Color(0x444466);

    renderer = new WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    console.log('init renderer');
    render();
}

const objectsInTheWorld = new Map();

function objectSystem(entities: Entity[]) {
    for (let i = 0; i < entities.length; i++) {
        // only care about squares
        if (!entities[i].isSquare) {
            continue;
        }

        let obj = objectsInTheWorld.get(i);
        if (!obj) {
            obj = assets.ship!.scene.clone();
            obj.rotation.x = Math.PI / 2;
            scene.add(obj);
            objectsInTheWorld.set(i, obj);
        }

        const target = new Vector3(
            entities[i].position.x,
            entities[i].position.y,
            entities[i].position.z,
        );
        obj.position.lerp(target, 0.3);
    }
}

function render() {
    objectSystem(store.entities);

    renderer.render(scene, camera);
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
            ).catch((err) => console.error(err));
            break;
    }
};
