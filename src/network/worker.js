import { Store } from '../store/store.js';

const updaterCh = new BroadcastChannel("updater");

function init() {
    console.log('init network');
    processPacket();
}

let actions = new Map();
actions.set(200, { back: true });

function processPacket() {
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
        case 'updateInput':
            console.log('net resv input', payload);
            actions.set(100, payload);
    }
};