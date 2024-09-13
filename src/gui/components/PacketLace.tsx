import { Line, OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as Comlink from 'comlink';
import Dexie from 'dexie';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import {
    ChainMessageProps,
    InputMessage,
    PostSignMessageProps,
} from '../../runtime/messages';
import { useDatabase } from '../hooks/use-database';
import { usePacketLace } from '../hooks/use-packetlace';

const PACKET_SCALE = 0.1;
const SPREAD_X = 5;
const SPREAD_Y = 2;
const LINE_WIDTH = 2;
const DEFAULT_LINE_COLOR = 'grey';
// const HIGHLIGHTED_LINE_COLOR = 'cyan';
// const MAX_ROUNDS = 8; // 0 to show all rounds
// const CAM_LERP_SPEED = 0.02;
// const TICK_SPEED = 250;

type Message = InputMessage & ChainMessageProps & PostSignMessageProps;

export interface PacketLineProps {
    points: any;
    color?: any;
}

const PacketLine = ({ points, color }: PacketLineProps) => {
    return (
        <Line
            points={points}
            color={color || DEFAULT_LINE_COLOR}
            lineWidth={LINE_WIDTH}
        />
    );
};

const Packet = ({
    position,
    color,
    // message,
    // setHoveredMessage,
}: {
    position: Vector3;
    color: string;
    lines: PacketLineProps[];
    // message: Message;
    // setHoveredMessage: (message: Message | null) => void;
}) => {
    // const [hovered, setHovered] = useState(false);

    return (
        <>
            <mesh
                position={position}
                onPointerOver={() => {
                    // setHovered(true);
                    // setHoveredMessage(message);
                }}
                onPointerOut={() => {
                    // setHovered(false);
                    // setHoveredMessage(null);
                }}
            >
                <boxGeometry
                    args={[PACKET_SCALE, PACKET_SCALE, PACKET_SCALE]}
                />
                <meshStandardMaterial color={color} />
            </mesh>
        </>
    );
};

function PacketVisualization({
    peers,
    messages,
    // onHighestYChange,
    // setHoveredMessage,
}: {
    peers: string[];
    messages: Message[];
    // onHighestYChange: (y: number) => void;
    // setHoveredMessage: (m: Message | null) => void;
}) {
    // calculate all the packet props
    const packets = useMemo(
        () =>
            messages.reduce((data, m) => {
                const msgId = Buffer.from(m.sig).toString('hex');
                const peerId = Buffer.from(m.peer).toString('hex');
                const xPos = peers.indexOf(peerId) * SPREAD_X * PACKET_SCALE;
                const yPos = m.round * SPREAD_Y * PACKET_SCALE;
                const extraX = 0; // FIXME: forked
                const position = [xPos + extraX, yPos, 0];
                const props = {
                    key: msgId,
                    acks: m.acks.map((ack) => Buffer.from(ack).toString('hex')),
                    parent: m.parent
                        ? Buffer.from(m.parent).toString('hex')
                        : null,
                    position,
                };
                data.set(msgId, props);
                return data;
            }, new Map()),
        [messages, peers],
    );

    // calculate all the line props
    const lines: PacketLineProps[] = useMemo(
        () =>
            Array.from(packets.values()).reduce((data, packet) => {
                const fromPos = [...packet.position];
                const parentPos =
                    packet.parent && packets.has(packet.parent)
                        ? [...packets.get(packet.parent).position]
                        : null;
                if (parentPos) {
                    // console.log('line', fromPos, parentPos);
                    data.push({
                        key: `${packet.key}-${packet.parent}`,
                        points: [fromPos, parentPos],
                    });
                }
                packet.acks.forEach((ack) => {
                    const toAckPos =
                        ack && packets.has(ack)
                            ? [...packets.get(ack).position]
                            : null;
                    if (toAckPos) {
                        data.push({
                            key: `${packet.key}-${ack}`,
                            points: [fromPos, toAckPos],
                            color: 0xefefef,
                        });
                    }
                });
                return data;
            }, [] as PacketLineProps[]),
        [packets],
    );

    const packetBoxes = useMemo(
        () =>
            Array.from(packets.values()).map(({ key, ...props }: any) => {
                return <Packet key={key} {...props} />;
            }),
        [packets],
    );

    const packetLines = useMemo(
        () =>
            lines.map(({ key, ...props }: any) => {
                return <PacketLine key={key} {...props} />;
            }),
        [lines],
    );

    return (
        <>
            {packetBoxes}
            {packetLines}
        </>
    );
}

function PacketsCamera({
    camTargetY,
    camTargetX,
}: {
    camTargetY: number;
    camTargetX: number;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cameraRef = useRef<any>(null);

    useFrame((_state) => {
        if (cameraRef.current) {
            // Smoothly interpolate the camera's Y position towards the camTargetY
            // cameraRef.current.position.y +=
            //     (camTargetY - cameraRef.current.position.y) * CAM_LERP_SPEED;
            cameraRef.current.position.y = camTargetY;

            cameraRef.current.position.x = camTargetX;
            // console.log('camposition', cameraRef.current.position.y);
        }
    });
    // console.log('render');

    return (
        <OrthographicCamera
            ref={cameraRef}
            makeDefault
            position={[0, 0, 5]}
            zoom={100}
        />
    );
}

export const PacketLace = memo(function PacketLace({
    channelId,
    peers,
}: {
    channelId: string;
    peers: string[];
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hasRef = !!canvasRef.current;
    const [data, setData] = useState<any>(null);
    const packetLace = usePacketLace();

    const db = useDatabase();

    useEffect(() => {
        if (!packetLace) {
            return;
        }

        if (!hasRef) {
            return;
        }

        const canvas = canvasRef.current;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        console.log(
            'main: setting offscreen canvas: ',
            canvas.width,
            canvas.height,
            canvas.clientWidth,
            canvas.clientHeight,
        );
        const offscreen = canvasRef.current.transferControlToOffscreen();
        packetLace
            .setCanvas(Comlink.transfer(offscreen, [offscreen]))
            .catch(console.error);
        // Comlink.transfer(data, [data.buffer])
        // console.log('offscreen:', offscreen.width, offscreen.height);
    }, [packetLace, hasRef]);

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
                .then(setData)
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

    if (!data) {
        return;
    }
    const { minRound, maxRound, messagesWithOffsetRound } = data;
    const camYBase =
        maxRound && minRound
            ? (maxRound - minRound - 15) * SPREAD_Y * PACKET_SCALE
            : 0;
    const camY = 0.5 + camYBase + 0 * SPREAD_Y * PACKET_SCALE;
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* <Canvas>
                <ambientLight intensity={2} />
                <PacketsCamera camTargetY={camY} camTargetX={1} />
                <PacketVisualization
                    peers={peers || []} // `fakePeers`, `peers`
                    messages={messagesWithOffsetRound || []} // `fakeMessageData2`, `dataSet`
                    // setHoveredMessage={setHoveredMessage}
                />
            </Canvas> */}
            <canvas
                ref={canvasRef}
                style={{ position: 'relative', width: '100%', height: '100%' }}
            />
        </div>
    );
});
