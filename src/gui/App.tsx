import { Layout } from './components/Layout';
import { ClientProvider } from './providers/ClientProvider';
import { CredentialsProvider } from './providers/CredentialsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { SocketProvider } from './providers/SocketProvider';

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
