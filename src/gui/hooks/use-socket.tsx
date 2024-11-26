import { createContext, useContext } from 'react';

export interface SocketContextType {
    windowIndex: number;
    openExternal(url: string): Promise<void>;
}

export const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
    return useContext(SocketContext);
};
