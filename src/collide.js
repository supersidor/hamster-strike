import * as THREE from 'three';
import * as D from './data.js';

const BARREL_R = 0.7;
const CRATE_INSET = 0.05;

export class Collision {
  constructor(level) {
    this.level = level;
    this.tiles = [];
  }

  rebuild() {
    const L = this.level;
    this.tiles = new Array(L.cols * L.rowCount);
    for (let r = 0; r < L.rowCount; r++) {
      for (let c = 0; c < L.cols; c++) {
        const list = [];
        const ch = L.rows[r][c];
        const center = L.tileCenter(c, r);
        const x0 = center.x - D.TILE / 2;
        const x1 = center.x + D.TILE / 2;
        const z0 = center.z - D.TILE / 2;
        const z1 = center.z + D.TILE / 2;
        if (ch === '#') {
          list.push(boxSolid(x0, x1, 0, L.wallTop(c, r), z0, z1, true));
        } else if (L.isSlope(c, r)) {
          const i = r * L.cols + c;
          list.push(wedgeSolid(center.x, center.z, L.slopeDx[i], L.slopeDz[i], L.hlo[i], L.hhi[i]));
        } else {
          const base = L.top(c, r);
          if (base > 0) list.push(boxSolid(x0, x1, 0, base, z0, z1, true));
          if (ch === 'c') list.push(boxSolid(x0 + CRATE_INSET, x1 - CRATE_INSET, base, base + D.CRATE_H, z0 + CRATE_INSET, z1 - CRATE_INSET, true));
          else if (ch === 'x') list.push(boxSolid(x0, x1, base, base + D.SANDBAG_H, z0, z1, false));
        }
        this.tiles[r * L.cols + c] = list;
      }
    }
  }

  barrelAt(c, r) {
    return this.level.inside(c, r) && this.level.grid[r][c] === 'o';
  }

  raycast(from, to, sightOnly) {
    const L = this.level;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    let best = Infinity;
    let bnx = 0;
    let bny = 1;
    let bnz = 0;
    let barrel = null;

    const px = (from.x + L.width / 2) / D.TILE;
    const pz = (from.z + L.depth / 2) / D.TILE;
    const ex = (to.x + L.width / 2) / D.TILE;
    const ez = (to.z + L.depth / 2) / D.TILE;
    let c = Math.floor(px);
    let r = Math.floor(pz);
    const stepC = ex > px ? 1 : -1;
    const stepR = ez > pz ? 1 : -1;
    const ddx = ex - px;
    const ddz = ez - pz;
    const tDeltaC = ddx === 0 ? Infinity : Math.abs(1 / ddx);
    const tDeltaR = ddz === 0 ? Infinity : Math.abs(1 / ddz);
    let tMaxC = ddx === 0 ? Infinity : ((stepC > 0 ? c + 1 - px : px - c)) * tDeltaC;
    let tMaxR = ddz === 0 ? Infinity : ((stepR > 0 ? r + 1 - pz : pz - r)) * tDeltaR;
    const endC = Math.floor(ex);
    const endR = Math.floor(ez);

    for (let guard = 0; guard < 400; guard++) {
      if (L.inside(c, r)) {
        const list = this.tiles[r * L.cols + c];
        for (let k = 0; k < list.length; k++) {
          const s = list[k];
          if (sightOnly && !s.sight) continue;
          const hit = rayConvex(s.planes, from, dx, dy, dz);
          if (hit && hit.t < best) {
            best = hit.t;
            bnx = hit.nx;
            bny = hit.ny;
            bnz = hit.nz;
            barrel = null;
          }
        }
        if (L.grid[r][c] === 'o') {
          const center = L.tileCenter(c, r);
          const t = rayCylinder(from, dx, dy, dz, center.x, center.z, BARREL_R, center.y, center.y + D.BARREL_H);
          if (t.t >= 0 && t.t < best) {
            best = t.t;
            bnx = t.nx;
            bny = t.ny;
            bnz = t.nz;
            barrel = [c, r];
          }
        }
      }
      if (best < Infinity) {
        const tileExit = Math.min(tMaxC, tMaxR);
        if (best <= tileExit + 1e-6) break;
      }
      if (c === endC && r === endR) break;
      if (tMaxC < tMaxR) {
        c += stepC;
        tMaxC += tDeltaC;
      } else {
        r += stepR;
        tMaxR += tDeltaR;
      }
      if (c < -1 || r < -1 || c > L.cols || r > L.rowCount) break;
    }

    if (dy < 0 && from.y > 0) {
      const t = -from.y / dy;
      if (t >= 0 && t <= 1 && t < best) {
        const x = from.x + dx * t;
        const z = from.z + dz * t;
        if (Math.abs(x) <= L.width / 2 && Math.abs(z) <= L.depth / 2) {
          best = t;
          bnx = 0;
          bny = 1;
          bnz = 0;
          barrel = null;
        }
      }
    }
    if (best === Infinity || best > 1) return null;
    return {
      t: best,
      point: new THREE.Vector3(from.x + dx * best, from.y + dy * best, from.z + dz * best),
      normal: new THREE.Vector3(bnx, bny, bnz),
      barrel,
    };
  }

  clear(from, to) {
    return this.raycast(from, to, true) === null;
  }

  surfaceAt(c, r, x, z) {
    const L = this.level;
    if (!L.inside(c, r)) return Infinity;
    const ch = L.grid[r][c];
    if (L.rows[r][c] === '#') return Infinity;
    const i = r * L.cols + c;
    let base;
    if (L.slopeDx[i] !== 0 || L.slopeDz[i] !== 0) {
      const center = L.tileCenter(c, r);
      const u = Math.min(1, Math.max(0, ((x - center.x) * L.slopeDx[i] + (z - center.z) * L.slopeDz[i]) / D.TILE + 0.5));
      base = L.hlo[i] + (L.hhi[i] - L.hlo[i]) * u;
    } else {
      base = L.hlo[i];
    }
    if (ch === 'c') return base + D.CRATE_H;
    if (ch === 'x') return base + D.SANDBAG_H;
    return base;
  }

  probe(x, z, radius, feet, climb) {
    const L = this.level;
    let support = -Infinity;
    let blocked = false;
    const [c0, r0] = L.tileAt(x - radius, z - radius);
    const [c1, r1] = L.tileAt(x + radius, z + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        let nx;
        let nz;
        if (!L.inside(c, r)) {
          blocked = true;
          continue;
        }
        const cx = (c + 0.5) * D.TILE - L.width / 2;
        const cz = (r + 0.5) * D.TILE - L.depth / 2;
        const half = D.TILE / 2 - (L.grid[r][c] === 'c' ? CRATE_INSET : 0);
        nx = Math.min(cx + half, Math.max(cx - half, x));
        nz = Math.min(cz + half, Math.max(cz - half, z));
        const dx = x - nx;
        const dz = z - nz;
        if (dx * dx + dz * dz >= radius * radius) continue;
        if (L.grid[r][c] === 'o') {
          const bx = x - cx;
          const bz = z - cz;
          const reach = BARREL_R + radius;
          if (bx * bx + bz * bz >= reach * reach) continue;
          const top = L.hlo[r * L.cols + c] + D.BARREL_H;
          if (top > feet + climb) blocked = true;
          else support = Math.max(support, top);
          continue;
        }
        const s = this.surfaceAt(c, r, nx, nz);
        if (s > feet + climb) blocked = true;
        else support = Math.max(support, s);
      }
    }
    return { blocked, support };
  }

  blockedAt(x, z, radius, feet, climb) {
    return this.probe(x, z, radius, feet, climb).blocked;
  }

  moveCircle(pos, dx, dz, radius, feet, climb) {
    let hit = false;
    const embedded = this.probe(pos.x, pos.z, radius, feet, climb).blocked;
    if (dx !== 0) {
      if (embedded || !this.probe(pos.x + dx, pos.z, radius, feet, climb).blocked) pos.x += dx;
      else hit = true;
    }
    if (dz !== 0) {
      if (embedded || !this.probe(pos.x, pos.z + dz, radius, feet, climb).blocked) pos.z += dz;
      else hit = true;
    }
    return hit;
  }

  support(x, z, radius, feet, climb) {
    const s = this.probe(x, z, radius, feet, climb).support;
    return s === -Infinity ? this.level.heightAt(x, z) : s;
  }

  ceiling() {
    return Infinity;
  }
}

function boxSolid(x0, x1, y0, y1, z0, z1, sight) {
  return {
    sight,
    planes: [
      [1, 0, 0, x1], [-1, 0, 0, -x0],
      [0, 1, 0, y1], [0, -1, 0, -y0],
      [0, 0, 1, z1], [0, 0, -1, -z0],
    ],
  };
}

function wedgeSolid(cx, cz, dx, dz, lo, hi) {
  const half = D.TILE / 2;
  const s = (hi - lo) / D.TILE;
  return {
    sight: true,
    planes: [
      [1, 0, 0, cx + half], [-1, 0, 0, -(cx - half)],
      [0, 0, 1, cz + half], [0, 0, -1, -(cz - half)],
      [0, -1, 0, 0],
      [-s * dx, 1, -s * dz, lo + (hi - lo) / 2 - s * (cx * dx + cz * dz)],
    ],
  };
}

function rayConvex(planes, o, dx, dy, dz) {
  let tEnter = 0;
  let tExit = 1;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let entered = false;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    const denom = p[0] * dx + p[1] * dy + p[2] * dz;
    const dist = p[3] - (p[0] * o.x + p[1] * o.y + p[2] * o.z);
    if (denom === 0) {
      if (dist < 0) return null;
      continue;
    }
    const t = dist / denom;
    if (denom < 0) {
      if (t > tEnter) {
        tEnter = t;
        nx = p[0];
        ny = p[1];
        nz = p[2];
        entered = true;
      }
    } else if (t < tExit) {
      tExit = t;
    }
    if (tEnter > tExit) return null;
  }
  if (!entered) return null;
  const len = Math.hypot(nx, ny, nz);
  return { t: tEnter, nx: nx / len, ny: ny / len, nz: nz / len };
}

export function rayCylinder(o, dx, dy, dz, cx, cz, radius, y0, y1) {
  const miss = { t: -1, nx: 0, ny: 0, nz: 0 };
  const ox = o.x - cx;
  const oz = o.z - cz;
  let tEnter = 0;
  let tExit = 1;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let entered = false;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) {
    if (ox * ox + oz * oz > radius * radius) return miss;
  } else {
    const b = ox * dx + oz * dz;
    const cc = ox * ox + oz * oz - radius * radius;
    const disc = b * b - a * cc;
    if (disc < 0) return miss;
    const sq = Math.sqrt(disc);
    const t0 = (-b - sq) / a;
    const t1 = (-b + sq) / a;
    if (t0 > tEnter) {
      tEnter = t0;
      const hx = ox + dx * t0;
      const hz = oz + dz * t0;
      nx = hx / radius;
      nz = hz / radius;
      ny = 0;
      entered = true;
    }
    tExit = Math.min(tExit, t1);
  }
  if (dy === 0) {
    if (o.y < y0 || o.y > y1) return miss;
  } else {
    const ta = (y0 - o.y) / dy;
    const tb = (y1 - o.y) / dy;
    const tIn = Math.min(ta, tb);
    const tOut = Math.max(ta, tb);
    if (tIn > tEnter) {
      tEnter = tIn;
      nx = 0;
      nz = 0;
      ny = dy < 0 ? 1 : -1;
      entered = true;
    }
    tExit = Math.min(tExit, tOut);
  }
  if (tEnter > tExit || !entered) return miss;
  return { t: tEnter, nx, ny, nz };
}

export function segmentDistance(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let k = len2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
  k = Math.min(1, Math.max(0, k));
  return Math.hypot(p.x - (a.x + abx * k), p.y - (a.y + aby * k), p.z - (a.z + abz * k));
}
