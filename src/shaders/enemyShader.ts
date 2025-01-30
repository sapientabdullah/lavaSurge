export const vertexShader = `
  uniform float time;
  varying vec3 vNormal;
  varying vec3 vPosition;
      
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float opacity;
  uniform vec3 color;
  varying vec3 vNormal;
  varying vec3 vPosition;
      
  void main() {
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    vec3 finalColor = color * (0.5 + fresnel * 0.5);
    gl_FragColor = vec4(finalColor, opacity * (0.5 + fresnel * 0.5));
  }
`;
