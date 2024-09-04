import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useSettings } from '../../../gui/hooks/use-settings';

export default function AudioControls() {
    const { muted } = useSettings();
    const scene = useThree(({ scene }) => scene);

    // HELP! ... there MUST be a better way to do this
    // listeners have a setMasterVolume method, but I couldn't get it to
    // work!??! ... I gave up and just traversed the scene and set the volume
    useEffect(() => {
        scene.traverse((o: any) => {
            if (o.type === 'Audio') {
                o.setVolume(muted ? 0 : 1);
            }
        });
    }, [muted, scene]);
    return <></>;
}
