import { useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import platform from 'runtime:platform';
import { createDefaultMetrics } from '../runtime/metrics';
import { IntroUI } from './components/IntroUI';
import StatusBar from './components/StatusBar';
import { Titlebar } from './components/Titlebar';
import { ATProtoProvider } from './providers/ATProtoProvider';
import { ClientProvider } from './providers/ClientProvider';
import { CredentialsProvider } from './providers/CredentialsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
import { ProfileProvider } from './providers/ProfileProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { SocketProvider } from './providers/SocketProvider';

function fallbackRender({ error }) {
    return (
        <div role="alert">
            <p>Something went wrong:</p>
            <pre style={{ color: 'red' }}>{error.message}</pre>
        </div>
    );
}

export default function App(_props: { instance: number }) {
    const [channelPanelOpen, setChannelPanelOpen] = useState(false);
    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
    }, []);

    const metrics = useMemo(() => createDefaultMetrics(100), []);

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
            {!platform.isMobile && !platform.isBrowser && (
                <Titlebar toggleChannelPanel={toggleChannelPanel} />
            )}

            <ErrorBoundary fallbackRender={fallbackRender}>
                <SocketProvider>
                    <CredentialsProvider>
                        <DatabaseProvider>
                            <ClientProvider>
                                <SettingsProvider>
                                    <ATProtoProvider>
                                        <ProfileProvider>
                                            <div
                                                style={{
                                                    flexGrow: 1,
                                                    flexShrink: 1,
                                                    display: 'flex',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <IntroUI
                                                    channelPanelOpen={
                                                        channelPanelOpen
                                                    }
                                                    metrics={metrics}
                                                />
                                            </div>
                                            {!platform.isMobile && (
                                                <StatusBar metrics={metrics} />
                                            )}
                                        </ProfileProvider>
                                    </ATProtoProvider>
                                </SettingsProvider>
                            </ClientProvider>
                        </DatabaseProvider>
                    </CredentialsProvider>
                </SocketProvider>
            </ErrorBoundary>
        </div>
    );
}
