import * as Comlink from 'comlink';
import React, { useMemo } from 'react';
import { load } from '../../runtime/game';
import { Simulation } from '../../runtime/simulation';
import { useAsyncMemo } from '../hooks/use-async';
import { useCredentials } from '../hooks/use-credentials';
import { SimulationContext } from '../hooks/use-simulation';

export const SimulationProvider = ({
    channelId,
    src,
    rate,
    children,
}: {
    channelId: string;
    src: string;
    rate: number;
    children: React.ReactNode;
}) => {
    // const { transport } = useTransport();
    const { keys, dbname } = useCredentials();

    const sim = useAsyncMemo<Comlink.Remote<Simulation> | undefined>(
        async (defer) => {
            if (!keys) {
                return;
            }
            if (!dbname) {
                return;
            }
            const w = new Worker(
                // this worker is built seperately from the rest of the app
                // to work around issues with vite in dev mode
                // see workers.vite.ts
                new URL('../workers/simulation.worker.ts', import.meta.url),
                {
                    type: 'module',
                    /* @vite-ignore */
                    name: `sim worker`,
                },
            );
            defer(async () => {
                w.terminate();
                console.log(`sim worker terminated`);
            });
            const SimulationProxy = Comlink.wrap<typeof Simulation>(w);
            const sim = await new SimulationProxy({
                channelId,
                dbname,
                src,
                rate,
            });
            defer(async () => {
                await sim.destroy();
                console.log(`sim shutdown`);
            });

            return sim;
        },
        [src, rate, dbname, keys, channelId],
    );

    const mod = useAsyncMemo(async () => load(src), [src]);

    const ctx = useMemo(() => {
        return { sim, rate, mod };
    }, [sim, rate, mod]);

    if (!sim) {
        return <div>Loading simulation...</div>;
    }

    if (!mod) {
        return <div>Loading module...</div>;
    }

    return (
        <SimulationContext.Provider value={ctx}>
            {children}
        </SimulationContext.Provider>
    );
};
