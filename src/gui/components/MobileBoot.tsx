import { FunctionComponent, useCallback, useEffect, useState } from 'react';
import backgroundImage from '../../assets/img/start-background.png';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
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
            <div className={styles.container}>
                <div className={styles.titleText}>
                    Playerchain Space Shooter
                </div>
                <PlayersReady readyPlayers={readyPlayers} />
                <div
                    className={styles.startBtn}
                    onClick={onStartClick}
                    style={
                        isStarting
                            ? { opacity: '0.5', pointerEvents: 'none' }
                            : {}
                    }
                >
                    Start Game
                </div>
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
        </div>
    );
};
