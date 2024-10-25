import { useFrame, useThree } from '@react-three/fiber';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { Object3D, Vector3 } from 'three';
import { BatchedRenderer, QuarksLoader, QuarksUtil } from 'three.quarks';
import { addShake } from '../renderer/ShakeManager';
import explodeJson from './ExplosionEffect04.json';

// Define the type for the methods you will expose via ref
export interface ExplodeFXHandle {
    triggerExplosion: (pos: Vector3) => void;
}

export const ExplodeFX = forwardRef<ExplodeFXHandle>((_props, ref) => {
    const batchRenderer = useMemo(() => new BatchedRenderer(), []);
    const [effect, setEffect] = useState<Object3D>();
    const scene = useThree((state) => state.scene);

    useImperativeHandle(ref, () => ({
        triggerExplosion(pos: Vector3) {
            if (!effect) {
                return;
            }
            effect.position.copy(pos);
            QuarksUtil.restart(effect);
            addShake({
                intensity: 300, // Adjust as needed
                frequency: 40,
                position: pos,
                decay: 700, // Rate at which the shake reduces
                duration: 1, // How long the shake lasts
            });
        },
    }));

    const clockRef = useRef(0);
    useFrame((_state, delta) => {
        console.time('notBeenLong');
        const oldClock = clockRef.current;
        clockRef.current = performance.now();
        const notBeenLong = clockRef.current - oldClock < 100;
        console.timeEnd('notBeenLong');
        if (notBeenLong) {
            return;
        }

        console.time('explode');
        batchRenderer.update(delta);
        console.timeEnd('explode');
    });

    useEffect(() => {
        const loader = new QuarksLoader();
        loader.setCrossOrigin('');
        loader.parse([explodeJson][0], (obj) => {
            QuarksUtil.addToBatchRenderer(obj, batchRenderer);
            QuarksUtil.stop(obj);
            setEffect(obj);
            scene.add(obj);
        });
        scene.add(batchRenderer);

        return () => {
            scene.remove(batchRenderer);
        };
    }, [batchRenderer, scene]);

    return null;
});
ExplodeFX.displayName = 'ExplodeFX';
