export const r2 = (v) => Math.round(v * 100) / 100;
export const vec = (v) => [r2(v.x), r2(v.y), r2(v.z)];

export function hamsterSpawn(h) {
  return {
    t: 'hs', id: h.id, k: h.kind, tex: h.texture.name, p: vec(h.position), sh: r2(h.shield), hm: h.helmetHp, ca: h.carrier ? 1 : 0,
  };
}

export function kingSpawn(k) {
  return { t: 'ks', id: k.id, p: vec(k.position), g: r2(k.grow) };
}

export function soldierRow(s) {
  return [
    s.id, r2(s.position.x), r2(s.position.y), r2(s.position.z), r2(s.yaw), r2(s.pitch), s.crouch ? 1 : 0, s.weapon,
    s.hp, s.armor, s.kit ? 1 : 0, s.kills, s.deaths, s.headshots, s.mvps, r2(s.defuse), s.ready ? 1 : 0, s.ping, s.name, s.dog ? 1 : 0,
  ];
}

export function snapshot(game, world) {
  return {
    t: 'snap',
    ph: game.phase,
    tm: r2(game.timer),
    rd: game.round,
    ct: game.ct,
    tt: game.t,
    bh: r2(game.bossHp),
    bm: game.bossMax,
    ba: game.bossAlive ? 1 : 0,
    bp: game.bombPlanted ? 1 : 0,
    bt: r2(game.bombTimer),
    s: game.soldiers.map(soldierRow),
    h: world.hamsters.map((h) => {
      const row = [h.id, r2(h.position.x), r2(h.position.y), r2(h.position.z), (h.carrier ? 1 : 0) | (h.shield > 0 ? 2 : 0), r2(h.aim)];
      if (h.aim > 0) row.push(r2(h.aimTarget.x), r2(h.aimTarget.y), r2(h.aimTarget.z));
      return row;
    }),
    k: world.kings.map((k) => [k.id, r2(k.position.x), r2(k.position.y), r2(k.position.z), r2(k.grow), k.mode]),
  };
}
