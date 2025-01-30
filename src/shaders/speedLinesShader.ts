export const speedLinesShader = {
  uniforms: {
    tDiffuse: { value: null },
    speed: { value: 0.0 },
    time: { value: 0.0 },
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
    uniform float speed;
    uniform float time;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);

      vec2 center = vec2(0.5, 0.5);
      vec2 toCenter = center - vUv;
      float dist = length(toCenter);

      float angle = atan(toCenter.y, toCenter.x);
      float lines = sin(angle * 25.0 + time * 2.0) * 0.5 + 0.5;

      float noise = rand(vUv + time) * 0.2;
      lines *= (1.0 - noise);

      float fadeStart = 0.0;
      float fadeEnd = 0.8;
      float fade = smoothstep(fadeStart, fadeEnd, dist);

      float lineIntensity = lines * fade * speed * 0.5;

      vec3 lineColor = vec3(0.0, 0.0, 0.0);
      gl_FragColor = mix(texel, vec4(lineColor, 1.0), lineIntensity * 0.3); 
    }
  `,
};
