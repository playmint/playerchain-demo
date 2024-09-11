import { useState } from 'react';
import { BOOTSTRAP_PEERS } from '../../runtime/bootstrap';
import { NETWORK_ID } from '../../runtime/config';
import { useClient } from '../hooks/use-client';
import { useDatabase } from '../hooks/use-database';
import { TerminalView } from './Terminal';

export function ChannelBoot() {
    const client = useClient();
    const db = useDatabase();

    const [groupKey, setGroupKey] = useState<string>('');

    const terminalFlow = [
        {
            text: (
                <>
                    <div style={{ color: 'rgb(140, 255, 140)' }}>
                        initializing{' '}
                        <span style={{ color: 'white' }}>
                            substream playerchain
                        </span>{' '}
                        runtime v0.0.1-dev
                    </div>
                    <br />
                </>
            ),
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 1000);
                }),
        },
        {
            text: 'bootstrapping playerchain network...',
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(
                            <>
                                {BOOTSTRAP_PEERS.map((p, idx) => (
                                    <p key={idx}>
                                        <span style={{ color: 'white' }}>
                                            {p.peerId.slice(0, 8) + ' '}
                                        </span>
                                        {p.address + ':' + p.port}
                                    </p>
                                ))}
                                <br />
                            </>,
                        );
                    }, 1000);
                }),
        },
        {
            text: 'getting network info...',
            promise: () =>
                new Promise((resolve, reject) => {
                    db.network
                        .get(NETWORK_ID)
                        .then((net) => {
                            if (!net) {
                                reject('network info not found');
                                return;
                            }
                            const { peerId, natType } = net;
                            resolve(
                                <>
                                    <p>
                                        peerId:{' '}
                                        <span style={{ color: 'white' }}>
                                            {peerId}
                                        </span>
                                    </p>
                                    <p>
                                        natType:{' '}
                                        <span style={{ color: 'white' }}>
                                            {natType}
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
                <span style={{ color: 'rgb(140, 255, 140)' }}>
                    what is your player name?
                </span>
            ),
            userInput: true,
            promise: (input: string) =>
                new Promise((resolve) => {
                    // Update name in settings
                    db.settings
                        .update(1, { name: input })
                        .catch((err) =>
                            console.error('unable to set player name', err),
                        );

                    // Will always resolve since setting the name isn't critical
                    resolve('player name set');
                }),
        },
        {
            text: (
                <span style={{ color: 'rgb(140, 255, 140)' }}>
                    <br />
                    what would you like to do?
                </span>
            ),
            choices: [
                { text: 'Start a playerchain', next: 1 },
                { text: 'Join a playerchain', next: 2 },
            ],
            promise: () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 1000);
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
                                resolve('playerchain created: ' + ch);
                            })
                            .catch((err) => {
                                console.error('newChannel failed:', err);
                                reject('failed to create channel');
                            });
                    }, 1000);
                }),
        },
        {
            text: 'paste playerchain key',
            userInput: true,

            promise: (input: string) =>
                new Promise((resolve, reject) => {
                    if (input.length < 60) {
                        reject(
                            <span className={'errorText'}>invalid key</span>,
                        );
                        return;
                    }

                    setGroupKey(input);
                    resolve('Playerchain key set');
                }),
        },
        {
            text: 'joining playerchain: ' + groupKey,
            promise: () =>
                new Promise((resolve, reject) => {
                    if (!client) {
                        reject('client is not ready');
                        return;
                    }
                    if (groupKey.length < 60) {
                        reject('invalid key');
                        return;
                    }

                    client
                        .joinChannel(groupKey)
                        .then(() => {
                            resolve('group joined');
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
                minWait={1000}
                nextOpWait={500}
                startIndex={0}
            />
        </div>
    );
}
