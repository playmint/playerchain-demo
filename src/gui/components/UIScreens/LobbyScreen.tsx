import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useCredentials } from '../../hooks/use-credentials';
import { useProfile } from '../../providers/ProfileProvider';

export const LobbyScreen: FunctionComponent = () => {
    const { peerId } = useCredentials();
    const { emitLookingForMatch, getMatchSeekingPeers, exitLobby } =
        useClient();
    const { agent } = useATProto();
    const did = agent?.did;
    const [exitingLobby, setExitingLobby] = useState(false);
    const [matchSeekingPeers, setMatchSeekingPeers] = useState<
        { peerId: string; did: string }[]
    >([]);
    const [peerProfiles, setPeerProfiles] = useState<ProfileViewDetailed[]>([]);
    const { getProfile } = useProfile();
    // const [matchPeers, setMatchPeers] = useState<string[]>([]);

    const onExitLobbyClick = useCallback(() => {
        if (!exitLobby) {
            return;
        }

        if (!did) {
            return;
        }

        setExitingLobby(true);

        const doExitLobby = async () => {
            // HACK: Not elegant but sending a few packets in the hope that the message that we are no longer
            //       looking for a match is received. If received the other peers will see us leave the lobby.
            //       If it's not received it's not a big deal because peers timeout after a minute.
            try {
                await emitLookingForMatch(false, did);
                await emitLookingForMatch(false, did);
                await emitLookingForMatch(false, did);
            } catch (err) {
                console.error('emitLookingForMatch failed:', err);
            }

            await exitLobby();
        };

        doExitLobby().catch((err) => {
            console.error('exitLobby failed:', err);
        });
    }, [did, emitLookingForMatch, exitLobby]);

    // Announce looking for match
    useEffect(() => {
        if (exitingLobby) {
            return;
        }

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
    }, [emitLookingForMatch, did, exitingLobby]);

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
                        key={profile.did}
                        did={profile.did}
                        profile={profile}
                    />
                ))}
            </div>
            <button>Start Game</button>
            <button onClick={onExitLobbyClick}>Exit Lobby</button>
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
