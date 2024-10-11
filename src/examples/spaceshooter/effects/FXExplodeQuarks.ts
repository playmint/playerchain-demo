import { useFrame, useThree } from "@react-three/fiber";
import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { BatchedRenderer, QuarksLoader, QuarksUtil } from "three.quarks";
import explodeJson from "./ExplosionEffect04.json";
import { Object3D, Vector3 } from "three";
import { addShake } from "../renderer/ShakeManager";

// Define the type for the methods you will expose via ref
export interface ExplodeFXHandle {
    triggerExplosion: (pos:Vector3, parent:Object3D) => void;
  }
  
  export const ExplodeFX = forwardRef<ExplodeFXHandle>((props, ref) => {
    const [batchRenderer] = useState(new BatchedRenderer());
    const [effect, setEffect] = useState(new Object3D());
    const { scene } = useThree();
  
    useImperativeHandle(ref, () => ({
      triggerExplosion(pos: Vector3, parent: Object3D) {
            parent.add(effect);
            effect.position.copy(pos);
            QuarksUtil.restart(effect);
            addShake({
                intensity: 100, // Adjust as needed
                frequency: 40,
                position: pos,
                decay: 200, // Rate at which the shake reduces
                duration: 1, // How long the shake lasts
            });
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
  ExplodeFX.displayName = 'ExplodeFX';