import * as THREE from 'three';
import * as D from './data.js';
import { srgb, lerpRgb, lerp } from './util.js';

function makeNoiseTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const grid = (cells, seed) => {
    const v = new Float32Array(cells * cells);
    let s = seed;
    for (let i = 0; i < v.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      v[i] = s / 4294967296;
    }
    return v;
  };
  const octaves = [[8, 1], [16, 0.5], [32, 0.25], [64, 0.125]].map(([cells, amp], i) => ({ cells, amp, v: grid(cells, 7 + i * 31) }));
  const sample = (o, x, y) => {
    const fx = (x / size) * o.cells;
    const fy = (y / size) * o.cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (a, b) => o.v[(((b % o.cells) + o.cells) % o.cells) * o.cells + (((a % o.cells) + o.cells) % o.cells)];
    return lerp(lerp(at(x0, y0), at(x0 + 1, y0), sx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx), sy);
  };
  let total = 0;
  for (const o of octaves) total += o.amp;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (const o of octaves) n += sample(o, x, y) * o.amp;
      n /= total;
      const shade = 0.78 + 0.22 * Math.min(1, Math.max(0, (n - 0.25) * 2));
      const k = (y * size + x) * 4;
      const byte = Math.round(shade * 255);
      img.data[k] = byte;
      img.data[k + 1] = byte;
      img.data[k + 2] = byte;
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
  }

  quad(p, normal, rgb, scale) {
    const a = new THREE.Vector3(...p[0]);
    const b = new THREE.Vector3(...p[1]);
    const c = new THREE.Vector3(...p[2]);
    const n = new THREE.Vector3(...normal);
    const geo = b.clone().sub(a).cross(c.clone().sub(a));
    const order = geo.dot(n) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    const color = srgb(rgb);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (const i of order) {
      const v = p[i];
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(n.x, n.y, n.z);
      let u;
      let w;
      if (ay >= ax && ay >= az) { u = v[0]; w = v[2]; } else if (ax >= az) { u = v[2]; w = v[1]; } else { u = v[0]; w = v[1]; }
      this.uv.push(u * scale, w * scale);
      this.col.push(color.r, color.g, color.b);
    }
  }

  box(x0, x1, y0, y1, z0, z1, rgb, scale, bottom = false) {
    this.quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0], rgb, scale);
    this.quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], rgb, scale);
    this.quad([[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], [-1, 0, 0], rgb, scale);
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], rgb, scale);
    this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1], rgb, scale);
    if (bottom) this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], rgb, scale);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function rects(level, keyOf) {
  const out = [];
  const open = new Map();
  for (let r = 0; r <= level.rowCount; r++) {
    const runs = new Set();
    if (r < level.rowCount) {
      let c = 0;
      while (c < level.cols) {
        const key = keyOf(c, r);
        if (key !== '') {
          let c1 = c;
          while (c1 + 1 < level.cols && keyOf(c1 + 1, r) === key) c1++;
          runs.add(`${key}#${c}#${c1}`);
          c = c1 + 1;
        } else {
          c++;
        }
      }
    }
    for (const [run, start] of [...open]) {
      if (!runs.has(run)) {
        const parts = run.split('#');
        const c1 = Number(parts.pop());
        const c0 = Number(parts.pop());
        out.push([parts.join('#'), c0, c1, start, r - 1]);
        open.delete(run);
      }
    }
    for (const run of runs) if (!open.has(run)) open.set(run, r);
  }
  return out;
}

function labelTexture(text, font, color, outline) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.lineWidth = 14;
    ctx.strokeStyle = outline;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, 256, 128);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildLevelMesh(level) {
  const group = new THREE.Group();
  group.name = 'Level';
  const noise = makeNoiseTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: noise, roughness: 0.92, metalness: 0 });
  const g = new GeoBuilder();
  const [wallBody, wallTrim, wallCap] = level.walls;
  const half = D.TILE / 2;

  for (let r = 0; r < level.rowCount; r++) {
    for (let c = 0; c < level.cols; c++) {
      if (level.rows[r][c] === '#' || level.isSlope(c, r)) continue;
      const center = level.tileCenter(c, r);
      const col = level.floorColor(c, r);
      g.quad([[center.x - half, center.y, center.z - half], [center.x + half, center.y, center.z - half],
        [center.x + half, center.y, center.z + half], [center.x - half, center.y, center.z + half]], [0, 1, 0], col, 0.35);
    }
  }

  const heights = { c: D.CRATE_H, x: D.SANDBAG_H };
  const block = (kind, c0, c1, r0, r1, base, topY) => {
    const a = level.tileCenter(c0, r0);
    const b = level.tileCenter(c1, r1);
    let x0 = a.x - half;
    let x1 = b.x + half;
    let z0 = a.z - half;
    let z1 = b.z + half;
    if (kind === 'c') { x0 += 0.05; x1 -= 0.05; z0 += 0.05; z1 -= 0.05; }
    const h = topY - base;
    if (kind === '#') {
      g.box(x0, x1, base, topY, z0, z1, wallBody, 0.25);
      g.box(x0 - 0.04, x1 + 0.04, topY - 0.06, topY + 0.06, z0 - 0.04, z1 + 0.04, wallCap, 0.3);
      g.box(x0 - 0.02, x1 + 0.02, base, base + 0.35, z0 - 0.02, z1 + 0.02, wallTrim, 0.3);
    } else if (kind === 'c') {
      g.box(x0, x1, base, topY, z0, z1, [0.55, 0.38, 0.20], 0.6);
      g.box(x0 - 0.02, x1 + 0.02, base + h * 0.8 - 0.08, base + h * 0.8 + 0.08, z0 - 0.02, z1 + 0.02, [0.32, 0.22, 0.12], 0.6);
    } else if (kind === 'x') {
      g.box(x0, x1, base, topY, z0, z1, [0.62, 0.56, 0.38], 0.9);
    } else {
      g.box(x0, x1, base, topY - 0.02, z0, z1, lerpRgb(wallBody, [0.8, 0.78, 0.74], 0.45), 0.3);
      g.box(x0 - 0.03, x1 + 0.03, topY - 0.12, topY - 0.02, z0 - 0.03, z1 + 0.03, wallTrim, 0.3);
    }
  };
  const keyOf = (c, r) => {
    const ch = level.rows[r][c];
    if (ch === '#') return `#|0|${level.wallTop(c, r).toFixed(2)}`;
    if (ch in heights) {
      const base = level.top(c, r);
      return `${ch}|${base.toFixed(2)}|${(base + heights[ch]).toFixed(2)}`;
    }
    return '';
  };
  for (const [key, c0, c1, r0, r1] of rects(level, keyOf)) {
    const [kind, base, top] = key.split('|');
    block(kind, c0, c1, r0, r1, Number(base), Number(top));
  }
  const raised = (c, r) => {
    const i = r * level.cols + c;
    if (level.rows[r][c] === '#' || level.isSlope(c, r) || level.hlo[i] <= 0) return '';
    return `p|0|${level.hlo[i].toFixed(2)}`;
  };
  for (const [key, c0, c1, r0, r1] of rects(level, raised)) {
    const [, , top] = key.split('|');
    block('p', c0, c1, r0, r1, 0, Number(top));
  }

  for (let r = 0; r < level.rowCount; r++) {
    for (let c = 0; c < level.cols; c++) if (level.isSlope(c, r)) addSlope(level, g, c, r);
  }

  const mesh = new THREE.Mesh(g.geometry(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  addBombsiteLabels(level, group);
  return group;
}

export function addBombsiteLabels(level, group) {
  for (const [label, p] of level.bombSites) {
    const floorLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: labelTexture(label, 'bold 300px sans-serif', 'rgba(242,89,38,0.85)'), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
      }),
    );
    floorLabel.rotation.x = -Math.PI / 2;
    floorLabel.position.set(p.x, p.y + 0.03, p.z);
    group.add(floorLabel);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture(`BOMBSITE ${label}`, 'bold 70px sans-serif', '#ffd94d', '#1a0d00'), transparent: true, depthWrite: false, toneMapped: false,
    }));
    sign.scale.set(6, 3, 1);
    sign.position.set(p.x, p.y + 3.2, p.z);
    group.add(sign);
  }
}

function addSlope(level, g, c, r) {
  const i = r * level.cols + c;
  const dx = level.slopeDx[i];
  const dz = level.slopeDz[i];
  const center = level.tileCenter(c, r);
  const cx = center.x;
  const cz = center.z;
  const half = D.TILE / 2;
  const lo = level.hlo[i];
  const hi = level.hhi[i];
  const color = level.floorColor(c, r);
  const fwd = [dx, 0, dz];
  const side = [-dz, 0, dx];
  const P = (f, s, y) => [cx + fwd[0] * f + side[0] * s, y, cz + fwd[2] * f + side[2] * s];
  if (level.isStairs(c, r)) {
    const steps = Math.max(2, Math.ceil((hi - lo) / D.STAIR_STEP));
    const run = D.TILE / steps;
    const nose = level.walls[1];
    for (let k = 0; k < steps; k++) {
      const y = lerp(lo, hi, (k + 1) / steps);
      const f0 = -half + run * k;
      const f1 = f0 + run;
      const pts = [P(f0, -half, 0), P(f1, -half, 0), P(f1, half, 0), P(f0, half, 0)];
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[2]);
      g.box(Math.min(...xs), Math.max(...xs), 0, y, Math.min(...zs), Math.max(...zs), color, 0.35);
      const n0 = P(f0, -half, 0);
      const n1 = P(f0 + 0.06, half, 0);
      g.box(Math.min(n0[0], n1[0]), Math.max(n0[0], n1[0]), y - 0.04, y + 0.01, Math.min(n0[2], n1[2]), Math.max(n0[2], n1[2]), nose, 0.35);
    }
  } else {
    const p = [P(-half, -half, 0), P(half, -half, 0), P(-half, -half, lo), P(half, -half, hi),
      P(-half, half, 0), P(half, half, 0), P(-half, half, lo), P(half, half, hi)];
    const rise = (hi - lo) / D.TILE;
    const up = [-rise * dx, 1, -rise * dz];
    g.quad([p[2], p[3], p[7], p[6]], up, color, 0.35);
    g.quad([p[0], p[1], p[3], p[2]], [-side[0], 0, -side[2]], color, 0.35);
    g.quad([p[4], p[5], p[7], p[6]], side, color, 0.35);
    g.quad([p[0], p[2], p[6], p[4]], [-fwd[0], 0, -fwd[2]], color, 0.35);
  }
}
