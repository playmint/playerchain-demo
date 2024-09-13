import * as Comlink from 'comlink';
import Dexie from 'dexie';
import database, { DB } from '../../runtime/db';

let db: DB;
let fetching = false;
let canvas: OffscreenCanvas;

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
    if (canvas) {
        const context = canvas.getContext('2d');
        if (context) {
            context.fillStyle = 'red';
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
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
            }));
            return { minRound, maxRound, messagesWithOffsetRound };
        });

    fetching = false;
    return packets;
}

export async function setCanvas(_canvas: OffscreenCanvas) {
    canvas = _canvas;
    console.log(
        'packetlace.worker: offscreen canvas set:',
        canvas.width,
        canvas.height,
    );
}

const exports = {
    init,
    fetchPackets,
    setCanvas,
};
Comlink.expose(exports);
