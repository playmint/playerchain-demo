import type { Platform } from '../platform';

const browserPlatform: Platform = {
    name: 'browser',
    os: 'web',

    getCurrentWindowIndex: async () => {
        return 0;
    },

    openExternal: async (url: string) => {
        window.open(url, '_blank');
    },

    isMobile: false,
    isWindows: false,
    isProduction: import.meta.env.MODE === 'production',
    isBrowser: true,

    newPlayerWindow: async () => {
        console.log('noop');
    },

    setSystemMenu: async (_opts) => {
        console.log('noop');
    },
};

export default browserPlatform;
