import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useRef } from 'react';
import { ChannelInfo } from '../../runtime/channels';
import { PeerInfo } from '../../runtime/db';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSettings } from '../hooks/use-settings';
import theme from '../styles/default.module.css';
import { PacketLace } from './PacketLace';
import Renderer from './Renderer';

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

    // peer info

    const allPeers = useLiveQuery(() => db.peers.toArray(), [], []);
    const peers = useMemo(
        () =>
            allPeers.filter(
                (p) =>
                    p.channels.includes(channelId) && p.sees.includes(peerId),
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
            const alive = (info?.lastSeen || 0) > Date.now() - 7000;
            if (!alive) {
                return acc;
            }
            return info.sees.length === channel.peers.length - 1
                ? acc + 1
                : acc;
        }, 0);
    }, [channel, peerId, peers]);

    if (!channel) {
        return <div>failed to load channel data</div>;
    }

    const required = channel.peers.length == 2 ? 2 : channel.peers.length / 2;
    const majorityReady = readyPeers >= required;
    const selfIsInTheClub = channel.peers.includes(peerId);

    return (
        <div style={{ display: 'flex', flexGrow: 1 }}>
            <div
                style={{
                    flexGrow: 1,
                    position: 'relative',
                }}
                ref={canvasRef}
            >
                {channel.peers.length === 0 ? (
                    <div>
                        <p>playerchain initialized.</p>
                        <p>
                            share this key:{' '}
                            <input
                                type="text"
                                onChange={() => {}}
                                value={channel.id}
                            />
                        </p>
                        <p>Waiting for peers to be decided...</p>
                        <p>connected peers:</p>
                        <ul>
                            {potentialPeers.map((pid) => (
                                <li key={pid}>
                                    {pid.slice(0, 8)}{' '}
                                    {pid === peerId && '(you)'}
                                </li>
                            ))}
                        </ul>
                        <p>
                            {channel.creator === peerId ? (
                                <button
                                    onClick={acceptPeers}
                                    disabled={potentialPeers.length < 2}
                                >
                                    ACCEPT THESE PEERS
                                </button>
                            ) : (
                                `waiting for ${channel.creator.slice(0, 8)} to accept peers`
                            )}
                        </p>
                    </div>
                ) : !selfIsInTheClub ? (
                    <div>session was started without you, sorry!</div>
                ) : !majorityReady ? (
                    <div>waiting for majority peers online...</div>
                ) : (
                    <Renderer
                        key={channel.id}
                        channelId={channel.id}
                        channelPeerIds={channel.peers}
                    />
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
    info,
    selfId,
    peerCount,
}: {
    peerId: string;
    info?: PeerInfo;
    selfId: string;
    peerCount: number;
}) {
    const isSelf = peerId === selfId;
    const outbound = (info?.lastSeen || 0) > Date.now() - 7000 || isSelf;
    const inbound = (outbound && info?.sees.includes(selfId)) || isSelf;
    const isWellConnected = info?.sees.length === peerCount - 1 || isSelf;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '0.5rem',
                borderBottom: '1px solid #444',
                padding: '0.1rem',
                color: '#888',
            }}
        >
            <span
                style={{
                    // backgroundColor: outbound ? 'green' : 'red',
                    width: '30%',
                    overflow: 'hidden',
                }}
            >
                {peerId.slice(0, 8)}
            </span>
            <span>
                {inbound
                    ? isWellConnected
                        ? '<<' // fully connected inbound
                        : '<-' // partially connected
                    : '--'}
                {outbound && info?.proxy
                    ? 'P' // proxing
                    : '-'}
                {outbound ? (isWellConnected ? '>>' : '->') : '--'}
            </span>
            <span>{info?.validHeight}</span>
            <span>{info?.knownHeight}</span>
        </div>
    );
}
