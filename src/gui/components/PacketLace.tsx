import { Line, OrthographicCamera } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Vector3 } from 'three';
import {
    ChainMessageProps,
    InputMessage,
    PostSignMessageProps,
} from '../../runtime/messages';
import { useDatabase } from '../hooks/use-database';

const PACKET_SCALE = 0.1;
const SPREAD_X = 6;
const SPREAD_Y = 0.5;
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
    const [tick, setTick] = useState(0);
    const db = useDatabase();
    const messages = useLiveQuery(
        async () =>
            db.messages
                .where(['channel', 'round'])
                .between([channelId, Dexie.minKey], [channelId, Dexie.maxKey])
                .reverse()
                .limit(100)
                .toArray(),
        [db, channelId],
    );

    const { minRound, maxRound, messagesWithOffsetRound } = useMemo(() => {
        if (!messages) {
            return {};
        }
        const minRound = Math.min(...messages.map((msg: any) => msg.round));
        const maxRound = Math.max(...messages.map((msg: any) => msg.round));
        const messagesWithOffsetRound = messages.map((msg: any) => ({
            ...msg,
            round: msg.round - minRound,
        }));
        setTick(0);
        return { minRound, maxRound, messagesWithOffsetRound };
    }, [messages]);

    // tick each second
    useEffect(() => {
        const interval = globalThis.setInterval(() => {
            setTick((t) => t + 1);
        }, 1000);
        return () => globalThis.clearInterval(interval);
    });

    const camYBase =
        maxRound && minRound
            ? (maxRound - minRound - 50) * SPREAD_Y * PACKET_SCALE
            : 0;
    const camY = camYBase + tick * SPREAD_Y * PACKET_SCALE;
    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <Canvas>
                <ambientLight intensity={2} />
                <PacketsCamera camTargetY={camY} camTargetX={1} />
                <PacketVisualization
                    peers={peers || []} // `fakePeers`, `peers`
                    messages={messagesWithOffsetRound || []} // `fakeMessageData2`, `dataSet`
                    // setHoveredMessage={setHoveredMessage}
                />
            </Canvas>
        </div>
    );
});
