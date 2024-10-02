import * as Comlink from 'comlink';
import { memo, useEffect, useRef } from 'react';
import { PLAYER_COLORS } from '../fixtures/player-colors';
import { useAsyncMemo } from '../hooks/use-async';
import { useCredentials } from '../hooks/use-credentials';

// const HIGHLIGHTED_LINE_COLOR = 'cyan';
// const MAX_ROUNDS = 8; // 0 to show all rounds
// const CAM_LERP_SPEED = 0.02;

// type Message = InputMessage & ChainMessageProps & PostSignMessageProps;
interface PacketLaceProxy {
    init(dbname: string, peerColors: number[]): Promise<void>;
    fetchPackets(channelId: string, limit: number): Promise<unknown>;
    startGraph(
        canvas: OffscreenCanvas,
        channelID: string,
        packetLimit: number,
        fetchIntervalMs: number,
        peers: string[],
    ): Promise<void>;
    stopGraph(): Promise<void>;
    onResize(width: number, height: number): Promise<void>;
}

export default memo(function PacketLace({
    channelId,
    peers,
}: {
    channelId: string;
    peers: string[];
}) {
    const { dbname } = useCredentials();
    const containerRef = useRef<HTMLDivElement>(null);

    // create worker
    const packetLace = useAsyncMemo<PacketLaceProxy | undefined>(
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
            const c: PacketLaceProxy = Comlink.wrap<PacketLaceProxy>(w);
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

    // cerate canvas
    useEffect(() => {
        if (!packetLace) {
            return;
        }
        const container = containerRef.current;
        if (!container) {
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 910;
        container.appendChild(canvas);
        const offscreenCanvas = canvas.transferControlToOffscreen();
        packetLace
            .startGraph(
                Comlink.transfer(offscreenCanvas, [offscreenCanvas]),
                channelId,
                48,
                1000,
                peers,
            )
            .catch(console.error);

        return () => {
            packetLace.stopGraph().catch(console.error);
            container.removeChild(canvas);
        };
    }, [channelId, packetLace, peers]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                backgroundColor: 'transparent',
                overflow: 'hidden',
            }}
        ></div>
    );
});
