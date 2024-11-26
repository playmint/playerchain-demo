import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useEffect, useState } from 'react';
import { DefaultMetrics } from '../../runtime/metrics';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import ChannelView from './ChannelView';
import { MobileBoot } from './MobileBoot';

export default memo(function ChannelLayout({
    channelPanelOpen,
    metrics,
}: {
    channelPanelOpen: boolean;
    metrics: DefaultMetrics;
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
    const isLookingForMatch = !channel;
    const [matchSeekingPeers, setMatchSeekingPeers] = useState<string[]>([]);
    const [matchPeers, setMatchPeers] = useState<string[]>([]);

    // Announce looking for match
    useEffect(() => {
        if (!autoJoin) {
            autoJoin;
        }

        if (!client) {
            return;
        }

        // call emitLookingForMatch every second
        const interval = setInterval(() => {
            client.emitLookingForMatch(isLookingForMatch).catch((err) => {
                console.error('emitLookingForMatch failed:', err);
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [autoJoin, client, isLookingForMatch]);

    // TODO: This could be a db live query
    useEffect(() => {
        if (!autoJoin) {
            return;
        }
        if (!client) {
            return;
        }

        // call emitLookingForMatch every second
        const interval = setInterval(() => {
            client
                .getMatchSeekingPeers()
                .then(setMatchSeekingPeers)
                .catch((err) => {
                    console.error('getMatchSeekingPeers failed:', err);
                });
        }, 1000);

        return () => clearInterval(interval);
    }, [autoJoin, client]);

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
        <MobileBoot
            matchSeekingPeers={matchSeekingPeers}
            setMatchPeers={setMatchPeers}
        />
    );
});
