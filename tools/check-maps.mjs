import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Level } from '../src/level.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/maps');
export function loadLevel() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  return new Level(files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')));
}

export function checkMaps(fail) {
  const level = loadLevel();
  for (let i = 0; i < level.maps.length; i++) {
    level.loadMap(i);
    const tag = level.mapName;
    const check = (cond, msg) => { if (!cond) fail(`${tag}: ${msg}`); };
    check(level.markers('P').length === 1, 'exactly one P');
    check(level.markers('K').length === 1, 'exactly one K');
    check(level.markers('A').length === 1 && level.markers('B').length === 1, 'sites A and B');
    check(level.spawnPoints.length > 0, 'hamster spawns');
    for (let r = 0; r < level.rowCount; r++) check(level.rows[r].length === level.cols, `row ${r} width`);
    if (level.heightRows.length) {
      check(level.heightRows.length === level.rowCount, 'heights row count');
      level.heightRows.forEach((row, r) => check(row.length === level.cols, `heights row ${r} width`));
    }
    for (let r = 0; r < level.rowCount; r++) {
      for (let c = 0; c < level.cols; c++) {
        if (!level.isSlope(c, r)) continue;
        const ti = r * level.cols + c;
        const rise = level.hhi[ti] - level.hlo[ti];
        const dx = level.slopeDx[ti];
        const dz = level.slopeDz[ti];
        check(rise > 0 && rise <= 1, `slope ${c},${r} rises ${rise.toFixed(2)} per tile`);
        check(level.linked(c, r, dx, dz) && level.linked(c, r, -dx, -dz), `slope ${c},${r} not connected at both ends`);
      }
    }
    const [pc, pr] = level.tileAt(level.playerStart.x, level.playerStart.z);
    const dist = level.flowField(pc, pr);
    let unreachable = 0;
    for (let k = 0; k < level.walk.length; k++) if (level.walk[k] === 1 && dist[k] < 0) unreachable++;
    check(unreachable === 0, `${unreachable} floor tiles unreachable from P`);
    for (const p of [...level.spawnPoints, level.bossStart]) check(level.reachable(dist, p), 'spawn reachable');
    console.log(`map ok: ${tag} ${level.cols}x${level.rowCount}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  checkMaps((m) => { failed++; console.error('FAIL:', m); });
  process.exit(failed ? 1 : 0);
}
