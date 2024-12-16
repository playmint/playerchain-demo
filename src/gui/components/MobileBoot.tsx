import { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs';
import { RecordNotFoundError } from '@atproto/api/dist/client/types/com/atproto/repo/getRecord';
import { TID } from '@atproto/common-web';
import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import backgroundImage from '../../assets/img/start-background.png';
import { useATProto } from '../hooks/use-atproto';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
import { LoginModal } from './LoginModal';
import styles from './MobileBoot.module.css';

interface PlayersReadyProps {
    readyPlayers: number;
}

const PlayersReady: FunctionComponent<PlayersReadyProps> = ({
    readyPlayers,
}) => {
    return (
        <div className={styles.playersReady}>
            {readyPlayers} / 4 players ready
        </div>
    );
};

export interface MobileBootProps {
    matchSeekingPeers: string[];
    setMatchPeers: (peers: string[]) => void;
}

const MAX_START_DELAY_MS = 5000;

export interface UserProfileFlareProps {
    profile: ProfileViewDetailed;
    style: React.CSSProperties;
}

export const UserProfileFlare: FunctionComponent<UserProfileFlareProps> = ({
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
            {profile.avatar && (
                <img src={profile.avatar} style={{ width: '50px' }} />
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
                {profile.displayName || profile.handle}
            </div>
        </div>
    );
};

export const MobileBoot: FunctionComponent<MobileBootProps> = ({
    matchSeekingPeers,
    setMatchPeers,
}) => {
    const socket = useSocket();
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();
    const [isStarting, setIsStarting] = useState(false);
    // const [readyPlayers, setReadyPlayers] = useState(0);
    const readyPlayers = matchSeekingPeers.length + 1;
    const { isLoggedIn, agent, logout } = useATProto();
    const [isShowingLoginModal, setIsShowingLoginModal] = useState(false);
    const [bskyProfile, setBskyProfile] = useState<
        ProfileViewDetailed | undefined
    >();

    const onPostClick = useCallback(() => {
        if (!agent) {
            return;
        }
        const recordType = 'com.playmint.dev.spaceshooter.profile';
        const rkey = 'self'; //TID.nextStr();

        const updateScore = async (score: number) => {
            // Get record

            let record: any;
            try {
                const recordRes = await agent.com.atproto.repo.getRecord({
                    repo: agent.assertDid,
                    collection: recordType,
                    rkey,
                });

                console.log('recordRes:', recordRes);
                record = recordRes.data.value;
            } catch (e) {
                if (!(e instanceof RecordNotFoundError)) {
                    throw e;
                }
                console.log('record not found, defining new one');
                record = {
                    $type: recordType,
                    score: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
            }

            record.score = (record.score as number) + score;
            record.updatedAt = new Date().toISOString();

            await agent.com.atproto.repo.putRecord({
                repo: agent.assertDid,
                collection: recordType,
                rkey,
                record,
                validate: false,
            });
        };

        updateScore(1)
            .then(() => {
                console.log('post success');
            })
            .catch((err) => {
                console.error('post failed:', err);
            });
    }, [agent]);

    const onLoginClick = useCallback(() => {
        setIsShowingLoginModal(true);
    }, []);

    const onStartClick = useCallback(() => {
        if (!socket) {
            return;
        }

        setMatchPeers(matchSeekingPeers.slice());

        // Set name to peerId
        const playerIndex = socket.windowIndex;
        const defaultPlayerNameKey = `defaultPlayerName/${playerIndex}`;
        const defaultPlayerName = peerId.slice(0, 8);
        localStorage.setItem(defaultPlayerNameKey, defaultPlayerName);

        db.peerNames
            .put({ peerId, name: defaultPlayerName })
            .then(() => {
                setIsStarting(true);
            })
            .catch((err) => console.error(`unable to set player name ${err}`));
    }, [db.peerNames, matchSeekingPeers, peerId, setMatchPeers, socket]);

    useEffect(() => {
        if (!agent) {
            setBskyProfile(undefined);
            return;
        }
        if (!agent.did) {
            return;
        }

        agent.app.bsky.actor
            .getProfile({ actor: agent.did })
            .then((profile) => {
                setBskyProfile(profile.data);
            })
            .catch((err) => {
                console.error('getProfile failed:', err);
            });
    }, [agent]);

    useEffect(() => {
        if (!isStarting) {
            return;
        }
        if (!client) {
            return;
        }

        console.log('starting timeout');
        const timeout = setTimeout(
            () => {
                // Start new playerchain
                const rnd = (Math.random() + 1).toString(36).substring(7);
                client.createChannel(rnd).catch((err) => {
                    console.error('newChannel failed:', err);
                });
            },
            Math.floor(Math.random() * MAX_START_DELAY_MS),
        );

        return () => clearTimeout(timeout);
    }, [client, isStarting]);

    return (
        <div className={styles.mainContainer}>
            <img src={backgroundImage} className={styles.backgroundImage} />
            {bskyProfile && (
                <UserProfileFlare
                    profile={bskyProfile}
                    style={{ position: 'absolute', top: '10px', left: '10px' }}
                />
            )}
            {!isShowingLoginModal && (
                <div className={styles.container}>
                    <div className={styles.titleText}>
                        Playerchain Space Shooter
                    </div>
                    <PlayersReady readyPlayers={readyPlayers} />
                    <div
                        className={styles.panelBtn}
                        onClick={onStartClick}
                        style={
                            isStarting
                                ? { opacity: '0.5', pointerEvents: 'none' }
                                : {}
                        }
                    >
                        Start Game
                    </div>
                    {!isLoggedIn && (
                        <div className={styles.panelBtn} onClick={onLoginClick}>
                            Login
                        </div>
                    )}
                    {isLoggedIn && (
                        <>
                            <div
                                className={styles.panelBtn}
                                onClick={onPostClick}
                            >
                                Post something
                            </div>
                            <div className={styles.panelBtn} onClick={logout}>
                                Logout
                            </div>
                        </>
                    )}

                    <div className={styles.infoText}>
                        {!isStarting ? (
                            <>
                                Two players required to start. For the best
                                experience, wait for four!
                            </>
                        ) : (
                            <>Creating match...</>
                        )}
                    </div>
                </div>
            )}
            {isShowingLoginModal && (
                <LoginModal onClose={() => setIsShowingLoginModal(false)} />
            )}
        </div>
    );
};
