import Dexie from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { NETWORK_ID } from '../../runtime/config';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import theme from '../styles/default.module.css';
import { ChannelView } from './ChannelView';
import { Sidebar } from './Sidebar';

export function Layout() {
    // const { active: online, setActive: setOnline } = useTransport();
    const [channelPanelOpen, setChannelPanelOpen] = useState(true);
    const [channelListOpen, setChannelListOpen] = useState(true);
    const [activeChannelId, setActiveChannelId] = useState<string>();
    const { clientId, shortId } = useCredentials();
    const db = useDatabase();
    const net = useLiveQuery(async () => db?.network.get(NETWORK_ID), [db]);
    const online = net?.online && net?.ready;
    const tx = useLiveQuery(
        async () =>
            db.messages
                .where(['peer', 'height'])
                .between([clientId, Dexie.minKey], [clientId, Dexie.maxKey])
                .last(),
        [(db, clientId)],
    );
    const rx = useLiveQuery(async () => db.messages.count(), [db]);

    const toggleChannelList = useCallback(() => {
        setChannelListOpen((prev) => !prev);
    }, []);

    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
    }, []);

    const onChannelActivate = useCallback((id: string) => {
        setActiveChannelId(id);
    }, []);

    // debug - auto select first channel
    useEffect(() => {
        if (activeChannelId) {
            return;
        }
        db.channels
            .limit(1)
            .first()
            .then((channel) => {
                if (channel) {
                    setActiveChannelId(channel.id);
                }
            })
            .catch((err) => {
                console.error('autoselctchanerr', err);
            });
    }, [activeChannelId, clientId, db]);

    // const toggleOnline = useCallback(() => {
    //     if (!setOnline) {
    //         return;
    //     }
    //     console.log('toggle-online');
    //     setOnline((prev) => !prev);
    // }, [setOnline]);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                width: '100vw',
                height: '100vh',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    background: '#333',
                    flexShrink: 0,
                    color: '#aaa',
                    fontSize: '0.8rem',
                    justifyContent: 'space-between',
                }}
                className={theme.titlebar}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '1rem',
                    }}
                >
                    <div></div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '1rem',
                    }}
                >
                    <strong>Substream (devnet)</strong>
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.4rem',
                        color: '#999',
                        fontSize: '1.2rem',
                    }}
                >
                    <span
                        onClick={toggleChannelList}
                        className={theme.materialSymbolsOutlined}
                    >
                        left_panel_close
                    </span>
                    <span
                        onClick={toggleChannelPanel}
                        className={theme.materialSymbolsOutlined}
                    >
                        device_hub
                    </span>
                    <span className={theme.materialSymbolsOutlined}>
                        person
                    </span>
                </div>
            </div>
            <div
                style={{
                    flexGrow: 1,
                    flexShrink: 1,
                    display: 'flex',
                    overflow: 'hidden',
                }}
            >
                {channelListOpen && (
                    <Sidebar
                        active={activeChannelId}
                        onActivate={onChannelActivate}
                    />
                )}
                <ErrorBoundary fallback={<div>Something went wrong</div>}>
                    {online ? (
                        activeChannelId ? (
                            <ChannelView
                                details={channelPanelOpen}
                                channelId={activeChannelId}
                            />
                        ) : (
                            <div>No Channel Selected</div>
                        )
                    ) : (
                        <div>Offline</div>
                    )}
                </ErrorBoundary>
            </div>
            <div
                style={{
                    display: 'flex',
                    background: '#333',
                    flexShrink: 0,
                    color: '#aaa',
                    fontSize: '0.8rem',
                    justifyContent: 'space-between',
                    alignContent: 'center',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '1rem',
                        alignContent: 'center',
                    }}
                >
                    <div
                        style={{
                            padding: '3px 8px',
                        }}
                    >
                        <span
                            className={theme.materialSymbolsOutlined}
                            style={{ padding: '0 4px' }}
                        >
                            key
                        </span>
                        <span>{shortId}</span>
                    </div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '1rem',
                        alignContent: 'center',
                        color: 'rgba(255, 255, 255, 0.7)',
                    }}
                >
                    <div style={{ padding: '3px 8px' }}>
                        tx:{tx?.height ?? 0} rx:{rx ?? 0}
                    </div>
                    <div style={{ padding: '3px 8px' }}>{net?.natName}</div>
                    <div style={{ padding: '3px 8px' }}>
                        {net?.address ? `${net.address}:${net.port}` : ''}
                    </div>
                    <div
                        style={{
                            background: online ? '#339129' : '#f96d00',
                            color: '#eee',
                            padding: '3px 8px',
                        }}
                        // onDoubleClick={toggleOnline}
                    >
                        <span
                            className={theme.materialSymbolsOutlined}
                            style={{ paddingRight: '4px' }}
                        >
                            {online ? 'wifi' : 'wifi_off'}
                        </span>
                        {online ? 'ONLINE' : 'OFFLINE'}
                    </div>
                </div>
            </div>
        </div>
    );
}
