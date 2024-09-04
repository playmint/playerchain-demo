import { Layout } from './components/Layout';
import { SocketProvider } from './hooks/use-socket';
import { ClientProvider } from './providers/ClientProvider';
import { CredentialsProvider } from './providers/CredentialsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
import { SettingsProvider } from './providers/SettingsProvider';

export default function App(_props: { instance: number }) {
    return (
        <SocketProvider>
            <CredentialsProvider>
                <DatabaseProvider>
                    <ClientProvider>
                        <SettingsProvider>
                            <Layout />
                        </SettingsProvider>
                    </ClientProvider>
                </DatabaseProvider>
            </CredentialsProvider>
        </SocketProvider>
    );
}
