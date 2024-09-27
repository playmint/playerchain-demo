import { useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import ChannelLayout from './components/ChannelLayout';
import StatusBar from './components/StatusBar';
import { Titlebar } from './components/Titlebar';
import { ClientProvider } from './providers/ClientProvider';
import { CredentialsProvider } from './providers/CredentialsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
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
    const [channelPanelOpen, setChannelPanelOpen] = useState(true);
    const toggleChannelPanel = useCallback(() => {
        setChannelPanelOpen((prev) => !prev);
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
            <Titlebar toggleChannelPanel={toggleChannelPanel} />

            <ErrorBoundary fallbackRender={fallbackRender}>
                <SocketProvider>
                    <CredentialsProvider>
                        <DatabaseProvider>
                            <ClientProvider>
                                <SettingsProvider>
                                    <div
                                        style={{
                                            flexGrow: 1,
                                            flexShrink: 1,
                                            display: 'flex',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <ChannelLayout
                                            channelPanelOpen={channelPanelOpen}
                                        />
                                    </div>
                                    <StatusBar />
                                </SettingsProvider>
                            </ClientProvider>
                        </DatabaseProvider>
                    </CredentialsProvider>
                </SocketProvider>
            </ErrorBoundary>
        </div>
    );
}
