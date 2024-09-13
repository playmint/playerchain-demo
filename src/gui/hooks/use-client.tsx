import { createContext, useContext } from 'react';
import type { Client, ClientConfig } from '../../runtime/client';

export type ClientUserConfig = Omit<
    ClientConfig,
    'network' | 'NAT' | 'Buffer' | 'crypto' | 'clusterId'
>;

export interface ClientContextType {
    commit: Client['commit'];
    send: Client['send'];
    createChannel: Client['createChannel'];
    joinChannel: Client['joinChannel'];
    setPeers: Client['setPeers'];
    init(cfg: ClientUserConfig): Promise<void>;
    shutdown(): Promise<void>;
}

export const ClientContext = createContext<ClientContextType>(
    // casting type because provider will enforce allways having a value
    {} as ClientContextType,
);

export const useClient = () => {
    return useContext(ClientContext);
};
