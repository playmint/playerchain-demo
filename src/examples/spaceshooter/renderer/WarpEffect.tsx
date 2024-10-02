import React, { forwardRef, useMemo } from 'react'
import { Texture, Uniform } from 'three'
import { Effect } from 'postprocessing'

let _ustrength;

const HorizontalBlurShader = {
    fragmentShader: `
          uniform float strength;
          uniform sampler2D tBuffer;
  
          void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
            vec4 mask = texture2D(tBuffer, vUv);
            float warpAmount = 1.0-(mask.r*strength);
            vec2 warpUv = vUv * warpAmount;
            vec4 r = texture2D(inputBuffer, warpUv + vec2(mask.r*0.005, 0));
            vec4 g = texture2D(inputBuffer, warpUv);
            vec4 b = texture2D(inputBuffer, warpUv - vec2(mask.r*0.005, 0));
            vec4 texel1 = vec4(r.r, g.g, b.b, 1.0);
            outputColor = texel1;
          }`
  }

// Effect implementation
class WarpEffectImpl extends Effect {
    // Accept strength and tBuffer in the constructor
    constructor({ strength = 0.1, tBuffer = new Texture() }: { strength?: number; tBuffer?: Texture } = {}) {
      super('WarpEffect', HorizontalBlurShader.fragmentShader, {
        uniforms: new Map([
          ['strength', new Uniform(strength)],
          ['tBuffer', new Uniform(tBuffer)],
        ]),
      });
  
      // Save the properties as instance variables
      this.strength = strength;
      this.tBuffer = tBuffer;
      _ustrength = strength;
    }
  
    strength: number;
    tBuffer: Texture;
  
    update(_renderer, _inputBuffer, _deltaTime) {
      // Update uniforms directly from instance variables
      this.uniforms.get('strength').value = _ustrength;
      this.uniforms.get('tBuffer').value = this.tBuffer;
    }
  }

// Effect component
export const WarpEffect = forwardRef((props: { strength: number; tBuffer: Texture }, ref) => {
    const effect = useMemo(() => new WarpEffectImpl(props), [props]);
    return <primitive ref={ref} object={effect} dispose={null} />;
  });
  WarpEffect.displayName = 'WarpEffect';
  