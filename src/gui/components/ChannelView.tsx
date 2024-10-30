import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config as socketConfig } from 'socket:application';
import { SESSION_TIME_SECONDS } from '../../examples/spaceshooter';
import { getProxyName } from '../../runtime/bootstrap';
import { ChannelInfo } from '../../runtime/channels';
import { PeerInfo } from '../../runtime/db';
import { DefaultMetrics } from '../../runtime/metrics';
import { sleep } from '../../runtime/timers';
import { getChannelCode, hardReset } from '../../runtime/utils';
import { getPlayerColorUi } from '../fixtures/player-colors';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
import SimulationProvider from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import { isProduction } from '../system/menu';
import { TERM_DELAY } from './ChannelBoot';
import Connectivity from './Connectivity';
import PacketLace from './PacketLace';
import Renderer from './Renderer';
import Settings from './Settings';
import { Spinner } from './Spinner';
import Stat from './Stat';
import { Operation, TerminalView } from './Terminal';
import termstyles from './Terminal.module.css';

const MAX_PLAYERS = 4;
export const FIXED_UPDATE_RATE = 30;
export const INTERLACE = 4;
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
    const [showSettings, setShowSettings] = useState(false);
    const [showConnectedPeers, setShowConnectedPeers] = useState(false);

    const copyKeyToClipboard = () => {
        navigator.clipboard
            .writeText(getChannelCode(channel.id, socketConfig))
            .catch((err) => {
                console.error('clipboard write failed:', err);
            });
    };

    const socket = useSocket();
    const openDiscord = async (socket: any) => {
        try {
            await socket.window.openExternal('https://discord.gg/xKFyu8JF2g');
        } catch (error) {
            console.error('Failed to open Discord link:', error);
        }
    };

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

    const peerNames = useLiveQuery(
        () => {
            return db.peerNames.toArray();
        },
        [],
        [],
    );

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
                <span>
                    <br />
                    <span>This game works best with 4 players.</span>
                    <br />
                    <br />
                    <span className={termstyles.promptTextColor}>
                        Share this key with others to connect (click to copy):
                    </span>
                    <div
                        className={termstyles.boldTextColor}
                        onClick={copyKeyToClipboard}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {getChannelCode(channel.id, socketConfig)}{' '}
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
                <span>
                    <br />
                    Looking for a group? Join our Discord and paste your key in
                    the #lfg channel:
                    <br />
                    <div
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        onClick={() => openDiscord(socket)}
                    >
                        https://discord.gg/xKFyu8JF2g{' '}
                        <span
                            className={`${theme.materialSymbolsOutlined} ${termstyles.promptTextColor}`}
                            style={{ padding: '0 4px', cursor: 'pointer' }}
                            onClick={() => openDiscord(socket)}
                        >
                            output
                        </span>
                    </div>
                    <br />
                </span>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, TERM_DELAY);
                }),
        });

        terminalFlow.push({
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Wait for peers to connect then type &quot;go&quot; to start,
                    or{' '}
                    <span
                        className={termstyles.link}
                        onClick={async () => {
                            try {
                                await hardReset();
                                window.location.reload();
                            } catch (err) {
                                console.error('hardReset failed:', err);
                            }
                        }}
                    >
                        go back
                    </span>
                    :
                </span>
            ),
            userInput: true,
            promise: (input?: string) =>
                new Promise((resolve, reject) => {
                    if (input === '') {
                        input = 'go';
                    }
                    if (!input || input.toLocaleLowerCase().trim() !== 'go') {
                        reject(
                            <span className={'errorText'}>
                                invalid command
                            </span>,
                        );
                        return;
                    }
                    if (potentialPeers.length < 2 && isProduction) {
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
                    <br />
                    <br />
                    If you would like to start you own game,{' '}
                    <span
                        className={termstyles.link}
                        onClick={async () => {
                            try {
                                await hardReset();
                                window.location.reload();
                            } catch (err) {
                                console.error('hardReset failed:', err);
                            }
                        }}
                    >
                        click here to go back
                    </span>
                </span>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                }),
        });
    }

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
                                                color:
                                                    playerIdx < MAX_PLAYERS
                                                        ? getPlayerColorUi(
                                                              playerIdx,
                                                          )
                                                        : 'grey',
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
                                    channel.peers.length >= MAX_PLAYERS ? (
                                        '⛔ This session is currently full.'
                                    ) : (
                                        '⛔ This session is already in progress.'
                                    )
                                ) : (
                                    <span>
                                        <br />
                                        <br />
                                        <br />
                                        <Spinner /> Waiting for Playerchain
                                        peers
                                        <br />
                                        <br />
                                        <br />
                                    </span>
                                ),
                                promise: () =>
                                    new Promise((resolve) =>
                                        setTimeout(resolve, 1000),
                                    ),
                            },
                            {
                                text: (
                                    <span
                                        className={termstyles.promptTextColor}
                                    >
                                        Keep waiting for peers to connect or
                                        abort:
                                        <br />
                                        <br />
                                    </span>
                                ),
                                choices: [
                                    {
                                        text: 'Keep waiting',
                                        noop: true,
                                        next: 0,
                                    },
                                    {
                                        text: 'Abort session and start again',
                                        next: 1,
                                    },
                                ],
                                promise: () =>
                                    new Promise((resolve) => {
                                        setTimeout(resolve, TERM_DELAY);
                                    }),
                            },
                            {
                                text: 'Returning to start...',
                                next: 9999,
                                promise: () =>
                                    new Promise(() => {
                                        hardReset()
                                            .then(() => sleep(1000))
                                            .then(() =>
                                                window.location.reload(),
                                            )
                                            .catch((err) =>
                                                alert(
                                                    `hard-reset-fail: ${err}`,
                                                ),
                                            );
                                    }),
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
    const tooltip = `last seen: ${lastSeen}ms ago\nconnected: ${info?.connected ? 'yes' : 'no'}\nproxy: ${info?.proxy ? getProxyName(info.proxy) : 'none'}`;

    return (
        <div
            title={tooltip}
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
