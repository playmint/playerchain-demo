import { FunctionComponent, useEffect, useState } from 'react';
import { getProxyName } from '../../../runtime/bootstrap';
import { ChannelInfo } from '../../../runtime/channels';
import { PeerInfo } from '../../../runtime/db';
import { DefaultMetrics } from '../../../runtime/metrics';
import PacketLace from '../PacketLace';
import Stat from '../Stat';

export interface DetailsPanelProps {
    channel: ChannelInfo;
    peerId: string;
    potentialPeers: string[];
    peers: PeerInfo[];
    peerNames: { peerId: string; name: string }[];
    metrics: DefaultMetrics;
}

export const DetailsPanel: FunctionComponent<DetailsPanelProps> = ({
    channel,
    peerId,
    potentialPeers,
    peers,
    peerNames,
    metrics,
}: DetailsPanelProps) => {
    return (
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
                            peerNames.find((p) => p.peerId === otherPeerId)
                                ?.name
                        }
                        selfId={peerId}
                        info={peers.find((p) => p.peerId === otherPeerId)}
                        peerCount={channel.peers.length}
                    />
                ))}
            </div>

            <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                <PacketLace channelId={channel.id} peers={channel.peers} />
            </div>

            <div style={{ height: '20rem' }}>
                <Stat metric={metrics.fps} />
                <Stat metric={metrics.sps} />
                <Stat metric={metrics.cps} />
            </div>
        </div>
    );
};

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
