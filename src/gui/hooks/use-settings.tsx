import { createContext, useContext, useEffect, useRef } from 'react';
import { PlayerSettings } from '../../runtime/db';

// using a default empty value and letting the provider ensure that the value is not used
export const SettingsContext = createContext<Partial<PlayerSettings>>({});

export const useSettings = () => {
    return useContext(SettingsContext);
};

export const useSettingsRef = () => {
    const ref = useRef<Partial<PlayerSettings>>({});
    const settings = useSettings();
    useEffect(() => {
        ref.current = settings;
    }, [settings]);
    return ref;
};