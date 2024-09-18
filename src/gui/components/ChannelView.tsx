import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChannelInfo } from '../../runtime/channels';
import { PeerInfo } from '../../runtime/db';
import { getPlayerColorCSS } from '../fixtures/player-colors';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSettings } from '../hooks/use-settings';
import SimulationProvider from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import PacketLace from './PacketLace';
import Renderer from './Renderer';
import { Operation, Spinner, TerminalStyle, TerminalView } from './Terminal';

const FIXED_UPDATE_RATE = 60;
const INTERLACE = 2;
const SIM_INPUT_DELAY = 1; // number of ticks to avoid
const src = '/examples/spaceshooter.js'; // not a real src yet see runtime/game.ts

export function ChannelView({
    channelId,
    details,
}: {
    channelId: string;
    details: boolean;
}) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const { peerId } = useCredentials();
    const db = useDatabase();
    const client = useClient();
    const [showConnectedPeers, setShowConnectedPeers] = useState(false);

    const copyKeyToClipboard = () => {
        console.log('copying key to clipboard: ', channelId);
        navigator.clipboard.writeText(channelId).catch((err) => {
            console.error('clipboard write failed:', err);
        });
    };

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch((err) => {
                console.error('exit-fullscreen-err:', err);
            });
            return;
        }
        if (!canvasRef.current) {
            return;
        }
        canvasRef.current.requestFullscreen().catch((err) => {
            console.error('request-fullscreen-err:', err);
        });
    }, []);

    const { muted } = useSettings();
    const toggleMuted = useCallback(() => {
        db.settings
            .update(1, { muted: !muted })
            .catch((err) => console.error('togglemutederr', err));
    }, [db, muted]);

    // get channel data

    const channel = useLiveQuery(
        async (): Promise<ChannelInfo | null | undefined> =>
            db.channels.get(channelId),
        [channelId],
    );
    const channelPeers = useMemo(
        () => channel?.peers || [],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [(channel?.peers || []).join('|')],
    );

    // peer info

    const allPeers = useLiveQuery(() => db.peers.toArray(), [], []);
    const peers = useMemo(
        () =>
            allPeers.filter(
                (p) =>
                    p.channels.includes(channelId) &&
                    p.sees.includes(peerId.slice(0, 8)),
            ),
        [allPeers, channelId, peerId],
    );

    const potentialPeers = useMemo(
        () => [...peers.map((p) => p.peerId), peerId].sort(),
        [peerId, peers],
    );

    const acceptPeers = useCallback(() => {
        if (!client.setPeers) {
            return;
        }
        console.log('acceptPeers', channelId, potentialPeers);
        client.setPeers(channelId, potentialPeers).catch((err) => {
            console.error('acceptPeers', err);
        });
    }, [client, channelId, potentialPeers]);

    const peerNames = useLiveQuery(() => db.peerNames.toArray(), [], []);

    // const largestDiff = peers.reduce(
    //     (acc, peer) => Math.max(acc, peer.knownHeight - peer.validHeight),
    //     0,
    // );

    // a peer is "ready" if it can see all other peers
    // eslint-disable-next-line react-hooks/rules-of-hooks
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
            const seesChannelPeers = channel.peers.every(
                (channelPeerId) =>
                    channelPeerId === pid ||
                    info.sees.includes(channelPeerId.slice(0, 8)),
            );
            return seesChannelPeers ? acc + 1 : acc;
        }, 0);
    }, [channel, peerId, peers]);

    if (!channel) {
        return <div>failed to load channel data</div>;
    }

    const required = channel.peers.length; //channel.peers.length == 2 ? 2 : channel.peers.length / 2;
    const majorityReady = readyPeers >= required;
    const selfIsInTheClub = channel.peers.includes(peerId);

    const terminalFlow: Operation[] = [
        {
            text: 'playerchain initialized.',
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                }),
        },
        {
            text: (
                <span>
                    share this key (click to copy):
                    <span
                        className={theme.materialSymbolsOutlined}
                        style={{ padding: '0 4px', cursor: 'pointer' }}
                        onClick={copyKeyToClipboard}
                    >
                        content_copy
                    </span>
                    <div
                        onClick={copyKeyToClipboard}
                        style={{
                            color: 'rgb(140, 255, 140)',
                            cursor: 'pointer',
                        }}
                    >
                        {channelId}
                    </div>
                </span>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        setShowConnectedPeers(true);
                        resolve('');
                    }, 1000);
                }),
        },
    ];

    if (channel.creator === peerId) {
        terminalFlow.push({
            text: `Type 'go' to start the game`,
            userInput: true,
            promise: (input?: string) =>
                new Promise((resolve, reject) => {
                    if (!input || input.toLocaleLowerCase().trim() !== 'go') {
                        reject(
                            <span className={'errorText'}>
                                invalid command
                            </span>,
                        );
                        return;
                    }
                    if (potentialPeers.length < 2) {
                        reject(
                            <span className={'errorText'}>
                                need at least 2 peers
                            </span>,
                        );
                        return;
                    }

                    acceptPeers();
                    resolve('');
                }),
        });
    } else {
        terminalFlow.push({
            text: (
                <span>
                    waiting for{' '}
                    <span style={{ color: 'white' }}>
                        {channel.creator.slice(0, 8)}
                    </span>{' '}
                    to accept peers
                </span>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                }),
        });
    }

    return (
        <div style={{ display: 'flex', flexGrow: 1 }}>
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
                    <>
                        <TerminalView
                            flow={terminalFlow}
                            minWait={1000}
                            nextOpWait={500}
                            startIndex={0}
                            style={{ height: '50vh' }}
                        />
                        {showConnectedPeers && (
                            <div style={TerminalStyle}>
                                <p>connected peers:</p>
                                <ul>
                                    {potentialPeers.map((pid, playerIdx) => (
                                        <li
                                            key={pid}
                                            style={{
                                                color: getPlayerColorCSS(
                                                    playerIdx,
                                                ),
                                            }}
                                        >
                                            {peerNames.find(
                                                (p) => p.peerId === pid,
                                            )?.name || pid.slice(0, 8)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                ) : !majorityReady || !selfIsInTheClub ? (
                    <TerminalView
                        flow={[
                            {
                                text: !selfIsInTheClub ? (
                                    'session was started without you, sorry!'
                                ) : (
                                    <span>
                                        <Spinner /> waiting for majority peers
                                        online...
                                    </span>
                                ),
                                promise: () =>
                                    new Promise((resolve) =>
                                        setTimeout(resolve, 1000),
                                    ),
                            },
                        ]}
                        minWait={1000}
                        nextOpWait={500}
                        startIndex={0}
                        style={{ height: '50vh' }}
                    />
                ) : (
                    <SimulationProvider
                        src={src}
                        rate={FIXED_UPDATE_RATE}
                        channelId={channel.id}
                        peerId={peerId}
                        channelPeerIds={channelPeers}
                        inputDelay={SIM_INPUT_DELAY}
                    >
                        <Renderer
                            key={channel.id}
                            channelId={channel.id}
                            channelPeerIds={channelPeers}
                            interlace={INTERLACE}
                        />
                    </SimulationProvider>
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
                            bottom: '1rem',
                            left: '1rem',
                            color: '#555',
                        }}
                        onClick={toggleFullscreen}
                        className={theme.materialSymbolsOutlined}
                    >
                        fullscreen
                    </span>
                    <span
                        style={{
                            pointerEvents: 'auto',
                            position: 'absolute',
                            top: '1rem',
                            right: '1rem',
                            color: '#555',
                        }}
                        onClick={toggleMuted}
                        className={theme.materialSymbolsOutlined}
                    >
                        {muted ? 'volume_off' : 'volume_up'}
                    </span>
                </div>
            </div>
            {details && (
                <div
                    style={{
                        background: '#333',
                        width: '15rem',
                        fontSize: '0.8rem',
                        padding: '1rem',
                        color: '#aaa',
                        flexShrink: 0,
                        flexGrow: 0,
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {(channel.peers.length === 0
                        ? potentialPeers
                        : channel.peers
                    ).map((otherPeerId) => (
                        <PeerStatus
                            key={otherPeerId}
                            peerId={otherPeerId}
                            peerName={
                                peerNames.find((p) => p.peerId === otherPeerId)
                                    ?.name
                            }
                            selfId={peerId}
                            info={peers.find((p) => p.peerId === otherPeerId)}
                            peerCount={channel.peers.length}
                        />
                    ))}

                    {channelId && (
                        <PacketLace
                            channelId={channelId}
                            peers={channel.peers}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function PeerStatus({
    peerId,
    peerName,
    info,
    selfId,
    peerCount,
}: {
    peerId: string;
    peerName?: string;
    info?: PeerInfo;
    selfId: string;
    peerCount: number;
}) {
    const [_tick, setTick] = useState(0);
    const isSelf = peerId === selfId;
    const outbound = (info?.lastSeen || 0) > Date.now() - 7000 || isSelf;
    const isWellConnected = info?.sees.length === peerCount - 1 || isSelf;
    const lastSeen = isSelf
        ? 1
        : Math.max(Date.now() - (info?.lastSeen || 0), 1);
    const inbound = lastSeen < 10000 || isSelf;
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '0.5rem',
                borderBottom: '1px solid #444',
                padding: '0.1rem',
                color: '#888',
                fontSize: '11px',
            }}
        >
            <span
                style={{
                    // backgroundColor: outbound ? 'green' : 'red',
                    width: '30%',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                }}
            >
                {peerName || peerId.slice(0, 8)}
            </span>
            <span>
                {inbound
                    ? info?.sees.includes(selfId.slice(0, 8)) || isSelf
                        ? '<<' // fully connected inbound
                        : '<-' // partially connected
                    : '--'}
                {outbound && info?.proxy
                    ? 'P' // proxing
                    : info?.connected
                      ? 'C'
                      : '-'}
                {outbound ? (isWellConnected ? '>>' : '->') : '--'}
            </span>
            <span>{info?.validHeight}</span>
            <span>{Math.floor(lastSeen / 1000)}s</span>
        </div>
    );
}
