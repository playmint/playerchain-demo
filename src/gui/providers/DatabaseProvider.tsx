import React, { useLayoutEffect } from 'react';
import { useState } from 'react';
import { DB } from '../../runtime/db';
import database from '../../runtime/db';
import { useCredentials } from '../hooks/use-credentials';
import { DatabaseContext } from '../hooks/use-database';

// import { useTransport } from '../hooks/use-transport';

export const DatabaseProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    // const { transport } = useTransport();
    const { dbname } = useCredentials();
    const [db, setDatabase] = useState<DB>();

    // create db
    useLayoutEffect(() => {
        if (!dbname) {
            return;
        }
        setDatabase(database.open(dbname));
    }, [dbname]);

    // connect client to transport
    // useLayoutEffect(() => {
    //     if (!client) {
    //         return;
    //     }
    //     if (!transport) {
    //         return;
    //     }
    //     console.debug('client-connected-transport');
    //     client.connect(transport);
    //     return () => {
    //         if (client) {
    //             client.disconnect();
    //             console.debug('client-disconnected-transport');
    //         }
    //     };
    // }, [client, transport]);

    if (!db) {
        return <div>Loading database...</div>;
    }

    return (
        <DatabaseContext.Provider value={db}>
            {children}
        </DatabaseContext.Provider>
    );
};
