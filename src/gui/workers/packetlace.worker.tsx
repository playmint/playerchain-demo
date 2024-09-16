import * as Comlink from 'comlink';
import Dexie from 'dexie';
import * as THREE from 'three';
import database, { DB } from '../../runtime/db';

const PACKET_SCALE = 0.1;
const SPREAD_X = 5;
const SPREAD_Y = 2;
const LINE_WIDTH = 2; // NOTE: Due to limitations of the OpenGL Core Profile with the WebGL renderer on most platforms linewidth will always be 1 regardless of the set value. (taken from Three.js doc)
const DEFAULT_LINE_COLOR = 'grey';
const DEFAULT_PACKET_COLOR_1 = 0xffffff;
const DEFAULT_PACKET_COLOR_2 = 0x888888;
const PARENTLESS_PACKET_COLOR = 0xff0000;

const packetGeometry = new THREE.BoxGeometry(
    PACKET_SCALE,
    PACKET_SCALE,
    PACKET_SCALE,
);

let db: DB;
let fetching = false;
let canvas: OffscreenCanvas | undefined;
let aspectRatio: number;
let packets: any;
let peers: string[] = [];
let peerColors: string[] = [];

let scene: THREE.Scene | undefined;
let renderer: THREE.WebGLRenderer | undefined;
let camera: THREE.OrthographicCamera | undefined;
const threeObjects: Map<string, THREE.Object3D> = new Map();
const hasRendered: Map<string, boolean> = new Map();

let fetchTimer: any;

// let cameraFromY = 0;
// let cameraTargetY = 0;
// const lerpSpeedMs = 1000;

// Called by the provider
export async function init(dbname: string, _peerColors: string[]) {
    db = database.open(dbname);
    peerColors = _peerColors;
}

export async function startGraph(
    _canvas: OffscreenCanvas,
    channelID: string,
    packetLimit: number,
    fetchIntervalMs: number,
    _peers: string[],
) {
    canvas = _canvas;
    const { width, height } = canvas;
    // console.log('packetlace.worker: offscreen canvas set:', width, height);

    peers = _peers;

    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(0x000000, 0);

    aspectRatio = height / width;
    camera = new THREE.OrthographicCamera(
        -1,
        1,
        aspectRatio,
        -aspectRatio,
        0.1,
        2000,
    );

    camera.position.z = 5;
    camera.zoom = 100;

    scene.add(camera);

    fetchTimer = setInterval(async () => {
        try {
            packets = await fetchPackets(channelID, packetLimit);
        } catch (e) {
            console.error('packetlace.worker: fetchPackets error:', e);
        }
    }, fetchIntervalMs);
    requestAnimationFrame(render);
}

export async function stopGraph() {
    if (fetchTimer !== undefined) {
        clearInterval(fetchTimer);
        fetchTimer = undefined;
    }
    renderer?.dispose();
    renderer = undefined;
    camera = undefined;
    scene?.clear();
    scene = undefined;

    canvas = undefined;
    threeObjects.clear();
    hasRendered.clear();
    peers = [];
}

async function fetchPackets(channelId: string, limit: number = 300) {
    if (fetching) {
        console.log('worker: lace fetch skip');
        return;
    }

    fetching = true;
    const packets = await db.messages
        .where(['channel', 'round'])
        .between([channelId, Dexie.minKey], [channelId, Dexie.maxKey])
        .reverse()
        .limit(limit)
        .toArray()
        .then((messages) => {
            const minRound = Math.min(...messages.map((msg: any) => msg.round));
            const maxRound = Math.max(...messages.map((msg: any) => msg.round));
            const messagesWithOffsetRound = messages.map((msg: any) => ({
                ...msg,
                round: msg.round - minRound,
                originalRound: msg.round,
            }));
            return { minRound, maxRound, messagesWithOffsetRound };
        });

    fetching = false;
    return packets;
}

function render() {
    if (!canvas || !scene || !renderer || !camera) {
        return;
    }

    if (!packets) {
        requestAnimationFrame(render);
        return;
    }

    hasRendered.forEach((_, key) => {
        hasRendered.set(key, false);
    });

    const renderedPackets = renderPackets(packets.messagesWithOffsetRound);
    renderLines(renderedPackets);

    // remove objects that were not rendered
    const removedPacketKeys: string[] = [];
    hasRendered.forEach((rendered, key) => {
        if (!rendered) {
            const object3d = threeObjects.get(key) as THREE.Mesh | THREE.Line;
            if (object3d instanceof THREE.Line) {
                // NOTE: We reuse the same geometry for all the packet meshes so we only dispose the line geometry
                object3d.geometry.dispose();
            }
            if (object3d.material instanceof THREE.Material) {
                object3d.material.dispose();
            }
            scene?.remove(object3d);
            threeObjects.delete(key);
            removedPacketKeys.push(key);
        }
    });

    removedPacketKeys.forEach((key) => {
        hasRendered.delete(key);
    });

    // We use this because we offset the rounds of the packets with (round - minRound)
    const roundDelta =
        packets.maxRound && packets.minRound
            ? packets.maxRound - packets.minRound
            : 0;

    // CameraYOffset is us focussing the camera 3 rows above the last packet
    const rowsOfSpace = 3;
    const cameraYOffset =
        (aspectRatio - rowsOfSpace * SPREAD_Y * PACKET_SCALE) * -1;

    // FIXME: We cannot lerp yet because we draw the packets by offset round so they draw in the same space
    // cameraFromY = camera.position.y;
    // cameraTargetY = cameraYOffset + roundDelta * SPREAD_Y * PACKET_SCALE;
    // camera.position.y = cameraFromY + (cameraTargetY - cameraFromY) * 0.1;

    camera.position.y = cameraYOffset + roundDelta * SPREAD_Y * PACKET_SCALE;
    camera.position.x = (peers.length - 1) * SPREAD_X * PACKET_SCALE * 0.5;

    renderer.render(scene, camera);

    requestAnimationFrame(render);
}

function renderPackets(messages: any[]) {
    if (!messages) {
        return;
    }

    const packets = messages.reduce((data, m) => {
        const msgId = Buffer.from(m.sig).toString('hex');
        const peerId = Buffer.from(m.peer).toString('hex');

        // FIXME: peers should be passed in
        if (!peers.includes(peerId)) {
            peers.push(peerId);
        }

        const xPos = peers.indexOf(peerId) * SPREAD_X * PACKET_SCALE;
        const yPos = m.round * SPREAD_Y * PACKET_SCALE;
        const position = [xPos, yPos, 0];

        let packetMesh: THREE.Mesh;
        if (threeObjects.has(msgId)) {
            packetMesh = threeObjects.get(msgId) as THREE.Mesh;
        } else {
            packetMesh = new THREE.Mesh(
                packetGeometry,
                new THREE.MeshBasicMaterial(),
            );
            scene?.add(packetMesh);
            threeObjects.set(msgId, packetMesh);
        }

        // Update colour
        const packetColor = m.parent
            ? m.originalRound % 6 > 2
                ? DEFAULT_PACKET_COLOR_1
                : DEFAULT_PACKET_COLOR_2
            : PARENTLESS_PACKET_COLOR;
        if (
            m.parent &&
            packetMesh.material instanceof THREE.MeshBasicMaterial
        ) {
            packetMesh.material.setValues({
                color: packetColor,
            });
        }

        // FIXME: We have to always set position as we position the packets by offset round
        packetMesh.position.set(position[0], position[1], position[2]);

        hasRendered.set(msgId, true);

        const props = {
            key: msgId,
            acks: m.acks.map((ack) => Buffer.from(ack).toString('hex')),
            parent: m.parent ? Buffer.from(m.parent).toString('hex') : null,
            position,
            peerId,
        };
        data.set(msgId, props);
        return data;
    }, new Map());

    return packets;
}

function renderLines(packets: Map<string, any>) {
    const lines = Array.from(packets.values()).reduce((data, packet) => {
        const fromPos = [...packet.position];
        const parentPos =
            packet.parent && packets.has(packet.parent)
                ? [...packets.get(packet.parent).position]
                : null;
        if (parentPos) {
            // console.log('line', fromPos, parentPos);
            data.push({
                key: `${packet.key}-${packet.parent}`,
                points: [fromPos, parentPos],
            });
        }
        packet.acks.forEach((ack) => {
            const toAckPos =
                ack && packets.has(ack) ? [...packets.get(ack).position] : null;
            if (toAckPos) {
                data.push({
                    key: `${packet.key}-${ack}`,
                    points: [fromPos, toAckPos],
                    color: getPeerColor(packet.peerId),
                });
            }
        });
        return data;
    }, []);

    lines.forEach(({ key, ...props }) => {
        // Redraw line in new pos if exists
        if (threeObjects.has(key)) {
            const line = threeObjects.get(key) as THREE.Line;

            // Didn't work!
            // line.geometry.setFromPoints([
            //     new THREE.Vector3(...props.points[0]),
            //     new THREE.Vector3(...props.points[1]),
            // ]);

            scene?.remove(line);
            line.geometry.dispose();
            if (line.material instanceof THREE.Material) {
                line.material.dispose();
            }
        }

        // Create new line
        const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(...props.points[0]),
                new THREE.Vector3(...props.points[1]),
            ]),
            new THREE.LineBasicMaterial({
                color: props.color || DEFAULT_LINE_COLOR,
                linewidth: LINE_WIDTH,
            }),
        );
        scene?.add(line);
        threeObjects.set(key, line);

        hasRendered.set(key, true);
    });
}

export async function onResize(width: number, height: number) {
    if (!canvas) {
        return;
    }

    // FIXME: This isn't working correctly

    canvas.width = width;
    canvas.height = height;

    aspectRatio = height / width;

    if (camera) {
        camera.top = aspectRatio;
        camera.bottom = -aspectRatio;
    }

    renderer?.setViewport(0, 0, width, height);
}

const getPeerColor = (peerId: string) => {
    if (peers.length === 0) {
        return 'white';
    }

    const index = peers.indexOf(peerId);
    if (index === -1) {
        return 'white';
    }

    return peerColors[index % peerColors.length];
};

const exports = {
    init,
    startGraph,
    stopGraph,
    onResize,
};
Comlink.expose(exports);
