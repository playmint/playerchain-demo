import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useProfile } from '../../providers/ProfileProvider';

// export interface MenuScreenProps {
// }

export const MenuScreen: FunctionComponent = () => {
    const { joinLobby } = useClient();
    const { agent, logout } = useATProto();
    const { getProfile } = useProfile();
    const [bskyProfile, setBskyProfile] = useState<
        ProfileViewDetailed | undefined
    >();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const onQuickJoinClick = useCallback(() => {
        joinLobby('spaceShooterAutoLobby').catch((err) => {
            console.error('joinLobby failed:', err);
        });
    }, [joinLobby]);

    useEffect(() => {
        if (!agent) {
            return;
        }

        if (!agent.did) {
            return;
        }

        getProfile(agent.did)
            .then(setBskyProfile)
            .catch((err) => {
                console.error('getProfile failed:', err);
            });
    }, [agent, getProfile]);

    return (
        <>
            <div>
                <h1>Menu</h1>
                <button onClick={onQuickJoinClick}>Quick Join</button>
                <button onClick={logout}>Logout</button>
            </div>
            <PlayerProfile bskyProfile={bskyProfile} />
        </>
    );
};

export interface PlayerProfileProps {
    bskyProfile?: ProfileViewDetailed;
}

export const PlayerProfile: FunctionComponent<PlayerProfileProps> = ({
    bskyProfile,
}) => {
    if (!bskyProfile) {
        return null;
    }

    return (
        <div>
            <h2>Profile</h2>

            <div>
                <h3>Handle</h3>
                <p>{bskyProfile.handle}</p>
            </div>
        </div>
    );
};
