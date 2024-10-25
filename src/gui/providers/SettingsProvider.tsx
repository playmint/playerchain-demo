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
    console.log('settings render. settings:', settings);

    useEffect(() => {
        db.settings
            .count()
            .then((count) => {
                if (count == 0) {
                    const defaultMusicVolume =
                        localStorage.getItem('defaultMusicVolume');
                    const defaultSfxVolume =
                        localStorage.getItem('defaultSfxVolume');
                    return db.settings.add({
                        id: 1,
                        musicVolume:
                            defaultMusicVolume !== null
                                ? parseFloat(defaultMusicVolume)
                                : import.meta.env.MODE !== 'production'
                                  ? 0
                                  : 0.1,
                        sfxVolume:
                            defaultSfxVolume !== null
                                ? parseFloat(defaultSfxVolume)
                                : import.meta.env.MODE !== 'production'
                                  ? 0.1
                                  : 0.2,
                    });
                }
            })
            .catch((err) => console.error('settings-add-err:', err));
    }, [db, settings]);

    if (!settings) {
        return <Loading />;
    }

    return (
        <SettingsContext.Provider value={settings}>
            {children}
        </SettingsContext.Provider>
    );
};
