import { execSync } from 'node:child_process';
import path from 'node:path';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

//---------------------------------------------------------------------------+
// IMPORTANT README                                                          |
//---------------------------------------------------------------------------+
// if you have stumbled upon this file because you have some kind of import
// error then you probably need to know what this is all about.
//
// the runtime/Client should remain agnostic to the environment it is loaded in.
// this is because we run the Client in both socket and in nodejs environments.
//
// this means that Client (or anything that Client imports) should not depend on
// any socket library that requires the socket runtime
//
// _some_ socket libraries are compatible with nodejs and can be imported but
// most cannot.
//
// you should make Client accept dependencies via the config so that compatible
// deps can be injected during Client instantiation, rather than being imported
// directly. and use `import type` to avoid importing the actual implementation.
//
// see what is being done for the Buffer, Encryption, NAT, network
//
// see src/cli for how the client is loaded from nodejs see src/gui/workers for
// how the client is loaded from a worker
//
// if you _really_ think the import should work, then you can add to the list of
// resolve.alias below.
//
//---------------------------------------------------------------------------+

// exec ssc env to find the environment values
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
    envPrefix: 'SS',
    mode: 'production',
    resolve: {
        alias: {
            'socket:buffer': path.join(SOCKET_HOME_API, 'buffer.js'),
            'socket:node/index': path.join(SOCKET_HOME_API, 'node/index.js'),
            'socket:latica': path.join(SOCKET_HOME_API, 'latica/index.js'),
        },
    },
    build: {
        ssr: true,
        outDir: 'dist',
        target: 'esnext',
        minify: false,
        chunkSizeWarningLimit: 2000,
        lib: {
            formats: ['es'],
            entry: [resolve(__dirname, './src/cli/cli.ts')],
        },
        emptyOutDir: false,
        copyPublicDir: false,
    },
});
