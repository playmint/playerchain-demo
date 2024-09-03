import React, { useLayoutEffect } from 'react';
import { createContext, useContext, useState } from 'react';
import application from 'socket:application';

interface SocketContextType {
    window: Awaited<ReturnType<typeof application.getCurrentWindow>>;
}

async function getSocketContext(): Promise<SocketContextType> {
    const window = await application.getCurrentWindow();
    return { window };
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [ctx, setCtx] = useState<SocketContextType | null>(null);

    useLayoutEffect(() => {
        getSocketContext()
            .then(setCtx)
            .catch((err) => console.error('socket-context-error', err));
    }, []);

    if (!ctx) {
        // TODO: susense/loading
        return <div>Loading socket...</div>;
    }
    return (
        <SocketContext.Provider value={ctx}>{children}</SocketContext.Provider>
    );
};

export const useSocket = () => {
    return useContext(SocketContext);
};
