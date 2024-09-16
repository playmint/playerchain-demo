import * as Comlink from 'comlink';
import { memo, useEffect, useRef, useState } from 'react';
import { useDatabase } from '../hooks/use-database';
import { usePacketLace } from '../hooks/use-packetlace';

// const HIGHLIGHTED_LINE_COLOR = 'cyan';
// const MAX_ROUNDS = 8; // 0 to show all rounds
// const CAM_LERP_SPEED = 0.02;

// type Message = InputMessage & ChainMessageProps & PostSignMessageProps;

export function PacketLace({
    channelId,
    peers,
}: {
    channelId: string;
    peers: string[];
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const packetLace = usePacketLace();

    // const db = useDatabase();

    useEffect(() => {
        if (!packetLace) {
            console.log('no packetlace');
            return;
        }

        if (!canvasRef.current) {
            console.log('no canvas ref');
            return;
        }

        console.log('packetlace canvas setup');

        const pixelRatio = window.devicePixelRatio || 1;

        const canvas = canvasRef.current;
        canvas.width = canvas.clientWidth * pixelRatio;
        canvas.height = canvas.clientHeight * pixelRatio;

        const offscreen = canvasRef.current.transferControlToOffscreen();
        packetLace
            .startGraph(
                Comlink.transfer(offscreen, [offscreen]),
                channelId,
                300,
                1000,
            )
            .catch(console.error);

        return () => {
            packetLace.stopGraph().catch(console.error);
        };
    }, [channelId, packetLace]);

    // window resize listener
    useEffect(() => {
        const onResize = () => {
            if (!packetLace) {
                return;
            }
            const canvas = canvasRef.current;
            if (!canvas) {
                return;
            }
            const pixelRatio = window.devicePixelRatio || 1;
            packetLace
                .onResize(
                    canvas.clientWidth * pixelRatio,
                    canvas.clientHeight * pixelRatio,
                )
                .catch(console.error);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [packetLace]);

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: '100%',
                backgroundColor: 'black',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: 'relative', width: '100%', height: '100%' }}
            />
        </div>
    );
}
