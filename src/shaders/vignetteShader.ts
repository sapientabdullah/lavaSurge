export const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;
    
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 center = vec2(0.5);
      float dist = length(vUv - center);
      float vignette = smoothstep(0.8, 0.4, dist * (1.0 + intensity));
      texel.rgb *= vignette;
      gl_FragColor = texel;
    }
  `,
};
