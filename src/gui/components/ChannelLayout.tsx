import { memo, useEffect } from 'react';
import { ChannelInfo } from '../../runtime/channels';
import { DefaultMetrics } from '../../runtime/metrics';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import ChannelView from './ChannelView';

export default memo(function ChannelLayout({
    channelPanelOpen,
    metrics,
    matchPeers,
    channel,
}: {
    channelPanelOpen: boolean;
    metrics: DefaultMetrics;
    matchPeers: string[];
    channel: ChannelInfo;
}) {
    const { peerId } = useCredentials();
    const client = useClient();

    // Broadcast channel id into lobby until we have accepted peers
    useEffect(() => {
        if (!client) {
            return;
        }

        if (channel.creator != peerId) {
            return;
        }

        if (channel.peers.length > 0) {
            return;
        }

        const interval = setInterval(() => {
            console.log('broadcastPublicChannel:', channel.id);
            client.requestSetPublicChannel(channel.id).catch((err) => {
                console.error('broadcastPublicChannel failed:', err);
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [channel, client, peerId]);

    return (
        <ChannelView
            details={channelPanelOpen}
            channel={channel}
            metrics={metrics}
            matchPeers={matchPeers}
        />
    );
});
