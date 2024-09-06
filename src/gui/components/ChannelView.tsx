import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo, useRef } from 'react';
import { ChannelInfo } from '../../runtime/channels';
import { PeerInfo } from '../../runtime/db';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSettings } from '../hooks/use-settings';
import { SimulationProvider } from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import { PacketLace } from './PacketLace';
import Renderer from './Renderer';

const FIXED_UPDATE_RATE = 50;
const src = '/examples/spaceshooter.js';

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
        [db, channelId],
    );

    // peer info

    const peers = useLiveQuery(() => db.peers.toArray(), [db]);
    const connectedPeers = peers?.filter((p) => p.online).length || 0;
    const minConnected = connectedPeers > 0 || true;
    const peersToShowInLace = useMemo(() => {
        const ps = peers
            ? peers
                  .filter(
                      (peer) =>
                          peer.knownHeight != -1 &&
                          peer.channels.includes(channelId),
                  )
                  .map((peer) => peer.peerId)
            : [];
        if (peerId) {
            ps.push(peerId);
        }
        return ps.sort();
    }, [peers, peerId, channelId]);

    if (!channel) {
        return <div>failed to load channel data</div>;
    }

    if (!minConnected) {
        return (
            <div>
                min number of online peers not met for this channel, waiting...
            </div>
        );
    }

    return (
        <SimulationProvider
            src={src}
            rate={FIXED_UPDATE_RATE}
            channelId={channelId}
        >
            <div style={{ display: 'flex', flexGrow: 1 }}>
                <div
                    style={{
                        flexGrow: 1,
                        position: 'relative',
                    }}
                    ref={canvasRef}
                >
                    <Renderer key={channel.id} channelId={channel.id} />
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
                        {peers
                            ?.filter((p) => p.knownHeight != -1)
                            .map((peer) => (
                                <PeerStatus key={peer.peerId} peer={peer} />
                            ))}

                        {channelId && connectedPeers > 0 ? (
                            <PacketLace
                                channelId={channelId}
                                peers={peersToShowInLace}
                            />
                        ) : (
                            'NO PEERS ONLINE'
                        )}
                    </div>
                )}
            </div>
        </SimulationProvider>
    );
}

function PeerStatus({ peer }: { peer: PeerInfo }) {
    // const sync =
    //     peer.validHeight > -1 && peer.knownHeight - peer.validHeight < 10;
    const probablyFine = peer.knownHeight - peer.validHeight < 10;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '0.5rem',
                borderBottom: '1px solid #444',
            }}
        >
            <span
                style={{
                    backgroundColor: peer.online ? 'green' : 'red',
                }}
            >
                {peer.peerId.slice(0, 8)}
            </span>
            <span>{peer.validHeight}</span>
            <span>{peer.knownHeight}</span>
            <span>{peer.online && peer.proxy ? 'P' : ''}</span>
            <span>
                {peer.online
                    ? `${probablyFine ? 'SYNC' : 'NOSYNC'}`
                    : 'OFFLINE'}
            </span>
        </div>
    );
}
