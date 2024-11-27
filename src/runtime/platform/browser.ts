import type { Platform } from '../platform';

function hasTouchSupport() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

const browserPlatform: Platform = {
    name: 'browser',
    os: 'web',

    getCurrentWindowIndex: async () => {
        return 0;
    },

    openExternal: async (url: string) => {
        window.open(url, '_blank');
    },

    isMobile:
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent,
        ) || hasTouchSupport(),
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
