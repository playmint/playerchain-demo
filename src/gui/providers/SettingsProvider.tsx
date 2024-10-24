import { useLiveQuery } from 'dexie-react-hooks';
import React, { useEffect } from 'react';
import { Loading } from '../components/Loading';
import { useDatabase } from '../hooks/use-database';
import { SettingsContext } from '../hooks/use-settings';

export const SettingsProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const db = useDatabase();
    const settings = useLiveQuery(() => {
        return db.settings.get(1);
    }, []);
    console.log('settings render');

    useEffect(() => {
        db.settings
            .count()
            .then((count) => {
                if (count == 0) {
                    return db.settings.add({
                        id: 1,
                        muted: import.meta.env.MODE !== 'production',
                    });
                }
            })
            .catch((err) => console.error('settings-add-err:', err));
    }, [db]);

    if (!settings) {
        return <Loading />;
    }

    return (
        <SettingsContext.Provider value={settings}>
            {children}
        </SettingsContext.Provider>
    );
};
