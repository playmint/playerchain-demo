import { useState } from 'react';
import { BOOTSTRAP_PEERS } from '../../runtime/bootstrap';
import { NETWORK_ID } from '../../runtime/config';
import { useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { TerminalView } from './Terminal';
import termstyles from './Terminal.module.css';

const TERM_DELAY = 500;

export function ChannelBoot() {
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();

    const [groupKey, setGroupKey] = useState<string>('');

    const terminalFlow = [
        {
            text: (
                <>
                    <div className={termstyles.boldTextColor}>
                        Initializing substream playerchain runtime{' '}
                    </div>
                    <br />
                </>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(
                            <>
                                <p>v0.0.1-dev</p>
                                <br />
                            </>,
                        );
                    }, TERM_DELAY);
                }),
        },
        {
            text: (
                <>
                    <div className={termstyles.boldTextColor}>
                        Discovering playerchain peers...
                    </div>
                    <br />
                </>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(
                            <>
                                {BOOTSTRAP_PEERS.map((p, idx) => (
                                    <p key={idx}>
                                        <span
                                            className={
                                                termstyles.defaultTextColor
                                            }
                                        >
                                            {p.peerId.slice(0, 32) + ' '}
                                        </span>
                                    </p>
                                ))}
                                <br />
                            </>,
                        );
                    }, TERM_DELAY);
                }),
        },
        {
            text: (
                <>
                    <div className={termstyles.boldTextColor}>
                        Generating client keypair...
                    </div>
                    <br />
                </>
            ),
            promise: () =>
                new Promise((resolve, reject) => {
                    db.network
                        .get(NETWORK_ID)
                        .then((net) => {
                            if (!net) {
                                reject('network info not found');
                                return;
                            }
                            const { peerId } = net;
                            resolve(
                                <>
                                    <p>
                                        Peer ID:{' '}
                                        <span style={{ color: 'white' }}>
                                            {peerId}
                                        </span>
                                    </p>
                                    <p>
                                        Public Key:{' '}
                                        <span style={{ color: 'white' }}>
                                            {Buffer.from(
                                                peerId,
                                                'hex',
                                            ).toString('base64')}
                                        </span>
                                    </p>
                                    <br />
                                </>,
                            );
                        })
                        .catch(() => {
                            reject('unable to get network info');
                        });
                }),
        },
        {
            text: (
                <>
                    <div className={termstyles.boldTextColor}>
                        Detecting NAT requirements...
                    </div>
                    <br />
                </>
            ),
            promise: () =>
                new Promise((resolve, reject) => {
                    db.network
                        .get(NETWORK_ID)
                        .then((net) => {
                            if (!net) {
                                reject('network info not found');
                                return;
                            }
                            const { natName } = net;
                            resolve(
                                <>
                                    <p>
                                        Type:{' '}
                                        <span style={{ color: 'white' }}>
                                            {natName}
                                        </span>
                                    </p>
                                    <br />
                                </>,
                            );
                        })
                        .catch(() => {
                            reject('unable to get network info');
                        });
                }),
        },
        {
            text: (
                <span className={termstyles.promptTextColor}>
                    Enter a name:
                </span>
            ),
            userInput: true,
            promise: (input: string) =>
                new Promise((resolve) => {
                    // Update name
                    db.peerNames
                        .put({ peerId, name: input })
                        .catch((err) =>
                            console.error('unable to set player name', err),
                        );

                    // Will always resolve since setting the name isn't critical
                    resolve('OK');
                }),
        },
        {
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Select an option:
                </span>
            ),
            choices: [
                { text: 'Start a playerchain', next: 1 },
                { text: 'Join a playerchain', next: 2 },
            ],
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, TERM_DELAY);
                }),
        },
        {
            text: 'starting playerchain...',
            next: 9999,
            promise: () =>
                new Promise((resolve, reject) => {
                    if (!client) {
                        reject('client is not ready');
                        return;
                    }
                    setTimeout(() => {
                        const rnd = (Math.random() + 1)
                            .toString(36)
                            .substring(7);
                        client
                            .createChannel(rnd)
                            .then((ch) => {
                                setGroupKey(ch);
                                // navigator.clipboard.writeText(ch).catch((err) => {
                                //     console.error('clipboard write failed:', err);
                                // });
                                resolve('OK' + ch);
                            })
                            .catch((err) => {
                                console.error('newChannel failed:', err);
                                reject('failed to create channel');
                            });
                    }, TERM_DELAY);
                }),
        },
        {
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Paste a Playerchain key to join:
                </span>
            ),
            userInput: true,

            promise: (input: string) =>
                new Promise((resolve, reject) => {
                    if (input.length < 5) {
                        reject(
                            <span className={termstyles.errorText}>
                                invalid key
                            </span>,
                        );
                        return;
                    }

                    setGroupKey(input);
                    resolve('OK');
                }),
        },
        {
            text: 'Connecting with key' + groupKey,
            promise: () =>
                new Promise((resolve, reject) => {
                    if (!client) {
                        reject('client is not ready');
                        return;
                    }
                    if (groupKey.length < 5) {
                        reject('invalid key');
                        return;
                    }

                    client
                        .joinChannel(groupKey)
                        .then(() => {
                            resolve('OK');
                        })
                        .catch((err) =>
                            console.error('joinChannel failed:', err),
                        );
                }),
        },
    ];

    return (
        <div
            style={{
                width: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontSize: '0.9rem',
            }}
        >
            <TerminalView
                flow={terminalFlow}
                minWait={TERM_DELAY}
                nextOpWait={500}
                startIndex={0}
            />
        </div>
    );
}
