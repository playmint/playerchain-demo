import { createContext, useContext } from 'react';
import { ClientKeys } from '../../runtime/client';

export interface CredentialsContextType {
    existing: boolean; // whether the credentials were already created
    peerId: string;
    clientId: Uint8Array;
    shortId: string;
    keys: ClientKeys;
    dbname: string;
}

// using a default empty value and letting the provider ensure that the value is not used
export const CredentialsContext = createContext<CredentialsContextType>({
    existing: false,
    peerId: '',
    clientId: new Uint8Array(0),
    dbname: '',
    shortId: '',
    keys: {
        privateKey: new Uint8Array(0),
        publicKey: new Uint8Array(0),
    },
});

export const useCredentials = () => {
    return useContext(CredentialsContext);
};
