import { useLiveQuery } from 'dexie-react-hooks';
import { FunctionComponent, useEffect, useState } from 'react';
import { createDefaultMetrics as _createDefaultMetrics } from '../../runtime/metrics';
import { useATProto } from '../hooks/use-atproto';
import { useClient } from '../hooks/use-client';
import { useDatabase } from '../hooks/use-database';
import ChannelLayout from './ChannelLayout';
import { LobbyScreen } from './UIScreens/LobbyScreen';
import { LoginScreen } from './UIScreens/LoginScreen';
import { MenuScreen } from './UIScreens/MenuScreen';

export interface IntroUIProps {
    channelPanelOpen: boolean;
    metrics: ReturnType<typeof _createDefaultMetrics>;
}

export const IntroUI: FunctionComponent<IntroUIProps> = ({
    channelPanelOpen,
    metrics,
}) => {
    const { isLoggedIn } = useATProto();
    const { getHasJoinedLobby } = useClient();
    const db = useDatabase();
    const channels = useLiveQuery(
        async () => {
            return db.channels.toArray();
        },
        [],
        [],
    );
    const channel = channels[0];

    const [hasJoinedLobby, setHasJoinedLobby] = useState(false);
    const [matchPeers, setMatchPeers] = useState<string[]>([]);

    // TODO: This flag could be set on db so we don't have to poll like this
    useEffect(() => {
        const interval = setInterval(() => {
            getHasJoinedLobby()
                .then(setHasJoinedLobby)
                .catch((err) => {
                    console.error('getHasJoinedLobby failed:', err);
                });
        }, 1000);

        return () => clearInterval(interval);
    }, [getHasJoinedLobby]);

    if (!isLoggedIn) {
        return <LoginScreen />;
    }

    if (channel) {
        return (
            <ChannelLayout
                channelPanelOpen={channelPanelOpen}
                metrics={metrics}
                matchPeers={matchPeers}
                channel={channel}
            />
        );
    }

    if (hasJoinedLobby) {
        return <LobbyScreen setMatchPeers={setMatchPeers} />;
    }

    return <MenuScreen />;
};
