import esbuild from 'esbuild';
import { globSync } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

async function build() {
    const SSC_ENV = mustGetEnv('SSC_ENV');
    const SSC_PREFIX = mustGetEnv('PREFIX');

    const target = path.resolve(SSC_PREFIX);
    const prod = SSC_ENV === 'prod';
    const watch = !!process.argv.includes('--watch');
    const testing = SSC_ENV === 'test';

    const options = {
        outdir: target,
        format: 'esm',
        bundle: true,
        minify: false,
        sourcemap: false,
        external: ['socket:*'],
        logLevel: 'debug',
    };

    // include the html file
    fs.copyFileSync('./src/index.html', path.join(target, 'index.html'));

    // copy the static assets
    fs.cpSync('./assets', path.join(target, 'assets'), {
        recursive: true,
        force: true,
        preserveTimestamps: true,
    });

    // copy any libraries that are needed at runtime from node_modules
    fs.cpSync(
        './node_modules/three/examples/jsm/libs',
        path.join(target, 'libs'),
        {
            recursive: true,
            force: true,
        },
    );

    // find all the entrypoints for the runtime
    const workerEntrypoints = globSync('./src/**/*worker.ts');
    const entryPoints = [
        './src/index.ts',
        './src/runtime/index.ts',
        ...workerEntrypoints,
    ];
    console.log(`• esbuild tracking entrypoints: ${entryPoints}`);

    // build entrypoints for each file in the src/entrypoints
    const runtime = await esbuild.context({
        ...options,
        entryPoints,
    });

    // If the watch command is specified, let esbuild start its server
    if (watch && (prod || testing)) {
        console.log(`• esbuild watch disabled for ${SSC_ENV} build`);
    } else if (watch) {
        console.log('• esbuild watch');
        await runtime.watch();
        await sleep(999999); // block "forever"
    } else if (testing) {
        console.log('• esbuild build once with tests');
        await runtime.rebuild();
        await esbuild.build({
            ...options,
            entryPoints: ['./tests/index.ts'],
            outdir: path.join(target, 'tests'),
        });
    } else {
        console.log('• esbuild build once');
        await runtime.rebuild();
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mustGetEnv(name) {
    const v = process.env[name];
    if (!v) {
        throw new Error(`required environment variable ${name} not provided`);
    }
    return v;
}

build()
    .then(() => {
        console.log(`• esbuild done`);
        process.exit(0);
    })
    .catch((err) => {
        console.log(`• esbuild error: ${err.message}`);
        process.exit(1);
    });
