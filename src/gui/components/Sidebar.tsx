import { useLiveQuery } from 'dexie-react-hooks';
import { toSvg } from 'jdenticon';
import { useCallback, useMemo } from 'react';
import { ChannelInfo } from '../../runtime/channels';
import { useClient } from '../hooks/use-client';
import { useDatabase } from '../hooks/use-database';
import theme from '../styles/default.module.css';

function ChannelItem({
    channel,
    active,
    onClick,
}: {
    channel: ChannelInfo;
    active: boolean;
    onClick: (id: string) => void;
}) {
    const size = 50;
    const identicon = useMemo(() => {
        return toSvg(channel.id, size, {
            hues: [31],
            lightness: {
                color: [0.4, 0.6],
                grayscale: [0.4, 0.6],
            },
            saturation: {
                color: active ? 0.5 : 0,
                grayscale: active ? 0.5 : 0,
            },
        });
    }, [channel.id, size, active]);

    const onActivate = useCallback(() => {
        onClick(channel.id);
    }, [channel.id, onClick]);

    return (
        <div
            key={channel.id}
            onDoubleClick={() => navigator.clipboard.writeText(channel.id)}
            onClick={onActivate}
            style={{
                borderBottom: '1px solid rgba(0,0,0,0.2)',
                display: 'flex',
                justifyContent: 'flex-start',
                gap: '1rem',
                alignItems: 'center',
                flexDirection: 'row',
                padding: '0.5rem',
                background: active ? '#444' : '#333',
                boxShadow: active
                    ? 'inset 0 0 10px 0px rgba(0,0,0,0.2)'
                    : 'none',
            }}
        >
            <div
                style={{ display: 'flex', width: size }}
                dangerouslySetInnerHTML={{ __html: identicon }}
            ></div>
            <div
                style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textWrap: 'nowrap',
                }}
            >
                <div>{channel.name}</div>
                <div style={{ color: '#555' }}>{channel.id.slice(0, 8)}</div>
            </div>
        </div>
    );
}

export function Sidebar({
    active,
    onActivate,
}: {
    active?: string;
    onActivate: (id: string) => void;
}) {
    const db = useDatabase();
    const client = useClient();

    const channels = useLiveQuery(
        async (): Promise<ChannelInfo[]> => db.channels.toArray(),
        [db],
    );

    const onSubmit = useCallback(
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
            } else {
                client
                    .createChannel(v)
                    .catch((err) => console.error('newChannel failed:', err));
            }
        },
        [client],
    );

    return (
        <div
            style={{
                width: 270,
                background: '#333',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                fontSize: '0.9rem',
            }}
        >
            <div
                style={{
                    overflowY: 'auto',
                    flexGrow: 1,
                    maxHeight: '30rem',
                }}
            >
                {channels?.map((channel) =>
                    channel.id ? (
                        <ChannelItem
                            channel={channel}
                            key={channel.id}
                            active={active === channel.id}
                            onClick={onActivate}
                        />
                    ) : null,
                )}
            </div>
            <form
                onSubmit={onSubmit}
                style={{
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyItems: 'center',
                    alignItems: 'end',
                    flexGrow: 1,
                }}
            >
                <input
                    type="text"
                    name="name"
                    id="chinput"
                    style={{
                        background: '#222',
                        color: 'white',
                        width: '100%',
                        padding: '0.4rem 0.4rem 0 0.4rem',
                        fontSize: '0.8rem',
                        margin: 0,
                    }}
                />
                <button
                    type="submit"
                    style={{
                        background: '#444',
                        border: '1px solid #111',
                        padding: '0.4rem 0.4rem 0 0.4rem',
                        color: 'white',
                    }}
                >
                    <span className={theme.materialSymbolsOutlined}>add</span>
                </button>
            </form>
        </div>
    );
}
