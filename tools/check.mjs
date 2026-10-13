import * as THREE from 'three';
import { checkMaps, loadLevel } from './check-maps.mjs';
import * as D from '../src/data.js';
import { Collision } from '../src/collide.js';
import { MeshCollision } from '../src/meshCollide.js';

let failed = 0;
const fail = (m) => { failed++; console.error('FAIL:', m); };
const eq = (cond, msg) => { if (!cond) fail(msg); };

checkMaps(fail);

for (let i = 0; i < loadLevel().maps.length; i++) {
  const L = loadLevel();
  L.loadMap(i);
  const mesh = L.kind === 'mesh';
  const C = mesh ? new MeshCollision(L) : new Collision(L);
  C.rebuild();
  const tag = L.mapName;

  const p = L.playerStart;
  const eye = new THREE.Vector3(p.x, p.y + 1.6, p.z);
  const down = C.raycast(eye, new THREE.Vector3(p.x, p.y - 3, p.z), true);
  eq(down && Math.abs(down.point.y - p.y) < 0.05, `${tag}: ray down from P lands on the floor`);
  const up = C.raycast(eye, new THREE.Vector3(p.x, p.y + 30, p.z), true);
  eq(mesh || up === null, `${tag}: nothing above P`);

  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const hit = C.raycast(eye, new THREE.Vector3(p.x + dx * 300, p.y + 1.6, p.z + dz * 300), false);
    eq(hit !== null && hit.t < 1, `${tag}: a ray from P (${dx},${dz}) hits a wall`);
  }

  for (let r = 0; r < L.rowCount && !mesh; r++) {
    for (let c = 0; c < L.cols; c++) {
      if (L.rows[r][c] === '#') {
        const t = L.tileCenter(c, r);
        eq(C.blockedAt(t.x, t.z, 0.3, 0, 0.3), `${tag}: wall tile ${c},${r} blocks`);
      }
    }
  }

  let walked = 0;
  const follow = (start, dist, radius) => {
    const pos = start.clone();
    for (let step = 0; step < 12000; step++) {
      const d = L.steer(dist, pos);
      if (d.lengthSq() === 0) break;
      const feet = pos.y;
      C.moveCircle(pos, d.x * 0.05, d.z * 0.05, radius, feet, D.MAX_CLIMB);
      pos.y = C.support(pos.x, pos.z, radius + 0.1, feet, D.MAX_CLIMB);
      walked++;
    }
    const [c, r] = L.tileAt(pos.x, pos.z);
    return dist[r * L.cols + c];
  };
  const dist = L.flowField(...L.tileAt(p.x, p.z));
  for (const spawn of L.spawnPoints.slice(0, 3)) {
    const left = follow(spawn, dist, Math.min(0.8, L.wallRadius));
    eq(left <= 1, `${tag}: a hamster following the flow field from a spawn reaches P (stopped ${left} tiles away)`);
  }
  for (const [label, site] of L.bombSites) {
    const left = follow(L.bossStart, L.flowField(...L.tileAt(site.x, site.z), L.kingLinks), D.BOSS_WALL_R);
    eq(left <= 2, `${tag}: the King walks from K to site ${label} (stopped ${left} tiles away)`);
  }
  console.log(`collision ok: ${tag} (${walked} steps walked)`);
}

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('PASS');
