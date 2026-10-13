import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Audio } from './audio.js';

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    }, undefined, reject);
  });
}

function usedRect(image) {
  const w = image.width;
  const h = image.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function loadWeapons(base) {
  const manifest = await (await fetch(`${base}weapons/weapons.json`)).json();
  const bin = await (await fetch(`${base}weapons/weapons.bin`)).arrayBuffer();
  const meshes = {};
  for (const [name, m] of Object.entries(manifest)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, m.position, m.vertices * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, m.normal, m.vertices * 3), 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, m.uv, m.vertices * 2), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(bin, m.index, m.indices), 1));
    meshes[name] = g;
  }
  const palette = await loadTexture(`${base}weapons/palette.png`);
  const gunMaterial = new THREE.MeshStandardMaterial({ map: palette, roughness: 0.55, metalness: 0.25 });
  const canister = await new GLTFLoader().loadAsync(`${base}weapons/ammo_canister.glb`);
  return { weaponMeshes: meshes, gunMaterial, canister: canister.scene };
}

export async function loadAssets(base, onProgress) {
  const index = await (await fetch(`${base}hamsters/index.json`)).json();
  const rects = await (await fetch(`${base}hamsters/rects.json`)).json();
  const total = index.length + 5;
  let done = 0;
  const tick = () => onProgress(++done / total);

  const hamsterPool = [];
  const hamsterByName = {};
  const hamsters = Promise.all(index.map(async (name) => {
    const tex = await loadTexture(`${base}hamsters/${name}.webp`);
    const r = rects[name];
    tex.name = name;
    tex.userData.used = r ? { x: r[2], y: r[3], w: r[4], h: r[5] } : usedRect(tex.image);
    hamsterPool.push(tex);
    hamsterByName[name] = tex;
    tick();
  }));
  const hamster = loadTexture(`${base}hamster.webp`).then((t) => { tick(); return t; });
  const petro = loadTexture(`${base}petro.webp`).then((t) => { tick(); return t; });
  const weapons = loadWeapons(base).then((w) => { tick(); return w; });
  const audio = Audio.load(base).then(() => tick());
  await Promise.all([hamsters, audio]);
  tick();
  return { hamsterPool, hamsterByName, hamster: await hamster, petro: await petro, ...(await weapons) };
}
