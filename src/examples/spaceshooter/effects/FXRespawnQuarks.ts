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
import explodeJson from './SpawnEffect.json';

// Define the type for the methods you will expose via ref
export interface SpawnFXHandle {
    triggerSpawn: (pos: Vector3, parent: Object3D) => void;
}

export const SpawnFX = forwardRef<SpawnFXHandle>((_props, ref) => {
    const batchRenderer = useMemo(() => new BatchedRenderer(), []);
    const [effect, setEffect] = useState<Object3D>();
    const scene = useThree((state) => state.scene);

    useImperativeHandle(ref, () => ({
        triggerSpawn(pos: Vector3, parent: Object3D) {
            if (!effect) {
                return;
            }
            parent.add(effect);
            effect.position.copy(pos);
            QuarksUtil.restart(effect);
        },
    }));

    useFrame((_state, delta) => {
        batchRenderer.update(delta);
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
SpawnFX.displayName = 'SpawnFX';
