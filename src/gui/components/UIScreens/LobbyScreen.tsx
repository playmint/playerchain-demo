import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { FunctionComponent, useEffect, useState } from 'react';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useCredentials } from '../../hooks/use-credentials';
import { useProfile } from '../../providers/ProfileProvider';

export const LobbyScreen: FunctionComponent = () => {
    const { peerId } = useCredentials();
    const { emitLookingForMatch, getMatchSeekingPeers } = useClient();
    const { agent } = useATProto();
    const did = agent?.did;
    const [matchSeekingPeers, setMatchSeekingPeers] = useState<
        { peerId: string; did: string }[]
    >([]);
    const [peerProfiles, setPeerProfiles] = useState<ProfileViewDetailed[]>([]);
    const { getProfile } = useProfile();
    // const [matchPeers, setMatchPeers] = useState<string[]>([]);

    // Announce looking for match
    useEffect(() => {
        if (!did) {
            return;
        }

        if (!emitLookingForMatch) {
            return;
        }

        // call emitLookingForMatch every second
        const interval = setInterval(() => {
            emitLookingForMatch(true, did).catch((err) => {
                console.error('emitLookingForMatch failed:', err);
            });
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [emitLookingForMatch, did]);

    useEffect(() => {
        if (!did) {
            return;
        }

        if (!getMatchSeekingPeers) {
            return;
        }

        // call emitLookingForMatch every second
        const interval = setInterval(() => {
            getMatchSeekingPeers()
                .then((matchSeekingPeers) => {
                    const selfPeer = { peerId, did };
                    setMatchSeekingPeers([selfPeer, ...matchSeekingPeers]);
                })
                .catch((err) => {
                    console.error('getMatchSeekingPeers failed:', err);
                });
        }, 1000);

        return () => clearInterval(interval);
    }, [did, getMatchSeekingPeers, peerId]);

    useEffect(() => {
        const getProfiles = async () => {
            const profiles = await Promise.all(
                matchSeekingPeers.map(({ did }) => {
                    return getProfile(did);
                }),
            );

            setPeerProfiles(
                profiles
                    .filter(
                        (profile): profile is ProfileViewDetailed => !!profile,
                    )
                    .sort((a, b) => (a.did > b.did ? 1 : -1)),
            );
        };

        getProfiles().catch((err) => {
            console.error('getProfiles failed:', err);
        });
    }, [getProfile, matchSeekingPeers]);

    return (
        <div>
            <h1>Lobby</h1>
            <div>
                {peerProfiles.map((profile) => (
                    <UserProfileFlare
                        key={did}
                        did={profile.did}
                        profile={profile}
                    />
                ))}
            </div>
        </div>
    );
};

export interface UserProfileFlareProps {
    did: string;
    profile?: ProfileViewDetailed;
    style?: React.CSSProperties;
}

export const UserProfileFlare: FunctionComponent<UserProfileFlareProps> = ({
    did,
    profile,
    style,
}) => {
    return (
        <div
            style={{
                ...style,
                background: '#111111d7',
                display: 'flex',
            }}
        >
            {profile?.avatar ? (
                <img src={profile.avatar} style={{ width: '50px' }} />
            ) : (
                <div style={{ width: '50px', backgroundColor: 'red' }} />
            )}
            <div
                style={{
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignContent: 'center',
                    justifyContent: 'center',
                }}
            >
                {profile?.displayName || profile?.handle || did}
            </div>
        </div>
    );
};
