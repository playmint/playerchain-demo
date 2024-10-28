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
import shipImpactJson from './ShipImpact.json';

// Define the type for the methods you will expose via ref
export interface ShipImpactFXHandle {
    triggerShipImpact: (pos: Vector3) => void;
}

export const ShipImpactFX = forwardRef<ShipImpactFXHandle>((_props, ref) => {
    const batchRenderer = useMemo(() => new BatchedRenderer(), []);
    const [effect, setEffect] = useState<Object3D>();
    const [activeImpacts, setActiveImpacts] = useState(0);
    const scene = useThree((state) => state.scene);

    useImperativeHandle(ref, () => ({
        triggerShipImpact(pos: Vector3) {
            if (!effect) {return;}
            effect.position.copy(pos);
            QuarksUtil.restart(effect);

            setActiveImpacts((count) => count + 1);
            setTimeout(() => setActiveImpacts((count) => Math.max(0, count - 1)), 500);
        },
    }));

    useFrame((_state, delta) => {
        if (activeImpacts > 0) {
            batchRenderer.update(delta);
        }
    });

    useEffect(() => {
        const loader = new QuarksLoader();
        loader.setCrossOrigin('');
        loader.parse([shipImpactJson][0], (obj) => {
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
ShipImpactFX.displayName = 'ShipImpactFX';
