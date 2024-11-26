import application from 'socket:application';
import process from 'socket:process';
import type { Platform } from '../platform';

const socketPlatform: Platform = {
    name: 'socket',
    os: process.platform,

    getCurrentWindowIndex: async () => {
        return application.getCurrentWindowIndex();
    },

    openExternal: async (url: string) => {
        const window = await application.getCurrentWindow();
        await window.openExternal(url);
    },

    isMobile: /android|ios/.test(process.platform),
    isWindows: /win32/.test(process.platform),
    isProduction: import.meta.env.MODE === 'production',
    isBrowser: false,

    newPlayerWindow: async () => {
        const windows = await application.getWindows();
        const maxIndex = Math.max(...windows.values().map((w) => w.index));
        await application.createWindow({
            index: maxIndex + 1,
            closable: true,
            titlebarStyle: 'hidden',
            path: `${window.origin}/index.html`,
            width: 1152,
            height: 768,
            minWidth: 640,
            minHeight: 480,
        });
    },

    setSystemMenu: async (opts) => {
        await application.setSystemMenu(opts);
    },
};

export default socketPlatform;
