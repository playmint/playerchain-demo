import { useLiveQuery } from 'dexie-react-hooks';
import { memo } from 'react';
import { useDatabase } from '../hooks/use-database';
import ChannelBoot from './ChannelBoot';
import ChannelView from './ChannelView';

export default memo(function ChannelLayout({
    channelPanelOpen,
}: {
    channelPanelOpen: boolean;
}) {
    const db = useDatabase();
    const channels = useLiveQuery(async () => db.channels.toArray(), [], []);
    const channel = channels[0];

    return channel ? (
        <ChannelView details={channelPanelOpen} channelId={channel.id} />
    ) : (
        <ChannelBoot />
    );
});
