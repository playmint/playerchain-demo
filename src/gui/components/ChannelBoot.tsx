import { memo, useMemo } from 'react';
import { config } from 'socket:application';
import { BOOTSTRAP_PEERS } from '../../runtime/bootstrap';
import { NETWORK_ID } from '../../runtime/config';
import { DB } from '../../runtime/db';
import { sleep } from '../../runtime/timers';
import { hardReset } from '../../runtime/utils';
import { ClientContextType, useClient } from '../hooks/use-client';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import { useSocket } from '../hooks/use-socket';
import theme from '../styles/default.module.css';
import { TerminalView } from './Terminal';
import termstyles from './Terminal.module.css';

export const TERM_DELAY = 100;

type TerminalFlowArgs = {
    db: DB;
    peerId: string;
    client: ClientContextType;
    playerIndex: number;
    openDiscord: () => Promise<void>;
};

const terminalFlow = ({
    db,
    peerId,
    client,
    playerIndex,
    openDiscord,
}: TerminalFlowArgs) => {
    const defaultPlayerNameKey = `defaultPlayerName/${playerIndex}`;
    const defaultPlayerName =
        localStorage.getItem(defaultPlayerNameKey) || peerId.slice(0, 8);
    const paste = () => {
        document.execCommand('paste');
    };
    return [
        {
            text: (
                <>
                    <div className={termstyles.boldTextColor}>
                        Initializing playerchain runtime{' '}
                    </div>
                    <br />
                </>
            ),
            promise: async () => {
                await sleep(TERM_DELAY);
                return (
                    <>
                        {config['meta_title'].indexOf('v:') > -1 ? (
                            <p>v{config['meta_title'].split('v:')[1]}</p>
                        ) : (
                            <p>v{config['meta_version']}</p>
                        )}
                        <br />
                    </>
                );
            },
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
            promise: async () => {
                await sleep(100);
                return (
                    <>
                        {BOOTSTRAP_PEERS.map((p, idx) => (
                            <p key={idx}>
                                <span className={termstyles.defaultTextColor}>
                                    {p.peerId.slice(0, 32) + ' '}
                                </span>
                            </p>
                        ))}
                        <br />
                    </>
                );
            },
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
            promise: async () => {
                for (;;) {
                    await sleep(100);
                    const net = await db.network.get(NETWORK_ID);
                    if (!net) {
                        continue;
                    }
                    const { peerId } = net;
                    if (!peerId) {
                        continue;
                    }
                    return (
                        <>
                            <p>
                                Peer ID:{' '}
                                <span style={{ color: 'white' }}>{peerId}</span>
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
                        </>
                    );
                }
            },
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
            promise: async () => {
                for (;;) {
                    await sleep(100);
                    const net = await db.network.get(NETWORK_ID);
                    if (!net) {
                        continue;
                    }
                    const { natName } = net;
                    if (!natName) {
                        continue;
                    }

                    return (
                        <>
                            <p>
                                Type:{' '}
                                <span style={{ color: 'white' }}>
                                    {natName}
                                </span>
                            </p>
                            <br />
                        </>
                    );
                }
            },
        },
        {
            text: (
                <span className={termstyles.promptTextColor}>
                    Enter your name [{defaultPlayerName}]:
                </span>
            ),
            userInput: true,
            promise: (input: string) =>
                new Promise((resolve, reject) => {
                    input = input.trim();
                    if (input.length === 0) {
                        // default to peerId
                        input = defaultPlayerName;
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
                    localStorage.setItem(defaultPlayerNameKey, input);
                    db.peerNames
                        .put({ peerId, name: input })
                        .then(() => resolve('OK'))
                        .catch((err) =>
                            reject(`unable to set player name ${err}`),
                        );
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
            promise: async () => sleep(TERM_DELAY),
        },
        {
            text: 'Starting Playerchain...',
            next: 9999,
            promise: async () => {
                if (!client) {
                    throw 'client is not ready';
                }
                const rnd = (Math.random() + 1).toString(36).substring(7);
                try {
                    await client.createChannel(rnd);
                } catch (err) {
                    console.error('newChannel failed:', err);
                    throw 'failed to create channel';
                }
                return 'OK';
            },
        },
        {
            text: (
                <>
                    <br />
                    <span className={termstyles.promptTextColor}>
                        Looking for game? Check the lfg channel in our Discord:
                        <br />
                        <div
                            className={termstyles.boldTextColor}
                            style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                            onClick={openDiscord}
                        >
                            https://discord.gg/xKFyu8JF2g{' '}
                            <span
                                className={`${theme.materialSymbolsOutlined} ${termstyles.promptTextColor}`}
                                style={{ padding: '0 4px', cursor: 'pointer' }}
                                onClick={openDiscord}
                            >
                                output
                            </span>
                        </div>
                    </span>
                    <br />
                </>
            ),
            promise: async () => sleep(TERM_DELAY),
        },

        {
            text: (
                <span className={termstyles.promptTextColor}>
                    <br />
                    Paste a Playerchain key to join, or{' '}
                    <span
                        className={termstyles.link}
                        onClick={async () => {
                            try {
                                await hardReset();
                                window.location.reload();
                            } catch (err) {
                                console.error('hardReset failed:', err);
                            }
                        }}
                    >
                        go back
                    </span>
                    <span
                        className={`${theme.materialSymbolsOutlined} ${termstyles.promptTextColor}`}
                        style={{ padding: '0 4px', cursor: 'pointer' }}
                        onClick={paste}
                    >
                        {' '}
                        content_paste_go
                    </span>
                    :
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
};

const openDiscord = async (socket: any) => {
    try {
        await socket.window.openExternal('https://discord.gg/xKFyu8JF2g');
    } catch (error) {
        console.error('Failed to open Discord link:', error);
    }
};

export default memo(function ChannelBoot() {
    const socket = useSocket();
    const { peerId } = useCredentials();
    const client = useClient();
    const db = useDatabase();
    const flow = useMemo(
        () =>
            terminalFlow({
                db,
                peerId,
                client,
                playerIndex: socket!.window.index,
                openDiscord: () => openDiscord(socket),
            }),
        [client, db, peerId, socket],
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
