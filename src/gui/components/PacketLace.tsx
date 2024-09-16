import * as Comlink from 'comlink';
import { memo, useEffect, useRef, useState } from 'react';
import { useDatabase } from '../hooks/use-database';
import { usePacketLace } from '../hooks/use-packetlace';

// const HIGHLIGHTED_LINE_COLOR = 'cyan';
// const MAX_ROUNDS = 8; // 0 to show all rounds
// const CAM_LERP_SPEED = 0.02;

// type Message = InputMessage & ChainMessageProps & PostSignMessageProps;

export interface PacketLineProps {
    points: any;
    color?: any;
}

export function PacketLace({
    channelId,
    peers,
}: {
    channelId: string;
    peers: string[];
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasRef = !!canvasRef.current;
    const packetLace = usePacketLace();

    const db = useDatabase();

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
            .setCanvas(Comlink.transfer(offscreen, [offscreen]))
            .catch(console.error);
    }, [packetLace]);

    // TODO: Move the interval inside the worker
    useEffect(() => {
        if (!packetLace) {
            return;
        }
        let fetching = false;
        const timer = setInterval(() => {
            if (fetching) {
                console.log('lace fetch skip');
                return;
            }
            fetching = true;

            console.time('worker-fetch');

            packetLace
                .fetchPackets(channelId, 2500)
                .catch((err) => console.error('fetchPackets-err', err))
                .finally(() => {
                    console.timeEnd('worker-fetch');
                    fetching = false;
                });
        }, 1100);
        return () => {
            clearInterval(timer);
            console.timeEnd('worker-fetch');
        };
    }, [channelId, db, packetLace]);

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
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ position: 'relative', width: '100%', height: '100%' }}
            />
        </div>
    );
}
