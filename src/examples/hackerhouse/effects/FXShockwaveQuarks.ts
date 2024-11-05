import { useFrame } from '@react-three/fiber';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useState,
} from 'react';
import { Object3D, Scene, Vector3 } from 'three';
import { BatchedRenderer, QuarksLoader, QuarksUtil } from 'three.quarks';
import ShockwaveJson from './Shockwave.json';

// Define the type for the methods you will expose via ref
export interface ShockwaveFXHandle {
    triggerExplosion: (pos: Vector3, parent: Object3D) => void;
}

// Define the props type to accept a scene prop
interface ShockwaveFXProps {
    scene: Scene;
}

export const ShockwaveFX = forwardRef<ShockwaveFXHandle, ShockwaveFXProps>(
    (props: { scene }, ref) => {
        const batchRenderer = useMemo(() => new BatchedRenderer(), []);
        const [effect, setEffect] = useState(new Object3D());

        useImperativeHandle(ref, () => ({
            triggerExplosion(pos: Vector3, parent: Object3D) {
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
            loader.parse([ShockwaveJson][0], (obj) => {
                QuarksUtil.addToBatchRenderer(obj, batchRenderer);
                QuarksUtil.stop(obj);
                setEffect(obj);
                props.scene.add(obj); // Use the passed scene prop
            });

            props.scene.add(batchRenderer); // Use the passed scene prop

            return () => {
                props.scene.remove(batchRenderer);
            };
        }, [batchRenderer, props.scene]);

        return null;
    },
);

ShockwaveFX.displayName = 'ShockwaveFX';
