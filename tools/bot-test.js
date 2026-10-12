// Paste into the browser console on /?debug (or run through the Chrome tool). Plays whole matches with an aimbot and reports.
(async () => {
  const { Game, world, Input, THREE } = window.cs;
  const STEP = 1 / 120;
  const log = { errors: [], phases: new Set(), maxHamsters: 0, kinds: new Set(), bombPlanted: 0, defused: 0, kingSeen: false };
  const p = Game.player;
  const aimAt = (t) => {
    const eye = p.eyePosition();
    const d = t.clone().sub(eye);
    p.yaw = Math.atan2(-d.x, -d.z);
    p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  };
  const step = () => {
    log.phases.add(Game.phase);
    if (Game.phase === 'buy') {
      Game.tryBuy(['ak47', 'm4a4', 'awp', 'negev', 'nova', 'p90'][Game.round % 6]);
      Game.tryBuy('kevlar');
      Game.tryBuy('kit');
      Game.startLive();
    }
    if (Game.phase === 'match_end') return false;
    if (Game.hp > 0 && Game.hp < 50) Game.hp = 100;
    if (Game.phase === 'live') {
      log.maxHamsters = Math.max(log.maxHamsters, world.hamsters.length);
      for (const h of world.hamsters) log.kinds.add(h.kind);
      if (world.kings.length) log.kingSeen = true;
      const eye = p.eyePosition();
      let best = null;
      let bestD = 1e9;
      for (const e of [...world.hamsters, ...world.kings]) {
        if (e.shield > 0) continue;
        const t = e.position.clone();
        t.y += e.isKing ? 2 : e.size * 0.6;
        const d = t.distanceTo(eye);
        if (d < bestD && d < 40 && Game.collision.clear(eye, t)) { best = t; bestD = d; }
      }
      if (best) { aimAt(best); Input.mouse.add(0); } else Input.mouse.delete(0);
      if (Game.bombPlanted && (world.kings.length === 0 || Game.round <= 3 || window.botDefuseKing)) {
        p.position.set(Game.bombPos.x + 1, Game.bombPos.y, Game.bombPos.z);
        Input.keys.add('KeyE');
      }
      if (Game.bombPlanted && !log.planted) { log.planted = true; log.bombPlanted++; }
    } else {
      Input.mouse.delete(0);
      Input.keys.delete('KeyE');
      log.planted = false;
    }
    return true;
  };
  Game.newMatch();
  let t = 0;
  try {
    while (t < 900) {
      if (!step()) break;
      world.update(STEP);
      t += STEP;
    }
  } catch (e) {
    log.errors.push(String(e.stack || e));
  }
  Input.mouse.clear();
  Input.keys.clear();
  return JSON.stringify({ simSeconds: Math.round(t), phase: Game.phase, round: Game.round, ct: Game.ct, t: Game.t, kills: Game.kills, hs: Game.headshots, deaths: Game.deaths, phases: [...log.phases], maxHamsters: log.maxHamsters, kinds: [...log.kinds], kingSeen: log.kingSeen, bombPlanted: log.bombPlanted, errors: log.errors });
})();
