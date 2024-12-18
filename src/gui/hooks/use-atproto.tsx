import AtpAgent from '@atproto/api';
import { createContext, useContext } from 'react';

export interface ATProtoContextType {
    agent?: AtpAgent;
    pubAgent: AtpAgent;
    isLoggedIn: boolean;
    handle?: string;
    did?: string;
    login: (handle: string, password: string) => Promise<void>;
    logout: () => void;
}

export const ATProtoContext = createContext<ATProtoContextType>(
    // casting type because provider will enforce allways having a value
    {} as ATProtoContextType,
);

export const useATProto = () => {
    return useContext(ATProtoContext);
};
