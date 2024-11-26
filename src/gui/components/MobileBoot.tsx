import { FunctionComponent, useCallback } from 'react';
import backgroundImage from '../../assets/img/start-background.png';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
import bootstyles from './MobileBoot.module.css';

export const MobileBoot: FunctionComponent = () => {
    const socket = useSocket();
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();

    const onStartClick = useCallback(() => {
        if (!socket) {
            return;
        }

        // Set name to peerId
        const playerIndex = socket.windowIndex;
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
        <div className={bootstyles.mainContainer}>
            <img src={backgroundImage} className={bootstyles.backgroundImage} />
            <div className={bootstyles.startBtn} onClick={onStartClick}>
                Start
            </div>
        </div>
    );
};
