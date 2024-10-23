import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useSettings } from '../../../gui/hooks/use-settings';

export const MUSIC_NODE_NAME = 'bgm';

export default function AudioControls() {
    const { muted } = useSettings();
    const scene = useThree(({ scene }) => scene);

    // HELP! ... there MUST be a better way to do this
    // listeners have a setMasterVolume method, but I couldn't get it to
    // work!??! ... I gave up and just traversed the scene and set the volume
    useEffect(() => {
        scene.traverse((o: any) => {
            if (o.type === 'Audio') {
                if (o.name === MUSIC_NODE_NAME) {
                    o.setVolume(muted ? 0 : 0.1);
                } else {
                    o.setVolume(muted ? 0 : 0.33);
                }
            }
        });
    }, [muted, scene]);
    return null;
}
