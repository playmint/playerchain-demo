import * as Comlink from 'comlink';
import Dexie from 'dexie';
import * as THREE from 'three';
import database, { DB } from '../../runtime/db';

const PACKET_SCALE = 0.1;
const SPREAD_X = 5;
const SPREAD_Y = 2;
const LINE_WIDTH = 2;
const DEFAULT_LINE_COLOR = 'grey';

const packetGeometry = new THREE.BoxGeometry(
    PACKET_SCALE,
    PACKET_SCALE,
    PACKET_SCALE,
);
const packetMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

let db: DB;
let fetching = false;
let canvas: OffscreenCanvas | undefined;
let aspectRatio: number;
let packets: any;
let prevPackets: any;
let peers: string[] = [];

export async function init(dbname: string) {
    db = database.open(dbname);
}

// export async function fetchPackets(_channelId: string, limit: number = 300) {
//     console.time('fetchPackets');
//     await new Promise((resolve) => setTimeout(resolve, limit));
//     console.timeEnd('fetchPackets');
// }

export async function fetchPackets(channelId: string, limit: number = 300) {
    if (fetching) {
        console.log('worker: lace fetch skip');
        return;
    }

    fetching = true;
    prevPackets = packets;
    packets = await db.messages
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
            }));
            return { minRound, maxRound, messagesWithOffsetRound };
        });

    fetching = false;
    return packets;
}

let scene: THREE.Scene;
let renderer: THREE.WebGLRenderer;
let camera: THREE.OrthographicCamera;

export async function setCanvas(_canvas: OffscreenCanvas) {
    canvas = _canvas;
    const { width, height } = canvas;

    console.log('packetlace.worker: offscreen canvas set:', width, height);

    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ canvas });
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

    peers = [];

    requestAnimationFrame(render);
}

export async function unsetCanvas() {
    renderer.dispose();
    canvas = undefined;
}

function render() {
    if (!canvas) {
        return;
    }

    renderPackets(packets.messagesWithOffsetRound);
    renderer.render(scene, camera);

    const roundDelta =
        packets.maxRound && packets.minRound
            ? packets.maxRound - packets.minRound
            : 0;

    const rowsOfSpace = 3;
    const cameraYOffset =
        (aspectRatio - rowsOfSpace * SPREAD_Y * PACKET_SCALE) * -1;
    camera.position.y = cameraYOffset + roundDelta * SPREAD_Y * PACKET_SCALE;
    camera.position.x = (peers.length - 1) * SPREAD_X * PACKET_SCALE * 0.5;

    requestAnimationFrame(render);
}

function renderPackets(messages: any[]) {
    if (!messages) {
        return;
    }

    const messageMap = messages.reduce((data, m) => {
        const msgId = Buffer.from(m.sig).toString('hex');
        const peerId = Buffer.from(m.peer).toString('hex');

        // FIXME: peers should be passed in
        if (!peers.includes(peerId)) {
            peers.push(peerId);
        }

        const xPos = peers.indexOf(peerId) * SPREAD_X * PACKET_SCALE;
        const yPos = m.round * SPREAD_Y * PACKET_SCALE;
        const position = [xPos, yPos, 0];

        const packetMesh = new THREE.Mesh(packetGeometry, packetMat);
        packetMesh.position.set(position[0], position[1], position[2]);
        scene.add(packetMesh);

        const props = {
            key: msgId,
            acks: m.acks.map((ack) => Buffer.from(ack).toString('hex')),
            parent: m.parent ? Buffer.from(m.parent).toString('hex') : null,
            position,
            mesh: packetMesh,
        };
        data.set(msgId, props);
        return data;
    }, new Map());
}

const exports = {
    init,
    fetchPackets,
    setCanvas,
};
Comlink.expose(exports);
