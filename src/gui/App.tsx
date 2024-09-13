import { Layout } from './components/Layout';
import { ClientProvider } from './providers/ClientProvider';
import { CredentialsProvider } from './providers/CredentialsProvider';
import { DatabaseProvider } from './providers/DatabaseProvider';
import { PackerLaceProvider } from './providers/PacketLaceProvider';
import { SettingsProvider } from './providers/SettingsProvider';
import { SocketProvider } from './providers/SocketProvider';

export default function App(_props: { instance: number }) {
    return (
        <SocketProvider>
            <CredentialsProvider>
                <DatabaseProvider>
                    <ClientProvider>
                        <PackerLaceProvider>
                            <SettingsProvider>
                                <Layout />
                            </SettingsProvider>
                        </PackerLaceProvider>
                    </ClientProvider>
                </DatabaseProvider>
            </CredentialsProvider>
        </SocketProvider>
    );
}
