import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import process from 'socket:process';
import { useDatabase } from '../hooks/use-database';
import theme from '../styles/default.module.css';
import { devMenu, isWindows, setContextMenu } from '../system/menu';
import { ChannelBoot } from './ChannelBoot';
import { ChannelView } from './ChannelView';
import StatusBar from './StatusBar';

function fallbackRender({ error }) {
    return (
        <div role="alert">
            <p>Something went wrong:</p>
            <pre style={{ color: 'red' }}>{error.message}</pre>
        </div>
    );
}

export function Layout() {
    const db = useDatabase();
    const [channelPanelOpen, setChannelPanelOpen] = useState(true);

    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
    }, []);

    const toggleContextMenu = useCallback(() => {
        setContextMenu([devMenu]).catch((err) => console.error(err));
    }, []);

    const channels = useLiveQuery(async () => db.channels.toArray(), [], []);
    const channel = channels[0];

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
                    className={theme.windowDrag}
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-start',
                        gap: '1rem',
                    }}
                >
                    <div></div>
                </div>
                <div
                    className={theme.windowDrag}
                    style={{
                        display: isWindows ? 'none' : 'flex',
                        justifyContent: 'center',
                        gap: '1rem',
                        flexGrow: 1,
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
                        onClick={toggleChannelPanel}
                        className={theme.materialSymbolsOutlined}
                    >
                        right_panel_close
                    </span>
                    <span
                        onClick={toggleContextMenu}
                        className={theme.materialSymbolsOutlined}
                    >
                        menu
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
                <ErrorBoundary fallbackRender={fallbackRender}>
                    {channel ? (
                        <ChannelView
                            details={channelPanelOpen}
                            channelId={channel.id}
                        />
                    ) : (
                        <ChannelBoot />
                    )}
                </ErrorBoundary>
            </div>
            <StatusBar />
        </div>
    );
}
