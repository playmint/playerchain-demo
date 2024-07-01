import { Store } from '../store/store.js';

const updaterCh = new BroadcastChannel("updater");

function init() {
    console.log('init network');
    processPacket();
}

function processPacket() {

    const actions = new Map();
    actions.set(100, { forward: true });
    actions.set(200, { back: true });
    updaterCh.postMessage(actions);

    setTimeout(processPacket, 100);
}

self.onmessage = function (message) {
    const { data } = message;
    const { type, payload } = data;
    switch (type) {
        case 'init':
            init();
            break;
    }
};