import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useCredentials } from '../hooks/use-credentials';
import { useDatabase } from '../hooks/use-database';
import SimulationProvider from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import { ChannelBoot } from './ChannelBoot';
import { ChannelView } from './ChannelView';
import StatusBar from './StatusBar';

const FIXED_UPDATE_RATE = 50;
const src = '/examples/spaceshooter.js'; // not a real src yet see runtime/game.ts

function fallbackRender({ error }) {
    return (
        <div role="alert">
            <p>Something went wrong:</p>
            <pre style={{ color: 'red' }}>{error.message}</pre>
        </div>
    );
}

export function Layout() {
    const { peerId } = useCredentials();
    const db = useDatabase();
    const [channelPanelOpen, setChannelPanelOpen] = useState(true);

    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
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
                        onClick={toggleChannelPanel}
                        className={theme.materialSymbolsOutlined}
                    >
                        right_panel_close
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
                <ErrorBoundary fallbackRender={fallbackRender}>
                    {channel ? (
                        <SimulationProvider
                            src={src}
                            rate={FIXED_UPDATE_RATE}
                            channelId={channel.id}
                            peerId={peerId}
                        >
                            <ChannelView
                                details={channelPanelOpen}
                                channelId={channel.id}
                            />
                        </SimulationProvider>
                    ) : (
                        <ChannelBoot />
                    )}
                </ErrorBoundary>
            </div>
            <StatusBar />
        </div>
    );
}
