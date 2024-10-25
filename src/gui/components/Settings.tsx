import { memo, useCallback, useEffect } from 'react';
import { useDatabase } from '../hooks/use-database';
import { useSettings } from '../hooks/use-settings';

const VolumeSetting = ({
    title,
    value,
    onChange,
}: {
    title: string;
    value: number;
    onChange: (e: any) => void;
}) => {
    return (
        <div
            style={{
                background: 'rgba(255,255,255,0.2)',
                border: 0,
                display: 'flex',
                flexDirection: 'row',
                padding: '0.5rem',
                justifyContent: 'space-between',
                alignContent: 'center',
            }}
        >
            <div>{title}</div>
            <input
                type="range"
                min={0}
                max={0.5}
                step={0.025}
                value={value}
                onChange={onChange}
            />
        </div>
    );
};

export default memo(function Settings({ onClose }: { onClose: () => void }) {
    const db = useDatabase();
    const { musicVolume, sfxVolume } = useSettings();

    const onSetBackgroundVolume = useCallback(
        (e) => {
            db.settings
                .update(1, { musicVolume: parseFloat(e.target.value) })
                .then(() =>
                    localStorage.setItem('defaultMusicVolume', e.target.value),
                )
                .catch((err) => console.error('set-music-volume', err));
        },
        [db],
    );

    const onSetSfxVolume = useCallback(
        (e) => {
            db.settings
                .update(1, { sfxVolume: parseFloat(e.target.value) })
                .then(() =>
                    localStorage.setItem('defaultSfxVolume', e.target.value),
                )
                .catch((err) => console.error('set-sfx-volume', err));
        },
        [db],
    );

    // call onClose on esc
    useEffect(() => {
        const onKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', onKeydown);
        return () => window.removeEventListener('keydown', onKeydown);
    }, [onClose]);

    const onClickBackground = useCallback(
        (e) => {
            if (e.target === e.currentTarget) {
                onClose();
            }
        },
        [onClose],
    );

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.8)',
                padding: '5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                zIndex: 100,
            }}
            onClick={onClickBackground}
        >
            <VolumeSetting
                title="Background Music"
                value={musicVolume}
                onChange={onSetBackgroundVolume}
            />
            <VolumeSetting
                title="Sound FX"
                value={sfxVolume}
                onChange={onSetSfxVolume}
            />
            <button
                onClick={onClose}
                style={{
                    padding: '0.4rem',
                    border: 0,
                }}
            >
                SAVE
            </button>
        </div>
    );
});
