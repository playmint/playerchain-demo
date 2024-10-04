import react from '@vitejs/plugin-react-swc';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import externalize from 'vite-plugin-externalize-dependencies';

const externals = [/^socket:.*/];

export default defineConfig({
    plugins: [
        react(),
        externalize({
            externals,
        }),
    ],
    envPrefix: 'SS',
    build: {
        outDir: 'dist',
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
            external: externals,
            input: {
                main: resolve(__dirname, 'index.html'),
                test: resolve(__dirname, 'src/tests/tests.html'),
                diorama: resolve(__dirname, 'src/diorama.html'),
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
        rollupOptions: {
            external: externals,
        },
        plugins: () => [
            externalize({
                externals,
            }),
        ],
    },
    server: {
        hmr: {
            overlay: false,
        },
    },
});
