import { useEffect, useState } from 'react';
import { useATProto } from '../hooks/use-atproto';
import { useClient } from '../hooks/use-client';
import { LobbyScreen } from './UIScreens/LobbyScreen';
import { LoginScreen } from './UIScreens/LoginScreen';
import { MenuScreen } from './UIScreens/MenuScreen';

export const IntroUI = () => {
    const { isLoggedIn } = useATProto();
    const { getHasJoinedLobby } = useClient();
    const [hasJoinedLobby, setHasJoinedLobby] = useState(false);

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

    if (hasJoinedLobby) {
        return <LobbyScreen />;
    }

    return <MenuScreen />;
};
