import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useCallback, useEffect, useRef } from 'react';
import { getPlayerColorUi } from '../../../gui/fixtures/player-colors';
import { useClient } from '../../../gui/hooks/use-client';
import { useDatabase } from '../../../gui/hooks/use-database';
import { StoredChatMessage } from '../../../runtime/db';
import { PlayerInfo } from './PlayerHUD';

export default memo(function Chat({
    players,
    peerNames,
}: {
    players: PlayerInfo[];
    peerNames: Record<string, string>;
}) {
    const db = useDatabase();
    const client = useClient();
    const messages = useLiveQuery(
        () =>
            db.chat
                .reverse()
                .limit(5)
                .toArray()
                .then((msgs) => msgs.reverse()),
        [],
        [] as StoredChatMessage[],
    );
    const peerName = useCallback(
        (peerId: string) => {
            return peerNames[peerId] || peerId.slice(0, 5);
        },
        [peerNames],
    );
    const input = useRef<HTMLInputElement>(null);
    const submit = useCallback(
        (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            // get value from input
            if (!input.current) {
                return;
            }
            // focus back to the window
            input.current.blur();
            const text = (input.current.value || '').trim().slice(0, 64);
            if (!text) {
                return;
            }
            input.current.value = '';
            client
                .sendChatMessage(text)
                .catch((err) =>
                    console.error('failed to send chat message', err),
                );
        },
        [client],
    );

    // register RETURN to focus text input
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && input.current) {
                input.current.focus();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);
    return (
        <div>
            {messages.map((m, i) => (
                <div
                    key={i}
                    style={{
                        padding: '0.25rem',
                        textAlign: 'left',
                        fontSize: '0.9rem',
                        textShadow: '1px 1px 1px black',
                    }}
                >
                    <span
                        style={{
                            color: getPlayerColorUi(
                                players.findIndex((p) => p.id === m.peer),
                            ),
                        }}
                    >
                        {peerName(m.peer)}:&nbsp;
                    </span>
                    <span>{m.msg}</span>
                </div>
            ))}
            <form
                onSubmit={submit}
                style={{ padding: 0, margin: 0, display: 'flex' }}
            >
                <input
                    ref={input}
                    type="text"
                    maxLength={64}
                    placeholder="[Enter] to chat"
                    style={{
                        background: 'transparent',
                        opacity: 0.6,
                        color: 'white',
                        margin: 0,
                        padding: '0.25rem',
                        flex: 1,
                        border: 0,
                        boxSizing: 'border-box',
                    }}
                />
            </form>
        </div>
    );
});
