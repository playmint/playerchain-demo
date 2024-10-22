import React, { useLayoutEffect, useState } from 'react';
import application from 'socket:application';
import { Loading } from '../components/Loading';
import { SocketContext, SocketContextType } from '../hooks/use-socket';

async function getSocketContext(): Promise<SocketContextType> {
    const window = await application.getCurrentWindow();
    return { window };
}

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
    const [ctx, setCtx] = useState<SocketContextType | null>(null);
    console.log('socket provider render');

    useLayoutEffect(() => {
        getSocketContext()
            .then(setCtx)
            .catch((err) => console.error('socket-context-error', err));
    }, []);

    if (!ctx) {
        // TODO: susense/loading
        return <Loading />;
    }
    return (
        <SocketContext.Provider value={ctx}>{children}</SocketContext.Provider>
    );
};
