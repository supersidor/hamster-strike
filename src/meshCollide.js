import * as THREE from 'three';
import * as D from './data.js';
import { Collision } from './collide.js';

const RING = 8;
const ray = new THREE.Ray();
const box = new THREE.Box3();
const clipA = new Float64Array(30);
const clipB = new Float64Array(30);

export class MeshCollision extends Collision {
  rebuild() {}

  raycast(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-9) return null;
    ray.origin.copy(from);
    ray.direction.set(dx / len, dy / len, dz / len);
    const hit = this.level.bvh.raycastFirst(ray, THREE.DoubleSide, 0, len);
    if (!hit) return null;
    const normal = hit.face.normal.clone();
    if (normal.dot(ray.direction) > 0) normal.negate();
    return { t: hit.distance / len, point: hit.point.clone(), normal, barrel: null };
  }

  probe(x, z, radius, feet, climb) {
    const lo = feet + climb;
    const hi = feet + D.PLAYER_H;
    const r2 = radius * radius;
    box.min.set(x - radius, lo, z - radius);
    box.max.set(x + radius, hi, z + radius);
    let blocked = false;
    this.level.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (tri) => {
        if (triangleBlocks(tri, x, z, r2, lo, hi)) blocked = true;
        return blocked;
      },
    });
    return { blocked, support: -Infinity };
  }

  down(x, z, y) {
    ray.origin.set(x, y, z);
    ray.direction.set(0, -1, 0);
    const hit = this.level.bvh.raycastFirst(ray, THREE.DoubleSide, 0, 1000);
    return hit ? hit.point.y : -Infinity;
  }

  up(x, z, y) {
    ray.origin.set(x, y, z);
    ray.direction.set(0, 1, 0);
    const hit = this.level.bvh.raycastFirst(ray, THREE.DoubleSide, 0, 1000);
    return hit ? hit.point.y : Infinity;
  }

  support(x, z, radius, feet, climb) {
    const top = feet + climb;
    let best = this.down(x, z, top);
    for (let k = 0; k < RING; k++) {
      const a = (k * Math.PI * 2) / RING;
      best = Math.max(best, this.down(x + Math.cos(a) * radius, z + Math.sin(a) * radius, top));
    }
    return best === -Infinity ? this.level.heightAt(x, z, feet) : best;
  }

  ceiling(x, z, radius, feet) {
    const from = feet + 0.1;
    let best = this.up(x, z, from);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      best = Math.min(best, this.up(x + Math.cos(a) * radius, z + Math.sin(a) * radius, from));
    }
    return best;
  }
}

function clip(src, n, dst, y, keepAbove) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ay = src[i * 3 + 1];
    const by = src[j * 3 + 1];
    const ain = keepAbove ? ay >= y : ay <= y;
    const bin = keepAbove ? by >= y : by <= y;
    if (ain) {
      dst[m * 3] = src[i * 3];
      dst[m * 3 + 1] = ay;
      dst[m * 3 + 2] = src[i * 3 + 2];
      m++;
    }
    if (ain !== bin) {
      const t = (y - ay) / (by - ay);
      dst[m * 3] = src[i * 3] + (src[j * 3] - src[i * 3]) * t;
      dst[m * 3 + 1] = y;
      dst[m * 3 + 2] = src[i * 3 + 2] + (src[j * 3 + 2] - src[i * 3 + 2]) * t;
      m++;
    }
  }
  return m;
}

function triangleBlocks(tri, x, z, r2, lo, hi) {
  const { a, b, c } = tri;
  if (Math.max(a.y, b.y, c.y) <= lo || Math.min(a.y, b.y, c.y) >= hi) return false;
  clipA[0] = a.x; clipA[1] = a.y; clipA[2] = a.z;
  clipA[3] = b.x; clipA[4] = b.y; clipA[5] = b.z;
  clipA[6] = c.x; clipA[7] = c.y; clipA[8] = c.z;
  let n = clip(clipA, 3, clipB, lo, true);
  if (n === 0) return false;
  n = clip(clipB, n, clipA, hi, false);
  if (n === 0) return false;
  let sign = 0;
  let inside = true;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = clipA[i * 3];
    const az = clipA[i * 3 + 2];
    const ex = clipA[j * 3] - ax;
    const ez = clipA[j * 3 + 2] - az;
    const px = x - ax;
    const pz = z - az;
    const len2 = ex * ex + ez * ez;
    const k = len2 > 1e-12 ? Math.min(1, Math.max(0, (px * ex + pz * ez) / len2)) : 0;
    const qx = px - ex * k;
    const qz = pz - ez * k;
    if (qx * qx + qz * qz < r2) return true;
    const cross = ex * pz - ez * px;
    if (Math.abs(cross) > 1e-9) {
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) inside = false;
    }
  }
  return inside && sign !== 0;
}
