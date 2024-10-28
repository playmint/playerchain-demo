import * as Comlink from 'comlink';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useEffect } from 'react';
import { NETWORK_ID } from '../../runtime/config';
import { Loading } from '../components/Loading';
import { useAsyncMemo } from '../hooks/use-async';
import { ClientContext, ClientContextType } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';

export const ClientProvider = ({ children }: { children: React.ReactNode }) => {
    const [resetCount, setResetCount] = React.useState(0);
    const [isReady, setIsReady] = React.useState(false);
    const { keys, dbname } = useCredentials();
    const db = useDatabase();
    const network = useLiveQuery(() => {
        return db.network.get(NETWORK_ID);
    }, []);

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
        [keys, dbname, resetCount],
    );

    useEffect(() => {
        if (isReady && !network) {
            console.log(
                'Network settings missing after client init! Resetting client...',
            );
            setIsReady(false);
            setResetCount((prev) => prev + 1);
            return;
        }
        if (client && network) {
            setIsReady(true);
        }
    }, [client, isReady, network]);

    if (!client) {
        return <Loading />;
    }

    if (!network) {
        return <Loading />;
    }

    return (
        <ClientContext.Provider value={client}>
            {children}
        </ClientContext.Provider>
    );
};
