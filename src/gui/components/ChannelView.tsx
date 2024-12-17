import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SESSION_TIME_SECONDS } from '../../examples/spaceshooter';
import { ChannelInfo } from '../../runtime/channels';
import { DefaultMetrics } from '../../runtime/metrics';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
import SimulationProvider from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import Connectivity from './Connectivity';
import { DetailsPanel } from './DetailsPanel/DetailsPanel';
import Renderer from './Renderer';
import Settings from './Settings';

const MAX_PLAYERS = 4;
export const FIXED_UPDATE_RATE = 100;
export const INTERLACE = 4;
export const SIM_INPUT_DELAY = 0; // number of ticks to avoid
export const SIM_END = SESSION_TIME_SECONDS / (FIXED_UPDATE_RATE / 1000);

const src = '/examples/spaceshooter.js'; // not a real src yet see runtime/game.ts

const AUTO_JOIN_TIMEOUT = 15000;

export default memo(function ChannelView({
    channel,
    details,
    metrics,
    matchPeers,
    autoJoin,
}: {
    channel: ChannelInfo;
    details: boolean;
    metrics: DefaultMetrics;
    matchPeers: string[];
    autoJoin: boolean;
}) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const { peerId } = useCredentials();
    const db = useDatabase();
    const client = useClient();
    const [showSettings, setShowSettings] = useState(false);
    const socket = useSocket();

    const peerNames = useLiveQuery(
        () => {
            return db.peerNames.toArray();
        },
        [],
        [],
    );

    // get channel data
    const channelPeers = useMemo(
        () => channel?.peers || [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [(channel?.peers || []).join('|')],
    );

    // peer info

    const allPeers = useLiveQuery(
        () => {
            return db.peers.toArray();
        },
        [],
        [],
    );
    const peers = useMemo(() => {
        return allPeers.filter(
            (p) =>
                p.channels.includes(channel.id) &&
                p.sees.includes(peerId.slice(0, 8)),
        );
    }, [allPeers, channel.id, peerId]);

    const potentialPeers = useMemo(() => {
        const sortedPeers = [...peers.map((p) => p.peerId), peerId].sort();
        if (channel?.creator) {
            const creatorIndex = sortedPeers.indexOf(channel.creator);
            if (creatorIndex > -1) {
                sortedPeers.splice(creatorIndex, 1);
            }
            sortedPeers.unshift(channel.creator);
        }
        return sortedPeers;
    }, [peerId, peers, channel?.creator]);

    const acceptPeers = useCallback(() => {
        if (!client.setPeers) {
            return;
        }

        const sortedPeers = [...peers.map((p) => p.peerId), peerId].sort();
        if (channel?.creator) {
            const creatorIndex = sortedPeers.indexOf(channel.creator);
            if (creatorIndex > -1) {
                sortedPeers.splice(creatorIndex, 1);
            }
            sortedPeers.unshift(channel.creator);
        }

        const selectedPeers = sortedPeers.slice(0, MAX_PLAYERS);

        client.setPeers(channel.id, selectedPeers, INTERLACE).catch((err) => {
            console.error('acceptPeers:', err);
        });
    }, [client, channel.id, peerId, peers, channel?.creator]);

    // Auto accept peers
    const [hasAcceptedPeers, setHasAcceptedPeers] = useState(false);
    const [autoJoinTimedOut, setAutoJoinTimedOut] = useState(false);
    useEffect(() => {
        if (!autoJoin) {
            return;
        }

        if (channel.creator !== peerId) {
            return;
        }

        if (hasAcceptedPeers) {
            return;
        }

        // Check if all peers have joined
        if (
            !matchPeers.every((p) => potentialPeers.includes(p)) &&
            !autoJoinTimedOut
        ) {
            return;
        }

        setHasAcceptedPeers(true);
        acceptPeers();
    }, [
        acceptPeers,
        autoJoin,
        autoJoinTimedOut,
        channel.creator,
        hasAcceptedPeers,
        matchPeers,
        peerId,
        potentialPeers,
    ]);

    useEffect(() => {
        if (!autoJoin) {
            return;
        }

        const timeout = setTimeout(() => {
            setAutoJoinTimedOut(true);
        }, AUTO_JOIN_TIMEOUT);

        return () => clearTimeout(timeout);
    }, [autoJoin]);

    // a peer is "ready" if it can see all other peers
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const required = channel
        ? channel.peers.length > 2
            ? channel.peers.length - 1
            : channel.peers.length
        : 0;
    const readyPeers = useMemo(() => {
        if (!channel) {
            return 0;
        }
        return channel.peers.reduce((acc, pid) => {
            if (pid === peerId) {
                return acc + 1; // assume self is ready
            }
            const info = peers.find((p) => p.peerId === pid);
            if (!info) {
                return acc;
            }
            const alive = (info?.lastSeen || 0) > Date.now() - 10000;
            if (!alive) {
                return acc;
            }
            const seesChannelPeers = channel.peers.filter(
                (channelPeerId) =>
                    channelPeerId === pid ||
                    info.sees.includes(channelPeerId.slice(0, 8)),
            );
            return seesChannelPeers.length >= required ? acc + 1 : acc;
        }, 0);
    }, [channel, peerId, peers, required]);

    if (!channel) {
        return <div>failed to load channel data</div>;
    }

    const majorityReady = readyPeers >= required;
    const selfIsInTheClub = channel.peers.includes(peerId);

    return (
        <div
            style={{
                display: 'flex',
                flexGrow: 1,
                userSelect: 'none',
                WebkitUserSelect: 'none',
            }}
        >
            <div
                style={{
                    flexGrow: 1,
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                }}
                ref={canvasRef}
            >
                {channel.peers.length === 0 ? (
                    <div>Waiting for peers to connect...</div>
                ) : !majorityReady || !selfIsInTheClub ? (
                    !selfIsInTheClub ? (
                        channel.peers.length >= MAX_PLAYERS ? (
                            '⛔ This session is currently full.'
                        ) : (
                            '⛔ This session is already in progress.'
                        )
                    ) : (
                        'Waiting for Playerchain'
                    )
                ) : (
                    <SimulationProvider
                        src={src}
                        rate={FIXED_UPDATE_RATE}
                        channelId={channel.id}
                        peerId={peerId}
                        channelPeerIds={channelPeers}
                        inputDelay={SIM_INPUT_DELAY}
                        interlace={INTERLACE}
                    >
                        <Renderer
                            key={channel.id}
                            channelId={channel.id}
                            channelPeerIds={channelPeers}
                            interlace={INTERLACE}
                            metrics={metrics}
                        />
                    </SimulationProvider>
                )}
                {showSettings && (
                    <Settings onClose={setShowSettings.bind(null, false)} />
                )}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        boxShadow: 'inset 0px 0px 5px 0px rgba(0,0,0,0.75)',
                        pointerEvents: 'none',
                    }}
                >
                    <span
                        style={{
                            pointerEvents: 'auto',
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            color: '#d9d9d9',
                        }}
                        onClick={setShowSettings.bind(null, !showSettings)}
                        className={theme.materialSymbolsOutlined}
                    >
                        settings
                    </span>
                    {majorityReady && <Connectivity metric={metrics.cps} />}
                </div>
            </div>
            {details && (
                <DetailsPanel
                    channel={channel}
                    peerId={peerId}
                    potentialPeers={potentialPeers}
                    peers={peers}
                    peerNames={peerNames}
                    metrics={metrics}
                />
            )}
        </div>
    );
});
