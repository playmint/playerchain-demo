import { useLiveQuery } from 'dexie-react-hooks';
import { memo } from 'react';
import { DefaultMetrics } from '../../runtime/metrics';
import { useDatabase } from '../hooks/use-database';
import ChannelBoot from './ChannelBoot';
import ChannelView from './ChannelView';

export default memo(function ChannelLayout({
    channelPanelOpen,
    metrics,
}: {
    channelPanelOpen: boolean;
    metrics: DefaultMetrics;
}) {
    const db = useDatabase();
    const channels = useLiveQuery(async () => db.channels.toArray(), [], []);
    const channel = channels[0];

    return channel ? (
        <ChannelView
            details={channelPanelOpen}
            channelId={channel.id}
            metrics={metrics}
        />
    ) : (
        <ChannelBoot />
    );
});
