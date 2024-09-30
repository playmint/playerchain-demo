import { useFrame, useThree } from "@react-three/fiber";
import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { BatchedRenderer, QuarksLoader, QuarksUtil } from "three.quarks";
import explodeJson from "./wallSparks.json";
import { Object3D, Vector3 } from "three";

// Define the type for the methods you will expose via ref
export interface SparksFXHandle {
    triggerSparks: (pos:Vector3) => void;
  }
  
  export const SparksFX = forwardRef<SparksFXHandle>((props, ref) => {
    const [batchRenderer] = useState(new BatchedRenderer());
    const [effect, setEffect] = useState(new Object3D());
    const { scene } = useThree();
  
    useImperativeHandle(ref, () => ({
      triggerSparks(pos: Vector3) {
            effect.position.copy(pos);
            QuarksUtil.restart(effect);
      },
    }));
  
    useFrame((state, delta) => {
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
  SparksFX.displayName = 'SparksFX';