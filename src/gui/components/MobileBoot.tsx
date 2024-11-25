import { FunctionComponent, useCallback, useState } from 'react';
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

export const MobileBoot: FunctionComponent = () => {
    const socket = useSocket();
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();
    const [readyPlayers, setReadyPlayers] = useState(0);

    const onStartClick = useCallback(() => {
        if (!socket) {
            return;
        }

        // Set name to peerId
        const playerIndex = socket.window.index;
        const defaultPlayerNameKey = `defaultPlayerName/${playerIndex}`;
        const defaultPlayerName = peerId.slice(0, 8);
        localStorage.setItem(defaultPlayerNameKey, defaultPlayerName);

        db.peerNames
            .put({ peerId, name: defaultPlayerName })
            .then(() => {
                // Start new playerchain
                const rnd = (Math.random() + 1).toString(36).substring(7);

                client.createChannel(rnd).catch((err) => {
                    console.error('newChannel failed:', err);
                });
            })
            .catch((err) => console.error(`unable to set player name ${err}`));
    }, [client, db.peerNames, peerId, socket]);

    return (
        <div className={styles.mainContainer}>
            <img src={backgroundImage} className={styles.backgroundImage} />
            <div className={styles.container}>
                <div className={styles.titleText}>
                    Playerchain Space Shooter
                </div>
                <PlayersReady readyPlayers={readyPlayers} />
                <div className={styles.startBtn} onClick={onStartClick}>
                    Start Game
                </div>
                <div className={styles.infoText}>
                    min 2 players, best with 4
                </div>
            </div>
        </div>
    );
};
