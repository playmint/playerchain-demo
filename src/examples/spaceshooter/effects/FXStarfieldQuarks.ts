import { useFrame, useThree } from "@react-three/fiber";
import { useState, useEffect} from "react";
import { BatchedRenderer, QuarksLoader, QuarksUtil } from "three.quarks";
import explodeJson from "./Starfield.json";
import { Object3D } from "three";

// Define the type for the methods you will expose via ref

  export const StarFieldFX =(() => {
    const { scene } = useThree();
  
      useEffect(() => {
        const batchRenderer = new BatchedRenderer();
      const loader = new QuarksLoader();
      loader.setCrossOrigin('');
      loader.parse([explodeJson][0], (obj) => {
        QuarksUtil.addToBatchRenderer(obj, batchRenderer);
        obj.position.set(0, 0, -130);
          batchRenderer.update(2000);
          scene.add(obj);
      });
      scene.add(batchRenderer);
  
      return () => {
        scene.remove(batchRenderer);
      };
    }, [scene]);
  
    return null;
  });