import * as Comlink from 'comlink';
import React from 'react';
import { useAsyncMemo } from '../hooks/use-async';
import { ClientContext, ClientContextType } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';

export const ClientProvider = ({ children }: { children: React.ReactNode }) => {
    const { keys, dbname } = useCredentials();

    console.log('client provider render');

    // create client
    const client = useAsyncMemo<ClientContextType | undefined>(
        async (defer) => {
            if (!keys) {
                console.log('keys is required');
                return;
            }
            if (!dbname) {
                return;
            }
            const w = new Worker(
                new URL('../workers/client.worker.ts', import.meta.url),
                {
                    type: 'module',
                    /* @vite-ignore */
                    name: `${dbname} worker`,
                },
            );
            defer(async () => {
                w.terminate();
                console.log(`${dbname} worker terminated`);
            });
            console.log(`${dbname} worker started`);
            const c: ClientContextType = Comlink.wrap<ClientContextType>(w);
            await c.init({ keys, dbname });
            console.log(`${dbname} worker init`);
            defer(async () => {
                await c.shutdown();
                console.log(`${dbname} shutdown`);
            });
            globalThis.client = c;
            console.log(`${dbname} worker ready`);
            return c;
        },
        [keys, dbname],
    );

    if (!client) {
        return <div>Loading client...</div>;
    }

    return (
        <ClientContext.Provider value={client}>
            {children}
        </ClientContext.Provider>
    );
};
