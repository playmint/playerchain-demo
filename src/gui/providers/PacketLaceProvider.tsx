import * as Comlink from 'comlink';
import React from 'react';
import { PLAYER_COLORS } from '../fixtures/player-colors';
import { useAsyncMemo } from '../hooks/use-async';
import { useCredentials } from '../hooks/use-credentials';
import {
    PacketLaceContext,
    PacketLaceContextType,
} from '../hooks/use-packetlace';

export const PackerLaceProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const { dbname } = useCredentials();

    console.log('packetLace provider render');

    // create packetLace
    const packetLace = useAsyncMemo<PacketLaceContextType | undefined>(
        async (defer) => {
            if (!dbname) {
                return;
            }
            const w = new Worker(
                new URL('../workers/packetlace.worker.tsx', import.meta.url),
                {
                    type: 'module',
                    /* @vite-ignore */
                    name: `packetLace worker`,
                },
            );
            defer(async () => {
                w.terminate();
                console.log(`packetLace worker terminated`);
            });
            console.log(`packetLace worker started`);
            const c: PacketLaceContextType =
                Comlink.wrap<PacketLaceContextType>(w);
            await c.init(dbname, PLAYER_COLORS);
            console.log(`packetLace worker init`);
            defer(async () => {
                // await c.shutdown();
                console.log(`packetLace shutdown`);
            });
            globalThis.client = c;
            console.log(`packetLace worker ready`);
            return c;
        },
        [dbname],
    );

    if (!packetLace) {
        return <div>Loading packetLace...</div>;
    }

    return (
        <PacketLaceContext.Provider value={packetLace}>
            {children}
        </PacketLaceContext.Provider>
    );
};
