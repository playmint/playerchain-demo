import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useCredentials } from '../../hooks/use-credentials';
import { useProfile } from '../../providers/ProfileProvider';

export interface LobbyScreenProps {
    setMatchPeers: (peers: string[]) => void;
}

export const LobbyScreen: FunctionComponent<LobbyScreenProps> = ({
    setMatchPeers,
}) => {
    const { peerId } = useCredentials();
    const {
        emitLookingForMatch,
        getMatchSeekingPeers,
        exitLobby: clientExitLobby,
    } = useClient();
    const { agent } = useATProto();
    const did = agent?.did;
    const [exitingLobby, setExitingLobby] = useState(false);
    const [matchSeekingPeers, setMatchSeekingPeers] = useState<
        { peerId: string; did: string }[]
    >([]);
    const [peerProfiles, setPeerProfiles] = useState<ProfileViewDetailed[]>([]);
    const { getProfile } = useProfile();

    const exitLobby = useCallback(() => {
        if (!did) {
            return;
        }

        setExitingLobby(true);

        const exitAsync = async () => {
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

            await clientExitLobby();
        };

        exitAsync().catch((err) => {
            console.error('exitLobby failed:', err);
        });
    }, [did, emitLookingForMatch, clientExitLobby]);

    const onStartGameClick = useCallback(async () => {
        if (!did) {
            return;
        }
        // Select up to 4 peers (includong self) to start the game with
        const selfPeer = { peerId, did };
        const selectedPeersIds = [
            selfPeer,
            ...matchSeekingPeers
                .sort(() => 0.5 - Math.random())
                .slice(0, Math.min(3, matchSeekingPeers.length)),
        ].map(({ peerId }) => peerId);

        if (selectedPeersIds.length < 2) {
            console.log('Not enough players to start the game');
            return;
        }

        console.log('Starting game with:', selectedPeersIds);
        setMatchPeers(selectedPeersIds);
    }, [did, matchSeekingPeers, peerId, setMatchPeers]);

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
        if (!getMatchSeekingPeers) {
            return;
        }

        // call emitLookingForMatch every second
        const interval = setInterval(() => {
            getMatchSeekingPeers()
                .then((matchSeekingPeers) => {
                    setMatchSeekingPeers(matchSeekingPeers);
                })
                .catch((err) => {
                    console.error('getMatchSeekingPeers failed:', err);
                });
        }, 1000);

        return () => clearInterval(interval);
    }, [getMatchSeekingPeers, peerId]);

    useEffect(() => {
        if (!did) {
            return;
        }

        const getProfiles = async () => {
            const selfPeer = { peerId, did };
            const profiles = await Promise.all(
                [selfPeer, ...matchSeekingPeers].map(({ did }) => {
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
    }, [did, getProfile, matchSeekingPeers, peerId]);

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
            <button onClick={onStartGameClick}>Start Game</button>
            <button onClick={exitLobby}>Exit Lobby</button>
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
