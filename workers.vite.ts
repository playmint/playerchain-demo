import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import externalize from 'vite-plugin-externalize-dependencies';

const externals = [/^socket:.*/];

export default defineConfig({
    base: '/workers/',
    plugins: [
        externalize({
            externals,
        }),
    ],
    envPrefix: 'SS',
    build: {
        outDir: 'public/workers',
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 2000,
        lib: {
            formats: ['es'],
            entry: [
                resolve(__dirname, './src/gui/workers/client.worker.ts'),
                resolve(__dirname, './src/gui/workers/simulation.worker.ts'),
            ],
        },
        rollupOptions: {
            external: externals,
        },
        emptyOutDir: false,
        copyPublicDir: false,
    },
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
});
