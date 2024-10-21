import React, { useEffect } from 'react';
import { useState } from 'react';
import { Buffer } from 'socket:buffer';
import { randomBytes } from 'socket:crypto';
import { Encryption } from 'socket:network';
import { hardReset } from '../../runtime/utils';
import { TerminalView } from '../components/Terminal';
import termstyles from '../components/Terminal.module.css';
import {
    CredentialsContext,
    CredentialsContextType,
} from '../hooks/use-credentials';
import { useSocket } from '../hooks/use-socket';
import { isProduction } from '../system/menu';

async function createCredentials(
    playerIndex: number,
): Promise<CredentialsContextType> {
    let existing = true;
    const peerSecretKey = `peerSecret/${playerIndex}`;
    let peerSecretValue = localStorage.getItem(peerSecretKey);
    if (isProduction && peerSecretValue) {
        const keys = await Encryption.createKeyPair(peerSecretValue);
        const peerId = Buffer.from(keys.publicKey).toString('hex');
        const shortId = peerId.slice(0, 8);
        const dbname = `client/${shortId}`;
        // reset first
        await hardReset(dbname);
        peerSecretValue = null;
    }
    if (peerSecretValue === null) {
        existing = false;
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
        existing,
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
    const [isResumed, setIsResumed] = useState(false);
    const [credentials, setCredentials] = useState<CredentialsContextType>();
    const socket = useSocket();
    console.log('credentials provider render');

    useEffect(() => {
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

    if (credentials.existing && !isResumed) {
        const flow = [
            {
                text: (
                    <>
                        <span className={termstyles.boldTextColor}>
                            <br />
                            Detected an existing Playerchain session.
                        </span>
                        <span className={termstyles.promptTextColor}>
                            <br />
                            Do you want to resume the previous session?:
                        </span>
                    </>
                ),
                choices: [
                    { text: 'Resume', next: 2 },
                    { text: 'Reset', next: 1 },
                ],
                promise: () =>
                    new Promise((resolve) => {
                        setTimeout(resolve, 100);
                    }),
            },
            {
                text: 'Resetting...',
                next: 9999,
                promise: () =>
                    hardReset().then(() => {
                        setTimeout(() => window.location.reload(), 1000);
                    }),
            },
            {
                text: 'Resuming...',
                next: 1,
                promise: () =>
                    new Promise((resolve) => {
                        resolve('OK');
                        setIsResumed(true);
                    }),
            },
        ];

        return (
            <TerminalView
                flow={flow}
                minWait={250}
                nextOpWait={500}
                startIndex={0}
            />
        );
    }

    return (
        <CredentialsContext.Provider value={credentials}>
            {children}
        </CredentialsContext.Provider>
    );
};
