import { useLiveQuery } from 'dexie-react-hooks';
import { memo, useCallback, useEffect, useRef } from 'react';
import { useClient } from '../../../gui/hooks/use-client';
import { useDatabase } from '../../../gui/hooks/use-database';
import { StoredChatMessage } from '../../../runtime/db';

export default memo(function Chat({
    peerNames,
}: {
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
            const text = input.current.value;
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
                        padding: '0.5rem',
                        textAlign: 'left',
                        fontSize: '0.9rem',
                    }}
                >
                    {peerName(m.peer)}: {m.msg}
                </div>
            ))}
            <form onSubmit={submit}>
                <input
                    ref={input}
                    type="text"
                    style={{ background: 'transparent', color: 'white' }}
                />
            </form>
        </div>
    );
});
