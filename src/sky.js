import * as THREE from 'three';

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`;

const FRAG = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float cover;
uniform float time;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.5));
  col = mix(col, ground, smoothstep(0.0, -0.25, y));
  float sun = max(dot(d, sunDir), 0.0);
  col += sunColor * pow(sun, 8.0) * 0.25;
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 0.9 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv);
    float c = smoothstep(1.0 - cover, 1.0 - cover + 0.35, n) * smoothstep(0.0, 0.2, y);
    float lit = clamp(fbm(uv + sunDir.xz * 0.08) - n + 0.6, 0.0, 1.0);
    vec3 cloud = mix(vec3(0.62, 0.66, 0.74), vec3(1.0, 0.97, 0.92), lit) + sunColor * pow(sun, 6.0) * 0.4;
    col = mix(col, cloud, c * 0.92);
    col += sunColor * smoothstep(0.9993, 0.9997, sun) * 12.0 * (1.0 - c);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor(sunDir, sunColor) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color(0.1, 0.3, 0.74) },
        horizon: { value: new THREE.Color(0.78, 0.84, 0.92) },
        ground: { value: new THREE.Color().setRGB(0.42, 0.38, 0.33, THREE.SRGBColorSpace) },
        sunDir: { value: sunDir.clone().normalize() },
        sunColor: { value: sunColor },
        cover: { value: 0.55 },
        time: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.material);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  setColors(zenith, horizon) {
    this.material.uniforms.zenith.value.setRGB(zenith[0], zenith[1], zenith[2], THREE.SRGBColorSpace);
    this.material.uniforms.horizon.value.setRGB(horizon[0], horizon[1], horizon[2], THREE.SRGBColorSpace);
  }

  update(camera, time) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.time.value = time;
  }
}
