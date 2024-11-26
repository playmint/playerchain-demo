import react from '@vitejs/plugin-react-swc';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import path from 'node:path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function getSocketEnv(name: string) {
    const out = execSync('ssc env').toString();
    const lines = out.split('\n').map((line) => line.trim());
    for (const line of lines) {
        if (line.startsWith(`${name}=`)) {
            return line.split('=')[1];
        }
    }
    throw new Error(
        `Failed to find ${name} in ssc env. is ssc installed correctly?`,
    );
}

const SOCKET_HOME_API = getSocketEnv('SOCKET_HOME_API');
console.log('SOCKET_HOME_API:', SOCKET_HOME_API);

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: [
                    '**/*.{js,css,html,ico,png,svg,glb,gltf,wasm,woff2,mp3}',
                ],
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
            },
            pwaAssets: {
                disabled: false,
                config: true,
            },
            manifest: {
                name: 'Space Shooter',
                short_name: 'SpaceShooter',
                description: 'Space Shooter Game',
                theme_color: '#555555',
            },
        }),
    ],
    envPrefix: 'SS',
    resolve: {
        alias: {
            'socket:dgram': 'wgram',
            'socket:buffer': path.join(SOCKET_HOME_API, 'buffer.js'),
            'runtime:platform': path.resolve(
                __dirname,
                'src/runtime/platform/browser.ts',
            ),
        },
    },
    build: {
        outDir: 'dist',
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            input: {
                pwa: resolve(__dirname, 'index.html'),
            },
        },
        emptyOutDir: false,
        cssMinify: 'lightningcss',
    },
    css: {
        transformer: 'lightningcss',
        lightningcss: {
            cssModules: {},
        },
    },
    assetsInclude: ['**/*.gltf', '**/*.glb', '**/*.wasm'],
    worker: {
        format: 'es',
        plugins: () => [],
    },
    server: {
        hmr: {
            overlay: false,
        },
    },
});
