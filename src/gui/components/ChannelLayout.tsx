import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useEffect, useState } from 'react';
import { DefaultMetrics } from '../../runtime/metrics';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import ChannelView from './ChannelView';

export default memo(function ChannelLayout({
    channelPanelOpen,
    metrics,
    matchPeers,
}: {
    channelPanelOpen: boolean;
    metrics: DefaultMetrics;
    matchPeers: string[];
}) {
    const autoJoin = true; // this could become optional
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();
    const channels = useLiveQuery(
        async () => {
            return db.channels.toArray();
        },
        [],
        [],
    );
    const channel = channels[0];
    const publicChannels = useLiveQuery(
        async () => {
            return db.publicChannels.toArray();
        },
        [],
        [],
    );
    const publicChannelId = publicChannels[0]?.id;

    useEffect(() => {
        if (!autoJoin) {
            return;
        }

        if (!channel) {
            return;
        }

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
    }, [autoJoin, channel, client, peerId]);

    // Auto join channel
    useEffect(() => {
        if (!autoJoin) {
            return;
        }

        if (!client) {
            return;
        }

        // Don't join channel if already in one
        if (channel) {
            return;
        }

        if (!publicChannelId) {
            return;
        }

        console.log('auto joinChannel:', publicChannelId);

        client.joinChannel(publicChannelId).catch((err) => {
            console.error('auto joinChannel failed:', err);
        });
    }, [autoJoin, channel, client, publicChannelId]);

    return channel ? (
        <ChannelView
            details={channelPanelOpen}
            channel={channel}
            metrics={metrics}
            matchPeers={matchPeers}
            autoJoin={autoJoin}
        />
    ) : (
        <div>Joining Channel</div>
    );
});
