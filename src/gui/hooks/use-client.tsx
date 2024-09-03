import { createContext, useContext } from 'react';
import type { Client, ClientConfig } from '../../runtime/client';

export type ClientUserConfig = Omit<
    ClientConfig,
    'network' | 'NAT' | 'Buffer' | 'crypto' | 'clusterId'
>;

export interface ClientContextType {
    commit: Client['commit'];
    createChannel: Client['createChannel'];
    joinChannel: Client['joinChannel'];
    init(cfg: ClientUserConfig): Promise<void>;
    shutdown(): Promise<void>;
}

export const ClientContext = createContext<ClientContextType | null>(null);

export const useClient = () => {
    return useContext(ClientContext);
};
