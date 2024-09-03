import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: '/examples/',
    plugins: [],
    envPrefix: 'SS',
    build: {
        outDir: 'public/examples',
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 2000,
        lib: {
            formats: ['es'],
            entry: [
                resolve(__dirname, './src/examples/cubes.ts'),
                resolve(__dirname, './src/examples/spaceshooter.ts'),
            ],
        },
        emptyOutDir: false,
        copyPublicDir: false,
    },
});
