import { useLiveQuery } from 'dexie-react-hooks';
import React, { useEffect } from 'react';
import { useDatabase } from '../hooks/use-database';
import { SettingsContext } from '../hooks/use-settings';

export const SettingsProvider = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const db = useDatabase();
    const settings = useLiveQuery(() => db.settings.get(1), [db]);

    useEffect(() => {
        if (!settings) {
            db.settings
                .put({ id: 1, name: '', muted: false })
                .catch((err) => console.error('settings-add-err:', err));
            return;
        }
    }, [db, settings]);

    if (!settings) {
        return <div>Loading Settings...</div>;
    }

    return (
        <SettingsContext.Provider value={settings}>
            {children}
        </SettingsContext.Provider>
    );
};
