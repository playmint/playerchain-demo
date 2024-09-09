import { useCallback } from 'react';
import { useClient } from '../hooks/use-client';

export default function ChannelBoot() {
    const client = useClient();

    const join = useCallback(
        (e: React.SyntheticEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (!client) {
                return;
            }
            const el = document.getElementById('chinput') as HTMLInputElement;
            const v = el.value;
            el.value = '';
            // assume big strings are keys
            if (v.length > 60) {
                client
                    .joinChannel(v)
                    .catch((err) => console.error('joinChannel failed:', err));
            }
        },
        [client],
    );

    const start = useCallback(() => {
        if (!client) {
            return;
        }
        const rnd = (Math.random() + 1).toString(36).substring(7);
        client
            .createChannel(rnd)
            .catch((err) => console.error('newChannel failed:', err));
    }, [client]);

    return (
        <div>
            <p>initializing substream playerchain runtime v0.0.1-dev</p>
            <p>bootstrapping playerchain network...</p>
            <p>Select</p>
            <div style={{ marginBottom: '2rem' }}>
                <button onClick={start}>START A PLAYERCHAIN</button>
            </div>
            <div>
                <form onSubmit={join}>
                    <input
                        placeholder="paste playerchain key to join"
                        type="text"
                        name="name"
                        id="chinput"
                        style={{
                            background: '#222',
                            border: '2px solid #eee',
                            color: 'white',
                            width: '100%',
                            padding: '0.4rem 0.4rem 0 0.4rem',
                            fontSize: '0.8rem',
                            margin: 0,
                        }}
                    />
                    <button type="submit">JOIN A PLAYERCHAIN</button>
                </form>
            </div>
        </div>
    );
}
