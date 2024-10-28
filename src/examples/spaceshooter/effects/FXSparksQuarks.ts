import { useFrame, useThree } from '@react-three/fiber';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useState,
} from 'react';
import { Object3D, Vector3 } from 'three';
import { BatchedRenderer, QuarksLoader, QuarksUtil } from 'three.quarks';
import explodeJson from './wallSparks.json';

// Define the type for the methods you will expose via ref
export interface SparksFXHandle {
    triggerSparks: (pos: Vector3) => void;
}

export const SparksFX = forwardRef<SparksFXHandle>((_props, ref) => {
    const batchRenderer = useMemo(() => new BatchedRenderer(), []);
    const [effect, setEffect] = useState<Object3D>();
    const [activeSparks, setActiveSparks] = useState(0);
    const scene = useThree((state) => state.scene);

    useImperativeHandle(ref, () => ({
        triggerSparks(pos: Vector3) {
            if (!effect) {return;}
            effect.position.copy(pos);
            QuarksUtil.restart(effect);

            setActiveSparks((count) => count + 1);
            setTimeout(() => setActiveSparks((count) => Math.max(0, count - 1)), 500);
        },
    }));

    let lastUpdateTime = performance.now();
    const fpsInterval = 1000 / 60;
    
    useFrame((_state, _) => {
        if (activeSparks > 0) {
            const now = performance.now();
            const elapsed = now - lastUpdateTime;
            if (elapsed >= fpsInterval) {
                batchRenderer.update(elapsed / 1000);
                lastUpdateTime = now;
            }
        }
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
SparksFX.displayName = 'SparksFX';
