import { Vector3, BoxGeometry, Color, Fog, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer } from './three.js';
import { Store } from '../store/store.js';
const rendererCh = new BroadcastChannel("renderer");
let store = new Store();
let camera, scene, renderer, group;

export function init(canvas, width, height, pixelRatio) {
    camera = new PerspectiveCamera(40, width / height, 1, 1000);
    camera.position.z = 200;

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

/** @param {import("../store/store.js").Entity[]} entities  */
function objectSystem(entities) {
    for (let i = 0; i < entities.length; i++) {

        // only care about squares
        if (!entities[i].isSquare) {
            continue;
        }

        let obj = objectsInTheWorld.get(i);
        if (!obj) {
            const geometry = new BoxGeometry(1, 1, 1);
            const material = new MeshBasicMaterial({ color: entities[i].color });
            obj = new Mesh(geometry, material);
            scene.add(obj);
            objectsInTheWorld.set(i, obj);
        }

        const target = new Vector3(
            entities[i].position.x,
            entities[i].position.y,
            entities[i].position.z,
        );
        obj.position.lerp(target, 0.1);
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
                payload.drawingSurface,
                payload.width,
                payload.height,
                payload.pixelRatio,
            );
            break;
    }
};

rendererCh.onmessage = ({ data: entities }) => {
    // console.log('[renderer] recv', entities);
    store = Store.from(entities);
}