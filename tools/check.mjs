import * as THREE from 'three';
import { checkMaps, loadLevel } from './check-maps.mjs';
import { Collision } from '../src/collide.js';

let failed = 0;
const fail = (m) => { failed++; console.error('FAIL:', m); };
const eq = (cond, msg) => { if (!cond) fail(msg); };

checkMaps(fail);

for (let i = 0; i < loadLevel().maps.length; i++) {
  const L = loadLevel();
  L.loadMap(i);
  const C = new Collision(L);
  C.rebuild();
  const tag = L.mapName;

  const p = L.playerStart;
  const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
  const down = C.raycast(eye, new THREE.Vector3(p.x, p.y - 3, p.z), true);
  eq(down && Math.abs(down.point.y - p.y) < 0.01, `${tag}: ray down from P lands on the floor`);
  const up = C.raycast(eye, new THREE.Vector3(p.x, p.y + 30, p.z), true);
  eq(up === null, `${tag}: nothing above P`);

  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const hit = C.raycast(eye, new THREE.Vector3(p.x + dx * 300, p.y + 1.6, p.z + dz * 300), false);
    eq(hit !== null && hit.t < 1, `${tag}: a ray from P (${dx},${dz}) hits a wall`);
  }

  for (let r = 0; r < L.rowCount; r++) {
    for (let c = 0; c < L.cols; c++) {
      if (L.rows[r][c] === '#') {
        const t = L.tileCenter(c, r);
        eq(C.blockedAt(t.x, t.z, 0.3, 0, 0.3), `${tag}: wall tile ${c},${r} blocks`);
      }
    }
  }

  const dist = L.flowField(...L.tileAt(p.x, p.z));
  let walked = 0;
  for (const spawn of L.spawnPoints.slice(0, 3)) {
    const pos = spawn.clone();
    for (let step = 0; step < 4000; step++) {
      const d = L.steer(dist, pos);
      if (d.lengthSq() === 0) break;
      const feet = pos.y;
      C.moveCircle(pos, d.x * 0.05, d.z * 0.05, 0.45, feet, 0.55);
      pos.y = C.support(pos.x, pos.z, 0.55, feet, 0.55);
      walked++;
    }
    const [c, r] = L.tileAt(pos.x, pos.z);
    eq(dist[r * L.cols + c] <= 1, `${tag}: a hamster following the flow field from a spawn reaches P (stopped ${dist[r * L.cols + c]} tiles away)`);
  }
  console.log(`collision ok: ${tag} (${walked} steps walked)`);
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('PASS');
