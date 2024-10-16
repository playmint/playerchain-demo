import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SESSION_TIME_SECONDS } from '../../examples/spaceshooter';
import { ChannelInfo } from '../../runtime/channels';
import { PeerInfo } from '../../runtime/db';
import { DefaultMetrics } from '../../runtime/metrics';
import { getPlayerColorCSS } from '../fixtures/player-colors';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSettings } from '../hooks/use-settings';
import SimulationProvider from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import PacketLace from './PacketLace';
import Renderer from './Renderer';
import { Spinner } from './Spinner';
import Stat from './Stat';
import { Operation, TerminalView } from './Terminal';
import termstyles from './Terminal.module.css';

export const FIXED_UPDATE_RATE = 66;
export const INTERLACE = 5;
export const SIM_INPUT_DELAY = 0; // number of ticks to avoid
export const SIM_END = SESSION_TIME_SECONDS / (FIXED_UPDATE_RATE / 1000);
const src = '/examples/spaceshooter.js'; // not a real src yet see runtime/game.ts

export default memo(function ChannelView({
    channel,
    details,
    metrics,
}: {
    channel: ChannelInfo;
    details: boolean;
    metrics: DefaultMetrics;
}) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const { peerId } = useCredentials();
    const db = useDatabase();
    const client = useClient();
    const [showConnectedPeers, setShowConnectedPeers] = useState(false);

    const copyKeyToClipboard = () => {
        navigator.clipboard.writeText(channel.id).catch((err) => {
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

    const potentialPeers = useMemo(
        () => [...peers.map((p) => p.peerId), peerId].sort(),
        [peerId, peers],
    );

    const acceptPeers = useCallback(() => {
        if (!client.setPeers) {
            return;
        }
        client.setPeers(channel.id, potentialPeers).catch((err) => {
            console.error('acceptPeers', err);
        });
    }, [client, channel.id, potentialPeers]);

    const peerNames = useLiveQuery(
        () => {
            return db.peerNames.toArray();
        },
        [],
        [],
    );

    // const largestDiff = peers.reduce(
    //     (acc, peer) => Math.max(acc, peer.knownHeight - peer.validHeight),
    //     0,
    // );

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

    const terminalFlow: Operation[] = [
        {
            text: (
                <span className={termstyles.boldTextColor}>
                    Playerchain initializing...
                </span>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(() => resolve('OK'), 500);
                }),
        },
        {
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Share this key with others to connect (click to copy):
                    <div
                        className={termstyles.boldTextColor}
                        onClick={copyKeyToClipboard}
                        style={{
                            cursor: 'pointer',
                        }}
                    >
                        {channel.id}{' '}
                        <span
                            className={`${theme.materialSymbolsOutlined} ${termstyles.promptTextColor}`}
                            style={{ padding: '0 4px', cursor: 'pointer' }}
                            onClick={copyKeyToClipboard}
                        >
                            content_copy
                        </span>
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
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Wait for peers to connect then type &quot;go&quot; to start:
                </span>
            ),
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
                    <br />
                    Waiting for{' '}
                    <span style={{ color: 'white' }}>
                        {peerNames.find((p) => p.peerId === channel.creator)
                            ?.name || channel.creator.slice(0, 8)}
                    </span>{' '}
                    to confirm peers
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
                            <div className={termstyles.terminal}>
                                <p>Connected peers:</p>
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
                                        <Spinner /> Waiting for Playerchain
                                        peers
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
                        style={{
                            height: '50vh',
                        }}
                    />
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
                        justifyContent: 'space-between',
                    }}
                >
                    <div>
                        {(channel.peers.length === 0
                            ? potentialPeers
                            : channel.peers
                        ).map((otherPeerId) => (
                            <PeerStatus
                                key={otherPeerId}
                                peerId={otherPeerId}
                                peerName={
                                    peerNames.find(
                                        (p) => p.peerId === otherPeerId,
                                    )?.name
                                }
                                selfId={peerId}
                                info={peers.find(
                                    (p) => p.peerId === otherPeerId,
                                )}
                                peerCount={channel.peers.length}
                            />
                        ))}
                    </div>

                    <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                        <PacketLace
                            channelId={channel.id}
                            peers={channel.peers}
                        />
                    </div>

                    <div style={{ height: '20rem' }}>
                        <Stat metric={metrics.fps} />
                        <Stat metric={metrics.sps} />
                        <Stat metric={metrics.cps} />
                    </div>
                </div>
            )}
        </div>
    );
});

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
    const isWellConnected = info?.sees.length === peerCount - 1 || isSelf;
    const lastSeen = isSelf
        ? 1
        : Math.max(Date.now() - (info?.lastSeen || 0), 1);
    const online = lastSeen < 10000 || isSelf;
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);
    let signalStrength = 0;
    if (online) {
        signalStrength++;
        if (info?.sees.includes(selfId.slice(0, 8)) || isSelf) {
            signalStrength++;
        }
        if (isWellConnected) {
            signalStrength++;
        }
        if (isWellConnected && !info?.proxy) {
            signalStrength++;
        }
    }
    const green = '#339129';

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '0.5rem',
                borderBottom: '1px solid #444',
                padding: '0.1rem 0.5rem',
                color: '#888',
                fontSize: '11px',
                justifyContent: 'space-between',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '2px',
                }}
            >
                <div
                    style={{
                        backgroundColor: signalStrength > 0 ? green : '#333',
                        border: `1px solid ${signalStrength > 0 ? green : '#555'}`,
                        width: '5px',
                        height: '11px',
                    }}
                ></div>
                <div
                    style={{
                        backgroundColor: signalStrength > 1 ? green : '#333',
                        border: `1px solid ${signalStrength > 1 ? green : '#555'}`,
                        width: '5px',
                        height: '11px',
                    }}
                ></div>
                <div
                    style={{
                        backgroundColor: signalStrength > 2 ? green : '#333',
                        border: `1px solid ${signalStrength > 2 ? green : '#555'}`,
                        width: '5px',
                        height: '11px',
                    }}
                ></div>
                <div
                    style={{
                        backgroundColor: signalStrength > 3 ? green : '#333',
                        border: `1px solid ${signalStrength > 3 ? green : '#555'}`,
                        width: '5px',
                        height: '11px',
                    }}
                ></div>
            </div>
            <div
                style={{
                    // backgroundColor: outbound ? 'green' : 'red',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                }}
            >
                {peerName}
            </div>
            <div
                style={{
                    // backgroundColor: outbound ? 'green' : 'red',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                }}
            >
                {peerId.slice(0, 8)}{' '}
            </div>
        </div>
    );
}
