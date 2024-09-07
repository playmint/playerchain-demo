import { useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { SimulationProvider } from '../providers/SimulationProvider';
import theme from '../styles/default.module.css';
import { ChannelView } from './ChannelView';
import { Sidebar } from './Sidebar';
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
    const [channelPanelOpen, setChannelPanelOpen] = useState(true);
    const [channelListOpen, setChannelListOpen] = useState(true);
    const [activeChannelId, setActiveChannelId] = useState<string>();

    const toggleChannelList = useCallback(() => {
        setChannelListOpen((prev) => !prev);
    }, []);

    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
    }, []);

    const onChannelActivate = useCallback((id: string) => {
        setActiveChannelId(id);
    }, []);

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
                <ErrorBoundary fallbackRender={fallbackRender}>
                    {activeChannelId ? (
                        <SimulationProvider
                            src={src}
                            rate={FIXED_UPDATE_RATE}
                            channelId={activeChannelId}
                        >
                            <ChannelView
                                details={channelPanelOpen}
                                channelId={activeChannelId}
                            />
                        </SimulationProvider>
                    ) : (
                        <div>No Channel Selected</div>
                    )}
                </ErrorBoundary>
            </div>
            <StatusBar />
        </div>
    );
}
