import { createContext, useContext } from 'react';
import type application from 'socket:application';

export interface SocketContextType {
    window: Awaited<ReturnType<typeof application.getCurrentWindow>>;
}

export const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
    return useContext(SocketContext);
};
