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
let peers: string[] = [];
const threeObjects: Map<string, any> = new Map();
const hasRendered: Map<string, boolean> = new Map();

export async function init(dbname: string) {
    db = database.open(dbname);
}

export async function fetchPackets(channelId: string, limit: number = 300) {
    if (fetching) {
        console.log('worker: lace fetch skip');
        return;
    }

    fetching = true;
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

    peers = [];

    requestAnimationFrame(render);
}

export async function unsetCanvas() {
    renderer.dispose();
    canvas = undefined;
    threeObjects.clear();
    hasRendered.clear();
    peers = [];
}

function render() {
    if (!canvas) {
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
            const packetMesh = threeObjects.get(key);
            scene.remove(packetMesh);
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

    const rowsOfSpace = 3;
    const cameraYOffset =
        (aspectRatio - rowsOfSpace * SPREAD_Y * PACKET_SCALE) * -1;
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
            packetMesh = threeObjects.get(msgId);
        } else {
            packetMesh = new THREE.Mesh(packetGeometry, packetMat);
            scene.add(packetMesh);
            threeObjects.set(msgId, packetMesh);
        }

        // FIXME: We have to always set position as we position the packets by offset round
        packetMesh.position.set(position[0], position[1], position[2]);

        hasRendered.set(msgId, true);

        const props = {
            key: msgId,
            acks: m.acks.map((ack) => Buffer.from(ack).toString('hex')),
            parent: m.parent ? Buffer.from(m.parent).toString('hex') : null,
            position,
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
                    color: 0xefefef,
                });
            }
        });
        return data;
    }, []);

    lines.forEach(({ key, ...props }) => {
        if (threeObjects.has(key)) {
            // Redraw line in new pos if exists
            let line = threeObjects.get(key);

            // Didn't work!
            // line.geometry.setFromPoints([
            //     new THREE.Vector3(...props.points[0]),
            //     new THREE.Vector3(...props.points[1]),
            // ]);

            scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
            line = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(...props.points[0]),
                    new THREE.Vector3(...props.points[1]),
                ]),
                new THREE.LineBasicMaterial({
                    color: props.color || DEFAULT_LINE_COLOR,
                    linewidth: LINE_WIDTH,
                }),
            );
            scene.add(line);
            threeObjects.set(key, line);
        } else {
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
            scene.add(line);
            threeObjects.set(key, line);
        }

        hasRendered.set(key, true);
    });
}

const exports = {
    init,
    fetchPackets,
    setCanvas,
};
Comlink.expose(exports);
