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

    // build the sandbox
    const sandboxBuildRuntime = await esbuild.context({
        outdir: path.join(target, 'sandbox'),
        format: 'esm',
        bundle: true,
        minify: false,
        sourcemap: false,
        external: ['socket:*'],
        logLevel: 'debug',
        entryPoints: ['./src/substream/sandbox/index.ts'],
    });
    await sandboxBuildRuntime.rebuild();

    // include the TextEncoder polyfill
    fs.copyFileSync(
        './node_modules/fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js',
        path.join(target, 'EncoderDecoderTogether.min.js'),
    );

    // include the html file
    fs.copyFileSync('./src/index.html', path.join(target, 'index.html'));
    fs.copyFileSync('./src/player.html', path.join(target, 'player.html'));
    fs.copyFileSync('./src/UIStyles.css', path.join(target, 'UIStyles.css'));

    // copy the static assets
    fs.cpSync('./assets', path.join(target, 'assets'), {
        recursive: true,
        force: true,
        preserveTimestamps: true,
    });

    // copy the static assets
    fs.cpSync('./data', path.join(target, 'data'), {
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

    // copy quickJS wasm module
    fs.cpSync(
        'node_modules/.pnpm/@jitl+quickjs-wasmfile-release-sync@0.29.2/node_modules/@jitl/quickjs-wasmfile-release-sync/dist',
        path.join(target),
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
