import { memo, useMemo } from 'react';
import { config } from 'socket:application';
import { BOOTSTRAP_PEERS } from '../../runtime/bootstrap';
import { NETWORK_ID } from '../../runtime/config';
import { DB } from '../../runtime/db';
import { ClientContextType, useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { TerminalView } from './Terminal';
import termstyles from './Terminal.module.css';

export const TERM_DELAY = 100;

type TerminalFlowArgs = {
    db: DB;
    peerId: string;
    client: ClientContextType;
};

const terminalFlow = ({ db, peerId, client }: TerminalFlowArgs) => [
    {
        text: (
            <>
                <div className={termstyles.boldTextColor}>
                    Initializing playerchain runtime{' '}
                </div>
                <br />
            </>
        ),
        promise: () =>
            new Promise((resolve) => {
                setTimeout(() => {
                    resolve(
                        <>
                            {config['meta_title'].indexOf('v:') > -1 ? (
                                <p>v{config['meta_title'].split('v:')[1]}</p>
                            ) : (
                                <p>v{config['meta_version']}</p>
                            )}
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
                                        className={termstyles.defaultTextColor}
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
                                        {Buffer.from(peerId, 'hex').toString(
                                            'base64',
                                        )}
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
                Enter your name [{peerId.slice(0, 8)}]:
            </span>
        ),
        userInput: true,
        promise: (input: string) =>
            new Promise((resolve, reject) => {
                if (input.length === 0) {
                    // default to peerId
                    input = peerId.slice(0, 8);
                }
                if (input.length > 30) {
                    reject('TOO LONG');
                    return;
                }
                if (input.length < 3) {
                    reject('TOO SHORT');
                    return;
                }
                if (!/^[a-zA-Z0-9]+$/.test(input)) {
                    reject('ALPHA NUMERIC ONLY');
                    return;
                }
                db.peerNames
                    .put({ peerId, name: input })
                    .then(() => resolve('OK'))
                    .catch((err) => reject(`unable to set player name ${err}`));
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
            { text: 'Start a Playerchain', next: 1 },
            { text: 'Join a Playerchain', next: 2 },
        ],
        promise: () =>
            new Promise((resolve) => {
                setTimeout(resolve, TERM_DELAY);
            }),
    },
    {
        text: 'Starting Playerchain...',
        next: 9999,
        promise: () =>
            new Promise((resolve, reject) => {
                if (!client) {
                    reject('client is not ready');
                    return;
                }
                setTimeout(() => {
                    const rnd = (Math.random() + 1).toString(36).substring(7);
                    client
                        .createChannel(rnd)
                        .then((ch) => {
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
                input = input.trim();
                if (input.length < 5) {
                    reject(
                        <span className={termstyles.errorText}>
                            invalid key
                        </span>,
                    );
                    return;
                }
                if (!input) {
                    reject('client is not ready');
                    return;
                }
                if (input.length < 5) {
                    reject('invalid key');
                    return;
                }
                client
                    .joinChannel(input)
                    .then(() => {
                        resolve('OK');
                    })
                    .catch(reject);
            }),
    },
];

export default memo(function ChannelBoot() {
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();
    const flow = useMemo(
        () => terminalFlow({ db, peerId, client }),
        [client, db, peerId],
    );

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
                flow={flow}
                minWait={TERM_DELAY}
                nextOpWait={TERM_DELAY}
                startIndex={0}
            />
        </div>
    );
});
