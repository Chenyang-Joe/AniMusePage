import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.8 },
    darkness: { value: 0.6 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vignette = 1.0 - smoothstep(offset, offset + 0.5, dot(uv, uv));
      color.rgb = mix(color.rgb * (1.0 - darkness), color.rgb, vignette);
      gl_FragColor = color;
    }
  `,
}

export function buildPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.0,   // strength — starts at 0, pulses on magic moment
    0.4,   // radius
    0.92   // threshold — raised for bright scene; only true highlights bloom, not the whole surface
  )
  composer.addPass(bloom)

  const vignette = new ShaderPass(VignetteShader)
  composer.addPass(vignette)

  return { composer, bloom }
}
