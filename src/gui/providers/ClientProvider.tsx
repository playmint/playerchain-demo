import * as Comlink from 'comlink';
import React from 'react';
import { useAsyncMemo } from '../hooks/use-async';
import { ClientContext, ClientContextType } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';

// import { useTransport } from '../hooks/use-transport';

export const ClientProvider = ({ children }: { children: React.ReactNode }) => {
    // const { transport } = useTransport();
    const { keys, dbname } = useCredentials();

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

    // connect client to transport
    // useLayoutEffect(() => {
    //     if (!client) {
    //         return;
    //     }
    //     if (!transport) {
    //         return;
    //     }
    //     console.debug('client-connected-transport');
    //     client.connect(transport);
    //     return () => {
    //         if (client) {
    //             client.disconnect();
    //             console.debug('client-disconnected-transport');
    //         }
    //     };
    // }, [client, transport]);

    if (!client) {
        return <div>Loading client...</div>;
    }

    return (
        <ClientContext.Provider value={client}>
            {children}
        </ClientContext.Provider>
    );
};
