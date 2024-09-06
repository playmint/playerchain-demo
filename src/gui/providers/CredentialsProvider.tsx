import React, { useLayoutEffect } from 'react';
import { useState } from 'react';
import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import {
    CredentialsContext,
    CredentialsContextType,
} from '../hooks/use-credentials';
import { useSocket } from '../hooks/use-socket';

async function createCredentials(
    playerIndex: number,
): Promise<CredentialsContextType> {
    // --------------
    // temp, burn all the state on reload
    // TODO: only burn the state on first load not refresh
    // -------
    // if (playerIndex === 0) {
    //     await hardReset();
    // }
    // ------
    const peerSecretKey = `peerSecret/${playerIndex}`;
    let peerSecretValue = localStorage.getItem(peerSecretKey);
    if (peerSecretValue === null) {
        peerSecretValue = randomBytes(64).toString('base64');
        if (peerSecretValue === null) {
            throw new Error('Failed to generate peer secret');
        }
        localStorage.setItem(peerSecretKey, peerSecretValue);
    }
    const keys = await Encryption.createKeyPair(peerSecretValue);
    const peerId = Buffer.from(keys.publicKey).toString('hex');
    const shortId = peerId.slice(0, 8);
    const dbname = `client/${shortId}`;
    const clientId = keys.publicKey;
    return {
        peerId,
        shortId,
        clientId,
        keys,
        dbname,
    };
}

export const CredentialsProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [credentials, setCredentials] = useState<CredentialsContextType>();
    const socket = useSocket();

    useLayoutEffect(() => {
        if (!socket) {
            return;
        }
        createCredentials(socket.window.index)
            .then(setCredentials)
            .then(() => console.log('credentials-created'))
            .catch((err) => console.error('credentials-create-err:', err));
        return () => {
            setCredentials(undefined);
        };
    }, [socket]);

    if (!credentials) {
        return <div>Loading Credentials...</div>;
    }

    return (
        <CredentialsContext.Provider value={credentials}>
            {children}
        </CredentialsContext.Provider>
    );
};
