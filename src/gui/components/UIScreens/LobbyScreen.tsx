import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { useLiveQuery } from 'dexie-react-hooks';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import styled from 'styled-components';
import { useATProto } from '../../hooks/use-atproto';
import { useClient } from '../../hooks/use-client';
import { useCredentials } from '../../hooks/use-credentials';
import { useDatabase } from '../../hooks/use-database';
import { useProfile } from '../../providers/ProfileProvider';
import { PlayerProfileProps, nullPlayerStats } from './MenuScreen';
import { GameTitle, Panel, PanelButton, Screen, ScreenButton } from './Screen';

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
        createChannel,
        joinChannel,
    } = useClient();
    const { agent } = useATProto();
    const did = agent?.did;
    const [exitingLobby, setExitingLobby] = useState(false);
    const [matchSeekingPeers, setMatchSeekingPeers] = useState<
        { peerId: string; did: string }[]
    >([]);
    const [peerProfiles, setPeerProfiles] = useState<ProfileViewDetailed[]>([]);
    const [startingGame, setStartingGame] = useState(false);
    const { getProfile } = useProfile();

    const db = useDatabase();
    const publicChannels = useLiveQuery(
        async () => {
            return db.publicChannels.toArray();
        },
        [],
        [],
    );
    const publicChannelId = publicChannels[0]?.id;

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

        setMatchPeers(selectedPeersIds);
        setStartingGame(true);

        // Will remove our name from the lobby although we are technically still there so we can broadcast the channel id
        emitLookingForMatch(false, did).catch((err) => {
            console.error('emitLookingForMatch failed:', err);
        });
        emitLookingForMatch(false, did).catch((err) => {
            console.error('emitLookingForMatch failed:', err);
        });

        const rnd = (Math.random() + 1).toString(36).substring(7);
        createChannel(rnd).catch((err) => {
            console.error('newChannel failed:', err);
            setStartingGame(false);
        });
    }, [
        did,
        peerId,
        matchSeekingPeers,
        setMatchPeers,
        emitLookingForMatch,
        createChannel,
    ]);

    // Auto join channel
    useEffect(() => {
        if (!joinChannel) {
            return;
        }

        if (!publicChannelId) {
            return;
        }

        console.log('auto joinChannel:', publicChannelId);

        joinChannel(publicChannelId).catch((err) => {
            console.error('auto joinChannel failed:', err);
        });
    }, [joinChannel, publicChannelId]);

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
            emitLookingForMatch(!startingGame, did).catch((err) => {
                console.error('emitLookingForMatch failed:', err);
            });
        }, 1000);

        return () => {
            clearInterval(interval);
        };
    }, [emitLookingForMatch, did, exitingLobby, startingGame]);

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
                [selfPeer, ...matchSeekingPeers].map(
                    async ({ peerId, did }) => {
                        const profile = await getProfile(did);
                        if (!profile) {
                            return;
                        }

                        // Save the names as we get the profiles. A bit rough but it works.
                        await db.peerNames.put({
                            peerId,
                            name:
                                profile.displayName || profile.handle || peerId,
                        });
                        return profile;
                    },
                ),
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
    }, [db.peerNames, did, getProfile, matchSeekingPeers, peerId]);

    return (
        <Screen style={{ display: 'flex', flexDirection: 'column' }}>
            <GameTitle>QUICK MATCH</GameTitle>
            <div
                style={{ display: 'flex', flexDirection: 'row', flexGrow: '1' }}
            >
                <div
                    style={{
                        width: '50%',
                        marginRight: '40px',
                    }}
                >
                    <Panel
                        style={{
                            overflow: 'hidden',
                            height: '100%',
                        }}
                    >
                        {peerProfiles.map((profile) => (
                            <PlayerProfile
                                key={profile.did}
                                bskyProfile={profile}
                                playerStats={nullPlayerStats}
                            />
                        ))}
                    </Panel>
                </div>

                <Panel
                    style={{
                        width: '50%',
                        background: 'none',
                        border: 'none',
                        justifyContent: 'center',
                    }}
                >
                    <PanelButton onClick={onStartGameClick}>
                        Start Game
                    </PanelButton>
                    <PanelButton onClick={exitLobby}>Exit Lobby</PanelButton>
                </Panel>
            </div>
        </Screen>
    );
};

export interface UserProfileFlareProps {
    did: string;
    profile?: ProfileViewDetailed;
    style?: React.CSSProperties;
}

const StyledPlayerProfile = styled.div`
    margin-bottom: 10px;

    > .header {
        display: flex;
        align-items: center;
        width: 100%;
        font-size: 1.2rem;

        > img {
            flex-shrink: 0;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            overflow: hidden;
        }

        > .playerName {
            flex-grow: 1;
            margin-left: 20px;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        > .statTotalWins {
            flex-shrink: 0;
        }
    }

    > .stats {
        margin-top: 40px;
    }
`;

export const PlayerProfile: FunctionComponent<PlayerProfileProps> = ({
    bskyProfile,
    playerStats,
}) => {
    return (
        <StyledPlayerProfile>
            <div className="header">
                <img src={bskyProfile.avatar} />
                <div className="playerName">
                    {bskyProfile.displayName || bskyProfile.handle}
                </div>
                <div className="statTotalWins">
                    Wins: {playerStats.totalWins}
                </div>
            </div>
        </StyledPlayerProfile>
    );
};
