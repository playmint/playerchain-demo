import * as THREE from './three.js';

let camera, scene, renderer, group;

export function init(canvas, width, height, pixelRatio) {

    camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
    camera.position.z = 200;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x444466, 100, 400);
    scene.background = new THREE.Color(0x444466);

    group = new THREE.Group();
    scene.add(group);

    // we don't use ImageLoader since it has a DOM dependency (HTML5 image element)


    const geometry = new THREE.IcosahedronGeometry(5, 8);
    const materials = [
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
        new THREE.MeshBasicMaterial({ color: 0xff0000 }),
        new THREE.MeshBasicMaterial({ color: 0x0ffff0 }),
        new THREE.MeshBasicMaterial({ color: 0x0000ff }),
    ];

    for (let i = 0; i < 100; i++) {

        const material = materials[i % materials.length];
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = random() * 200 - 100;
        mesh.position.y = random() * 200 - 100;
        mesh.position.z = random() * 200 - 100;
        mesh.scale.setScalar(random() + 1);
        group.add(mesh);

    }

    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    animate();

}

function animate() {

    // group.rotation.x = Date.now() / 4000;
    group.rotation.y = - Date.now() / 4000;

    renderer.render(scene, camera);

    if (self.requestAnimationFrame) {

        self.requestAnimationFrame(animate);

    } else {

        // Firefox

    }

}

// PRNG

let seed = 1;

function random() {

    const x = Math.sin(seed++) * 10000;

    return x - Math.floor(x);

}

