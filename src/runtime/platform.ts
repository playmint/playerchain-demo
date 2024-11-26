export type Platform = {
    name: string;
    os: string;
    getCurrentWindowIndex(): Promise<number>;
    openExternal(url: string): Promise<void>;
    isMobile: boolean;
    isWindows: boolean;
    isProduction: boolean;
    isBrowser: boolean;
    newPlayerWindow(): Promise<void>;
    setSystemMenu(opts: { index: number; value: string }): Promise<void>;
};

// replaced with real platform by vite during build
const stubPlatform: Platform = {
    name: 'stub',
    os: 'stub',
    getCurrentWindowIndex: async () => {
        return 0;
    },
    openExternal: async (url: string) => {
        console.log('openExternal', url);
    },
    isMobile: false,
    isWindows: false,
    isProduction: false,
    isBrowser: false,
    newPlayerWindow: async () => {
        console.log('newPlayerWindow');
    },
    setSystemMenu: async () => {
        console.log('setSystemMenu');
    },
};

export default stubPlatform;
