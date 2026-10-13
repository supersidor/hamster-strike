import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import * as D from '../src/data.js';
import { MeshCollision } from '../src/meshCollide.js';
import { CLOSED, LINK_BITS, collisionGeometry } from '../src/meshmap.js';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const preview = flag('--preview');
const probeCell = flag('--probe');
const dumpGroups = args.includes('--groups');
const [srcDir, outBase] = args.filter((a) => !a.startsWith('--'));
const config = JSON.parse(fs.readFileSync(path.join(srcDir, 'map.json'), 'utf8'));
const S = config.scale;
const CELL = config.cell;
const NAV_R = config.navRadius;
const objName = fs.readdirSync(srcDir).find((f) => f.endsWith('.obj'));
const mtlName = fs.readdirSync(srcDir).find((f) => f.endsWith('.mtl'));

const textures = {};
let current = null;
for (const line of fs.readFileSync(path.join(srcDir, mtlName), 'utf8').split('\n')) {
  const [key, value] = line.trim().split(/\s+/);
  if (key === 'newmtl') current = value;
  else if (key === 'map_Kd') textures[current] = path.basename(value).replace(/\.[^.]+$/, '');
}

const v = [];
const vt = [];
const faces = [];
let group = '';
let material = '';
for (const line of fs.readFileSync(path.join(srcDir, objName), 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
  else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
  else if (p[0] === 'g') group = p.slice(1).join(' ');
  else if (p[0] === 'usemtl') material = p[1];
  else if (p[0] === 'f') faces.push({ group, material, corners: p.slice(1).map((c) => c.split('/').map((n) => Number(n) - 1)) });
}

let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;
for (const [x, y] of v) {
  minX = Math.min(minX, x);
  maxX = Math.max(maxX, x);
  minY = Math.min(minY, y);
  maxY = Math.max(maxY, y);
}
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const toGame = (x, y, z) => [(x - cx) * S, z * S, -(y - cy) * S];
const fromGame = (gx, gz) => [gx / S + cx, -gz / S + cy];

if (dumpGroups) {
  const groups = new Map();
  for (const f of faces) {
    const g = groups.get(f.group) || { faces: 0, mats: new Set(), lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    g.faces++;
    g.mats.add(f.material);
    for (const [vi] of f.corners) {
      for (let k = 0; k < 3; k++) {
        g.lo[k] = Math.min(g.lo[k], v[vi][k]);
        g.hi[k] = Math.max(g.hi[k], v[vi][k]);
      }
    }
    groups.set(f.group, g);
  }
  for (const [name, g] of groups) console.log(name, g.faces, [...g.mats].join(','), g.lo.join(' '), '..', g.hi.join(' '));
  process.exit(0);
}

const nonSolid = new Set(config.nonSolid || []);
const positions = [];
const uvs = [];
const vertexOf = new Map();
const tris = [];
let flipCount = 0;
let upCount = 0;
for (const f of faces) {
  const ids = f.corners.map(([vi, ti]) => {
    const key = `${vi}/${ti}`;
    if (!vertexOf.has(key)) {
      vertexOf.set(key, positions.length / 3);
      positions.push(...toGame(...v[vi]));
      uvs.push(...(ti >= 0 && vt[ti] ? vt[ti] : [0, 0]));
    }
    return vertexOf.get(key);
  });
  for (let k = 1; k + 1 < ids.length; k++) tris.push({ ids: [ids[0], ids[k], ids[k + 1]], material: f.material, solid: !nonSolid.has(f.group) });
}
const P = (i) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
const triNormal = (t) => new THREE.Triangle(P(t.ids[0]), P(t.ids[1]), P(t.ids[2])).getNormal(new THREE.Vector3());
for (const t of tris) {
  const n = triNormal(t);
  if (n.y > 0.9) upCount++;
  else if (n.y < -0.9) flipCount++;
}
const flip = flipCount > upCount;
if (flip) for (const t of tris) t.ids.reverse();
console.log(`${tris.length} triangles, ${positions.length / 3} vertices, horizontal up/down ${upCount}/${flipCount}${flip ? ' (flipped)' : ''}`);

const matOrder = [...new Set(tris.map((t) => t.material))].sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
const renderIndex = [];
const materials = [];
for (const m of matOrder) {
  const start = renderIndex.length;
  for (const t of tris) if (t.material === m) renderIndex.push(...t.ids);
  materials.push({ name: m, texture: textures[m], start, count: renderIndex.length - start });
}
const solidIndex = [];
for (const t of tris) if (t.solid) solidIndex.push(...t.ids);

const posArray = new Float32Array(positions);
const bvh = new MeshBVH(collisionGeometry(posArray, new Uint32Array(solidIndex)));
const level = { bvh, heightAt: () => 0 };
const col = new MeshCollision(level);

let gMinX = Infinity;
let gMaxX = -Infinity;
let gMinZ = Infinity;
let gMaxZ = -Infinity;
let gMaxY = -Infinity;
for (let i = 0; i < posArray.length; i += 3) {
  gMinX = Math.min(gMinX, posArray[i]);
  gMaxX = Math.max(gMaxX, posArray[i]);
  gMaxY = Math.max(gMaxY, posArray[i + 1]);
  gMinZ = Math.min(gMinZ, posArray[i + 2]);
  gMaxZ = Math.max(gMaxZ, posArray[i + 2]);
}
const cols = Math.ceil((Math.max(-gMinX, gMaxX) * 2) / CELL) + 2;
const rows = Math.ceil((Math.max(-gMinZ, gMaxZ) * 2) / CELL) + 2;
const width = cols * CELL;
const depth = rows * CELL;
const cellX = (c) => (c + 0.5) * CELL - width / 2;
const cellZ = (r) => (r + 0.5) * CELL - depth / 2;
const cellOf = (gx, gz) => [Math.floor((gx + width / 2) / CELL), Math.floor((gz + depth / 2) / CELL)];

const ray = new THREE.Ray();
const layers = new Array(cols * rows);
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    ray.origin.set(cellX(c), gMaxY + 1, cellZ(r));
    ray.direction.set(0, -1, 0);
    const hits = bvh.raycast(ray, THREE.DoubleSide).sort((a, b) => b.point.y - a.point.y);
    const list = [];
    let above = Infinity;
    for (const h of hits) {
      const n = h.face.normal;
      const y = h.point.y;
      if (n.y > 0.6 && above - y >= D.PLAYER_H) list.push(y);
      above = y;
    }
    layers[r * cols + c] = list;
  }
}

const isOpenRaw = (c, r, h) => !col.probe(cellX(c), cellZ(r), NAV_R, h, D.MAX_CLIMB).blocked;

if (probeCell) {
  const [c, r] = probeCell.split(',').map(Number);
  ray.origin.set(cellX(c), gMaxY + 1, cellZ(r));
  ray.direction.set(0, -1, 0);
  for (const h of bvh.raycast(ray, THREE.DoubleSide).sort((a, b) => b.point.y - a.point.y)) {
    const y = h.point.y;
    console.log(`hit y=${y.toFixed(2)} normal.y=${h.face.normal.y.toFixed(2)} blocked=${!isOpenRaw(c, r, y)}`);
  }
  console.log('layers', layers[r * cols + c], 'source', fromGame(cellX(c), cellZ(r)));
  process.exit(0);
}

const openCache = new Map();
const isOpen = (c, r, h) => {
  const key = `${c},${r},${h}`;
  if (!openCache.has(key)) openCache.set(key, isOpenRaw(c, r, h));
  return openCache.get(key);
};
const walk = (x0, z0, h0, x1, z1, h1, radius = NAV_R) => {
  let feet = h0;
  const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1);
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const z = z0 + ((z1 - z0) * k) / steps;
    if (col.probe(x, z, radius, feet, D.MAX_CLIMB).blocked) return false;
    const s = col.support(x, z, radius + 0.1, feet, D.MAX_CLIMB);
    if (s < feet - D.MAX_CLIMB) return false;
    feet = s;
  }
  return Math.abs(feet - h1) <= D.MAX_CLIMB;
};

const markerCell = ([sx, sy]) => cellOf(...toGame(sx, sy, 0).filter((_, i) => i !== 1));
const markers = config.markers || null;
const chosen = new Float64Array(cols * rows).fill(NaN);
const links = new Uint8Array(cols * rows);
const kingLinks = new Uint8Array(cols * rows);
if (markers) {
  const queue = [];
  const seed = (m) => {
    const [c, r] = markerCell(m);
    const list = layers[r * cols + c] || [];
    const h = [...list].reverse().find((y) => isOpen(c, r, y));
    if (h === undefined) {
      console.log(`WARNING: marker ${m} at cell ${c},${r} has no open floor`);
      return;
    }
    if (Number.isNaN(chosen[r * cols + c])) {
      chosen[r * cols + c] = h;
      queue.push(r * cols + c);
    }
  };
  seed(markers.P);
  for (const t of markers.T) seed(t);
  let conflicts = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const c = i % cols;
    const r = Math.floor(i / cols);
    const h = chosen[i];
    for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + ex;
      const nr = r + ez;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const n = nr * cols + nc;
      for (const y of layers[n]) {
        if (Math.abs(y - h) > 1.2 || !isOpen(nc, nr, y)) continue;
        if (!walk(cellX(c), cellZ(r), h, cellX(nc), cellZ(nr), y) || !walk(cellX(nc), cellZ(nr), y, cellX(c), cellZ(r), h)) continue;
        if (Number.isNaN(chosen[n])) {
          chosen[n] = y;
          queue.push(n);
        } else if (Math.abs(chosen[n] - y) > 0.01) {
          conflicts++;
          continue;
        }
        links[i] |= LINK_BITS[`${ex},${ez}`];
        links[n] |= LINK_BITS[`${-ex},${-ez}`];
      }
    }
  }
  console.log(`nav ${cols}x${rows} cells of ${CELL} m, ${queue.length} open, ${conflicts} overlapping-floor conflicts`);
  const kingOpen = (c, r) => !col.probe(cellX(c), cellZ(r), D.BOSS_WALL_R, chosen[r * cols + c], D.MAX_CLIMB).blocked;
  let kingCount = 0;
  for (const i of queue) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    for (const [ex, ez] of [[1, 0], [0, 1]]) {
      const n = i + ez * cols + ex;
      if (!(links[i] & LINK_BITS[`${ex},${ez}`]) || !kingOpen(c, r) || !kingOpen(c + ex, r + ez)) continue;
      const h = chosen[i];
      const y = chosen[n];
      if (!walk(cellX(c), cellZ(r), h, cellX(c + ex), cellZ(r + ez), y, D.BOSS_WALL_R)
        || !walk(cellX(c + ex), cellZ(r + ez), y, cellX(c), cellZ(r), h, D.BOSS_WALL_R)) continue;
      kingLinks[i] |= LINK_BITS[`${ex},${ez}`];
      kingLinks[n] |= LINK_BITS[`${-ex},${-ez}`];
      kingCount++;
    }
  }
  console.log(`${kingCount} King-sized links`);
  const check = (label, m) => {
    const [c, r] = markerCell(m);
    if (Number.isNaN(chosen[r * cols + c])) console.log(`WARNING: marker ${label} (${m}) at cell ${c},${r} is not reachable`);
  };
  for (const key of ['K', 'A', 'B']) check(key, markers[key]);
  markers.routes.forEach((m, k) => check(`route ${k + 1}`, m));
}

let floor = Infinity;
for (const h of chosen) if (!Number.isNaN(h)) floor = Math.min(floor, h);
if (floor === Infinity) floor = 0;
for (let i = 1; i < posArray.length; i += 3) posArray[i] -= floor;

if (preview) writePreview(preview);

if (markers && outBase) {
  const heights = new Int16Array(cols * rows).fill(CLOSED);
  for (let i = 0; i < chosen.length; i++) if (!Number.isNaN(chosen[i])) heights[i] = Math.round((chosen[i] - floor) * 100);
  const cellList = (list) => list.map(markerCell);
  const meta = {
    name: config.name,
    kind: 'mesh',
    dir: config.dir,
    sky: config.sky,
    walls: config.walls,
    fog: config.fog,
    stepUp: config.stepUp,
    navRadius: NAV_R,
    counts: { vertices: posArray.length / 3, indices: renderIndex.length, solid: solidIndex.length },
    materials,
    nav: {
      cell: CELL,
      cols,
      rows,
      heights: Buffer.from(heights.buffer).toString('base64'),
      links: Buffer.from(links.buffer).toString('base64'),
      kingLinks: Buffer.from(kingLinks.buffer).toString('base64'),
    },
    markers: {
      P: markerCell(markers.P),
      T: cellList(markers.T),
      K: markerCell(markers.K),
      A: markerCell(markers.A),
      B: markerCell(markers.B),
      routes: cellList(markers.routes),
    },
  };
  fs.writeFileSync(`${outBase}.json`, `${JSON.stringify(meta)}\n`);
  const parts = [posArray, new Float32Array(uvs), new Uint32Array(renderIndex), new Uint32Array(solidIndex)];
  fs.writeFileSync(`${outBase}.bin`, Buffer.concat(parts.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength))));
  console.log(`wrote ${outBase}.json and ${outBase}.bin`);
}

function writePreview(file) {
  const px = 4;
  const w = cols * px;
  const h = rows * px;
  const img = Buffer.alloc(w * h * 3);
  const set = (x, y, rgb) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    img.set(rgb, (y * w + x) * 3);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let rgb = [20, 20, 26];
      if (markers) {
        if (!Number.isNaN(chosen[i])) {
          const k = Math.min(1, (chosen[i] - floor) / 12);
          rgb = [90 + 160 * k, 80 + 140 * k, 60 + 60 * k];
        } else if (layers[i].some((y) => y < 6 && isOpen(c, r, y))) {
          rgb = [40, 60, 110];
        }
      } else if (layers[i].length) {
        const k = Math.min(1, (layers[i][0] - (-6)) / 18);
        rgb = [60 + 190 * k, 60 + 170 * k, 50 + 90 * k];
      }
      for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) set(c * px + dx, r * px + dy, rgb);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!links[i]) continue;
      const lx = c * px + px / 2;
      const ly = r * px + px / 2;
      if (!(links[i] & 1)) for (let d = 0; d < px; d++) set(c * px + px - 1, r * px + d, [200, 40, 40]);
      if (!(links[i] & 4)) for (let d = 0; d < px; d++) set(c * px + d, r * px + px - 1, [200, 40, 40]);
      set(lx, ly, [255, 255, 255]);
    }
  }
  for (let s = Math.ceil(minX / 256) * 256; s <= maxX; s += 256) {
    const [gx] = toGame(s, 0, 0);
    const x = Math.round(((gx + width / 2) / CELL) * px);
    for (let y = 0; y < h; y += s === 0 ? 1 : 3) set(x, y, s === 0 ? [255, 0, 0] : [0, 160, 255]);
  }
  for (let s = Math.ceil(minY / 256) * 256; s <= maxY; s += 256) {
    const gz = toGame(0, s, 0)[2];
    const y = Math.round(((gz + depth / 2) / CELL) * px);
    for (let x = 0; x < w; x += s === 0 ? 1 : 3) set(x, y, s === 0 ? [255, 0, 0] : [0, 160, 255]);
  }
  if (markers) {
    const dot = (m, rgb) => {
      const [c, r] = markerCell(m);
      for (let dy = -px; dy < 2 * px; dy++) for (let dx = -px; dx < 2 * px; dx++) set(c * px + dx, r * px + dy, rgb);
    };
    dot(markers.P, [0, 120, 255]);
    for (const t of markers.T) dot(t, [255, 60, 0]);
    dot(markers.K, [180, 0, 255]);
    dot(markers.A, [255, 220, 0]);
    dot(markers.B, [0, 255, 120]);
    for (const m of markers.routes) dot(m, [255, 255, 255]);
  }
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) img.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(`preview ${file}: ${px} px per ${CELL} m cell, blue lines every 256 units, red lines x=0 / y=0 (source); source x = ${cx} + (px/${px} - ${cols / 2}) * ${CELL / S}, y = ${cy} - (py/${px} - ${rows / 2}) * ${CELL / S}`);
}
