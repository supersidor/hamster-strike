import * as THREE from 'three';
import * as D from './data.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DEFAULT_SKY = [[0.10, 0.30, 0.74], [0.78, 0.84, 0.92]];
const DEFAULT_WALLS = [[0.3, 0.27, 0.36], [0.17, 0.15, 0.21], [0.5, 0.46, 0.58]];

const colors = (text) => text.split(' ').filter(Boolean).map((t) => t.split(',').map(Number));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function parseMap(text) {
  let title = '';
  let walls = [];
  let sky = [];
  const tiles = [];
  const heights = [];
  let section = 'tiles';
  for (let line of text.split('\n')) {
    line = line.replace(/\s+$/, '');
    if (line.startsWith('name ')) title = line.slice(5).trim();
    else if (line.startsWith('walls ')) walls = colors(line.slice(6));
    else if (line.startsWith('sky ')) sky = colors(line.slice(4));
    else if (line === 'tiles' || line === 'heights') section = line;
    else if (line.length > 0) (section === 'heights' ? heights : tiles).push(line);
  }
  return { title, walls, sky, tiles, heights };
}

export class Level {
  constructor(mapTexts) {
    this.maps = mapTexts.map(parseMap);
    this.mapNames = this.maps.map((m) => m.title);
    this.mapIndex = -1;
    this.mapName = '';
    this.walls = DEFAULT_WALLS;
    this.sky = DEFAULT_SKY;
    this.rows = [];
    this.heightRows = [];
    this.grid = [];
    this.cols = 0;
    this.rowCount = 0;
    this.width = 0;
    this.depth = 0;
    this.playerStart = new THREE.Vector3();
    this.bossStart = new THREE.Vector3();
    this.spawnPoints = [];
    this.bombSites = [];
    this.barrels = [];
    this.routeTargets = [];
    this.routeFlows = [];
  }

  loadMap(index) {
    const data = this.maps[index];
    this.mapIndex = index;
    this.mapName = data.title;
    if (data.walls.length === 3) this.walls = data.walls;
    this.rows = data.tiles;
    this.heightRows = data.heights;
    this.sky = data.sky.length === 2 ? data.sky : DEFAULT_SKY;
    this.rowCount = this.rows.length;
    this.cols = this.rows[0].length;
    this.width = this.cols * D.TILE;
    this.depth = this.rowCount * D.TILE;
    this.grid = this.rows.map((row) => row.split(''));
    this.loadHeights();
    this.barrels = this.cells('o');
    this.playerStart = this.markers('P')[0];
    this.bossStart = this.markers('K')[0];
    this.spawnPoints = this.markers('T');
    this.bombSites = ['A', 'B'].map((label) => [label, this.markers(label)[0]]);
    this.routeTargets = [];
    for (const ch of ['1', '2', '3']) this.routeTargets.push(...this.markers(ch));
    this.updateWalk();
    this.routeFlows = this.computeRouteFlows();
  }

  cells(ch) {
    const out = [];
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.cols; c++) if (this.rows[r][c] === ch) out.push([c, r]);
    }
    return out;
  }

  markers(ch) {
    return this.cells(ch).map(([c, r]) => this.tileCenter(c, r));
  }

  tileCenter(c, r) {
    let y = 0;
    if (this.inside(c, r)) y = (this.hlo[r * this.cols + c] + this.hhi[r * this.cols + c]) / 2;
    return new THREE.Vector3((c + 0.5) * D.TILE - this.width / 2, y, (r + 0.5) * D.TILE - this.depth / 2);
  }

  levelChar(c, r) {
    if (r < 0 || r >= this.heightRows.length || c < 0 || c >= this.heightRows[r].length) return '0';
    return this.heightRows[r][c];
  }

  flatLevel(c, r) {
    const ch = this.levelChar(c, r);
    return /^[0-9]$/.test(ch) ? Number(ch) * D.STEP_H : 0;
  }

  loadHeights() {
    const n = this.cols * this.rowCount;
    this.hlo = new Float32Array(n);
    this.hhi = new Float32Array(n);
    this.slopeDx = new Int8Array(n);
    this.slopeDz = new Int8Array(n);
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        const ch = this.levelChar(c, r);
        this.hlo[i] = this.flatLevel(c, r);
        this.hhi[i] = this.hlo[i];
        const slope = D.SLOPES[ch];
        if (!slope) continue;
        const [dx, dz] = slope;
        let sc = c;
        let sr = r;
        while (this.levelChar(sc - dx, sr - dz) === ch) { sc -= dx; sr -= dz; }
        let ec = c;
        let er = r;
        while (this.levelChar(ec + dx, er + dz) === ch) { ec += dx; er += dz; }
        const count = Math.abs(ec - sc + er - sr) + 1;
        const k = Math.abs(c - sc + r - sr);
        const low = this.flatLevel(sc - dx, sr - dz);
        const high = this.flatLevel(ec + dx, er + dz);
        this.slopeDx[i] = dx;
        this.slopeDz[i] = dz;
        this.hlo[i] = lerp(low, high, k / count);
        this.hhi[i] = lerp(low, high, (k + 1) / count);
      }
    }
  }

  isSlope(c, r) {
    if (!this.inside(c, r)) return false;
    const i = r * this.cols + c;
    return this.slopeDx[i] !== 0 || this.slopeDz[i] !== 0;
  }

  isStairs(c, r) {
    return this.isSlope(c, r) && D.SLOPES[this.levelChar(c, r)][2] === 'stairs';
  }

  top(c, r) {
    if (!this.inside(c, r)) return 0;
    const i = r * this.cols + c;
    return Math.max(this.hlo[i], this.hhi[i]);
  }

  tileAt(x, z) {
    return [Math.floor((x + this.width / 2) / D.TILE), Math.floor((z + this.depth / 2) / D.TILE)];
  }

  heightAt(x, z) {
    const [c, r] = this.tileAt(x, z);
    if (!this.inside(c, r)) return 0;
    const i = r * this.cols + c;
    const dx = this.slopeDx[i];
    const dz = this.slopeDz[i];
    if (dx === 0 && dz === 0) return this.hlo[i];
    const cx = (c + 0.5) * D.TILE - this.width / 2;
    const cz = (r + 0.5) * D.TILE - this.depth / 2;
    const u = clamp(((x - cx) * dx + (z - cz) * dz) / D.TILE + 0.5, 0, 1);
    return lerp(this.hlo[i], this.hhi[i], u);
  }

  footing(x, z, radius) {
    const h = this.heightAt(x, z);
    let best = h;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI * 2) / 8;
      const s = this.heightAt(x + Math.cos(a) * radius, z + Math.sin(a) * radius);
      if (s > best && s - h <= D.MAX_CLIMB) best = s;
    }
    return best;
  }

  ground(pos) {
    return new THREE.Vector3(pos.x, this.heightAt(pos.x, pos.z), pos.z);
  }

  edgeHeight(c, r, ex, ez) {
    const i = r * this.cols + c;
    const dx = this.slopeDx[i];
    const dz = this.slopeDz[i];
    if (dx === 0 && dz === 0) return this.hlo[i];
    if (ex === dx && ez === dz) return this.hhi[i];
    if (ex === -dx && ez === -dz) return this.hlo[i];
    return (this.hlo[i] + this.hhi[i]) / 2;
  }

  linked(c, r, ex, ez) {
    const nc = c + ex;
    const nr = r + ez;
    if (!this.open(c, r) || !this.open(nc, nr)) return false;
    return Math.abs(this.edgeHeight(c, r, ex, ez) - this.edgeHeight(nc, nr, -ex, -ez)) <= D.MAX_CLIMB;
  }

  inside(c, r) {
    return r >= 0 && r < this.rowCount && c >= 0 && c < this.cols;
  }

  solid(c, r, kinds = D.SOLID) {
    return !this.inside(c, r) || kinds.includes(this.grid[r][c]);
  }

  updateWalk() {
    this.walk = new Uint8Array(this.cols * this.rowCount);
    for (let r = 0; r < this.rowCount; r++) {
      for (let c = 0; c < this.cols; c++) this.walk[r * this.cols + c] = D.SOLID.includes(this.grid[r][c]) ? 0 : 1;
    }
  }

  open(c, r) {
    return r >= 0 && r < this.rowCount && c >= 0 && c < this.cols && this.walk[r * this.cols + c] === 1;
  }

  flowField(startC, startR) {
    return this.flowFieldMulti([[startC, startR]]);
  }

  flowFieldMulti(seeds) {
    const dist = new Int32Array(this.cols * this.rowCount).fill(-1);
    const queue = [];
    for (const [c, r] of seeds) {
      if (!this.open(c, r)) continue;
      const first = r * this.cols + c;
      if (dist[first] === 0) continue;
      dist[first] = 0;
      queue.push(first);
    }
    if (queue.length === 0) return dist;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const c = i % this.cols;
      const r = Math.floor(i / this.cols);
      const d = dist[i] + 1;
      for (const [ex, ez] of DIRS4) {
        const n = (r + ez) * this.cols + (c + ex);
        if (this.linked(c, r, ex, ez) && dist[n] < 0) {
          dist[n] = d;
          queue.push(n);
        }
      }
    }
    return dist;
  }

  flowFieldAt(pos) {
    const [c, r] = this.tileAt(pos.x, pos.z);
    return this.flowField(c, r);
  }

  steer(dist, pos, out = new THREE.Vector3()) {
    out.set(0, 0, 0);
    if (!dist || dist.length === 0) return out;
    const [tc, tr] = this.tileAt(pos.x, pos.z);
    if (!this.open(tc, tr) || dist[tr * this.cols + tc] < 0) return out;
    let best = dist[tr * this.cols + tc];
    let tx = -1;
    let tz = -1;
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = tc + dc;
        const nr = tr + dr;
        if (dc === 0 || dr === 0) {
          if (!this.linked(tc, tr, dc, dr)) continue;
        } else if (!(this.linked(tc, tr, dc, 0) && this.linked(tc, tr, 0, dr)
          && this.linked(tc + dc, tr, 0, dr) && this.linked(tc, tr + dr, dc, 0))) {
          continue;
        }
        const d = dist[nr * this.cols + nc];
        if (d >= 0 && d < best) {
          best = d;
          tx = nc;
          tz = nr;
        }
      }
    }
    if (tx < 0) return out;
    const to = this.tileCenter(tx, tz);
    out.set(to.x - pos.x, 0, to.z - pos.z);
    return out.normalize();
  }

  reachable(dist, pos) {
    const [c, r] = this.tileAt(pos.x, pos.z);
    return this.inside(c, r) && dist[r * this.cols + c] >= 0;
  }

  computeRouteFlows() {
    return this.routeTargets.map((p) => this.flowFieldAt(p));
  }

  touching(pos, radius, ch) {
    const out = [];
    const [c0, r0] = this.tileAt(pos.x - radius, pos.z - radius);
    const [c1, r1] = this.tileAt(pos.x + radius, pos.z + radius);
    for (let r = Math.max(0, r0); r <= Math.min(this.rowCount - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        if (this.grid[r][c] !== ch) continue;
        const center = this.tileCenter(c, r);
        const half = D.TILE / 2;
        const nx = clamp(pos.x, center.x - half, center.x + half);
        const nz = clamp(pos.z, center.z - half, center.z + half);
        if ((pos.x - nx) ** 2 + (pos.z - nz) ** 2 <= radius * radius) out.push([c, r]);
      }
    }
    return out;
  }

  clearCell(c, r) {
    this.grid[r][c] = '.';
    this.walk[r * this.cols + c] = 1;
    this.routeFlows = this.computeRouteFlows();
  }

  floorKind(c, r) {
    const ch = this.rows[r][c];
    if (D.FLOOR_KINDS.includes(ch)) return ch;
    for (let k = 1; k < this.cols; k++) {
      for (const cc of [c - k, c + k]) {
        if (cc >= 0 && cc < this.cols && D.FLOOR_KINDS.includes(this.rows[r][cc])) return this.rows[r][cc];
      }
    }
    return '.';
  }

  floorColor(c, r) {
    return D.FLOOR_COLORS[this.floorKind(c, r)][(c + r) % 2];
  }

  wallTop(c, r) {
    let h = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (this.inside(c + dc, r + dr) && this.rows[r + dr][c + dc] !== '#') h = Math.max(h, this.top(c + dc, r + dr));
      }
    }
    return D.WALL_H + h;
  }

  resetBarrelGrid() {
    for (const [c, r] of this.barrels) this.grid[r][c] = 'o';
    this.updateWalk();
    this.routeFlows = this.computeRouteFlows();
  }
}
