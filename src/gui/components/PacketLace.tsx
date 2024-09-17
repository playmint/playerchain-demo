import * as Comlink from 'comlink';
import { useEffect, useRef, useState } from 'react';
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
    const [offscreenCanvas, setOffscreenCanvas] = useState<OffscreenCanvas>();
    const packetLace = usePacketLace();

    useEffect(() => {
        if (!canvasRef.current) {
            return;
        }

        if (offscreenCanvas) {
            return;
        }

        // NOTE: I have seen instances where the canvas has already had it's control transferred to offscreen and accessing any properties on the canvas will through an error.
        try {
            const pixelRatio = window.devicePixelRatio || 1;
            const canvas = canvasRef.current;
            canvas.width = canvas.clientWidth * pixelRatio;
            canvas.height = canvas.clientHeight * pixelRatio;

            const offscreen = canvas.transferControlToOffscreen();
            setOffscreenCanvas(offscreen);
        } catch (e) {
            console.error(e);
        }
    }, [offscreenCanvas]);

    useEffect(() => {
        if (!packetLace) {
            return;
        }

        if (!offscreenCanvas) {
            return;
        }

        packetLace
            .startGraph(
                Comlink.transfer(offscreenCanvas, [offscreenCanvas]),
                channelId,
                300,
                1000,
                peers,
            )
            .catch(console.error);

        return () => {
            packetLace.stopGraph().catch(console.error);
        };
    }, [channelId, packetLace, peers, offscreenCanvas]);

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
