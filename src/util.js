import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const randf = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;
export const expo = (rate, dt) => 1 - Math.exp(-rate * dt);

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function srgb(rgb, alpha) {
  const c = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  if (alpha !== undefined) c.a = alpha;
  return c;
}

export function lerpRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function stdMat(rgb, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: srgb(rgb), roughness: 0.5, metalness: 0.0, ...opts });
}
