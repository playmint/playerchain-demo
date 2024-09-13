import * as Comlink from 'comlink';
import React, { memo, useMemo } from 'react';
import { load } from '../../runtime/game';
import { SequencerMode } from '../../runtime/sequencer';
import { Simulation } from '../../runtime/simulation';
import { TerminalStyle } from '../components/Terminal';
import { useAsyncMemo } from '../hooks/use-async';
import { useCredentials } from '../hooks/use-credentials';
import { SimulationContext } from '../hooks/use-simulation';

export default memo(function SimulationProvider({
    channelId,
    src,
    rate,
    children,
    peerId,
    channelPeerIds,
    inputDelay,
}: {
    peerId: string;
    channelPeerIds: string[];
    channelId: string;
    src: string;
    rate: number;
    inputDelay: number; // in "ticks" not ms
    children: React.ReactNode;
}) {
    const { keys, dbname } = useCredentials();
    // console.log(`SimulationProvider ${src} ${rate}`);

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
            const s = await new SimulationProxy({
                channelId,
                dbname,
                src,
                rate,
                peerId,
                mode: SequencerMode.CORDIAL,
                channelPeerIds,
                inputDelay,
            });
            await s.init();
            defer(async () => {
                await s.destroy();
                console.log(`sim shutdown`);
            });

            return s;
        },
        [src, rate, dbname, keys, channelId, channelPeerIds.join('|')],
    );

    const mod = useAsyncMemo(async () => load(src), [src]);

    const ctx = useMemo(() => {
        return { sim, rate, mod };
    }, [sim, rate, mod]);

    if (!sim) {
        return <div style={TerminalStyle}>Loading simulation...</div>;
    }

    if (!mod) {
        return <div style={TerminalStyle}>Loading module...</div>;
    }

    return (
        <SimulationContext.Provider value={ctx}>
            {children}
        </SimulationContext.Provider>
    );
});
