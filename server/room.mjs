import * as THREE from 'three';
import * as D from '../src/data.js';
import { createServerGame } from './headless.mjs';
import { hamsterSpawn, kingSpawn, snapshot, soldierRow, vec } from '../src/protocol.js';

const STEP = 1 / 120;
const SNAP_MS = 50;
const MAX_NAME = 16;
const HIT_BUDGET = 60;
const NADE_COOLDOWN = D.NADE_COOLDOWN * 0.8;
const MSG_RATE = 200;
const MSG_BURST = 400;

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const vec3 = (a) => Array.isArray(a) && a.length === 3 && a.every(finite);

export function cleanName(raw, fallback) {
  const name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>&"'`]/g, '').trim().slice(0, MAX_NAME) : '';
  return name || fallback;
}

export class Room {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.clients = new Set();
    this.queue = [];
    const sink = {
      all: (msg) => this.queue.push({ msg }),
      to: (s, msg) => {
        if (s.client) this.queue.push({ msg, to: s.client });
      },
    };
    const { Game, world } = createServerGame(sink);
    this.Game = Game;
    this.world = world;
    this.last = now();
    this.acc = 0;
    this.lastSnap = 0;
    this.timer = null;
  }

  start(interval = 16) {
    this.last = this.now();
    this.timer = setInterval(() => this.tick(), interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    const now = this.now();
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.step();
      this.acc -= STEP;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    this.flush(now);
  }

  step() {
    if (this.clients.size === 0) return;
    this.world.update(STEP);
  }

  flush(now) {
    const wantSnap = this.clients.size > 0 && now - this.lastSnap >= SNAP_MS;
    const snapStr = wantSnap ? JSON.stringify(snapshot(this.Game, this.world)) : null;
    if (wantSnap) this.lastSnap = now;
    const events = this.queue;
    this.queue = [];
    for (const client of this.clients) {
      const own = events.filter((e) => (!e.to || e.to === client) && e.except !== client).map((e) => JSON.stringify(e.msg));
      if (own.length === 0 && !snapStr) continue;
      if (!client.soldier) continue;
      if (client.ws.bufferedAmount > 1_000_000 && own.length === 0) continue;
      const text = snapStr ? `{"e":[${own.join(',')}],"s":${snapStr}}` : `{"e":[${own.join(',')}]}`;
      client.send(text);
    }
  }

  join(client, name) {
    if (this.clients.size >= D.MAX_PLAYERS) return false;
    const Game = this.Game;
    const world = this.world;
    const wasEmpty = this.clients.size === 0;
    this.clients.add(client);
    const taken = new Set([...this.clients].filter((c) => c.soldier).map((c) => c.soldier.name));
    let unique = cleanName(name, 'Petro');
    for (let n = 2; taken.has(unique); n++) unique = `${cleanName(name, 'Petro').slice(0, MAX_NAME - 3)} ${n}`;
    const s = Game.addSoldier(unique);
    s.client = client;
    client.soldier = s;
    client.budget = HIT_BUDGET;
    client.nadeCd = 0;
    if (wasEmpty) Game.toTitle();
    const live = Game.phase === 'live' || Game.phase === 'round_end';
    const mate = live ? Game.soldiers.find((o) => o !== s && o.hp > 0) : null;
    if (mate) {
      const spots = world.spawnSpots(2, mate.position);
      world.placeSoldier(s, spots[1], mate.yaw);
    } else {
      const spots = world.spawnSpots(Game.soldiers.length);
      world.placeSoldier(s, spots[spots.length - 1], world.startYaw());
    }
    client.send(JSON.stringify(this.welcome(s)));
    return true;
  }

  welcome(s) {
    const { Game, world } = this;
    const level = world.level;
    return {
      t: 'welcome',
      id: s.id,
      map: level.mapIndex,
      barrels: level.barrels.filter(([c, r]) => level.grid[r][c] !== 'o'),
      hs: world.hamsters.map(hamsterSpawn),
      ks: world.kings.map(kingSpawn),
      smokes: world.smokes.map((sm) => ({ p: vec(sm.object.position), life: Math.round(sm.life * 100) / 100 })),
      bomb: Game.bombPlanted ? { p: vec(Game.bombPos), site: Game.bombSite } : null,
      site: Game.targetSite[0],
      result: Game.result,
      reason: Game.reason,
      you: soldierRow(s),
    };
  }

  leave(client) {
    if (!this.clients.delete(client)) return;
    const s = client.soldier;
    client.soldier = null;
    if (!s) return;
    s.client = null;
    this.Game.removeSoldier(s);
    if (this.clients.size === 0) {
      this.Game.toTitle();
      this.queue = [];
    }
  }

  message(client, text) {
    const s = client.soldier;
    if (!s) return;
    const t = this.now();
    client.msgTokens = Math.min(MSG_BURST, (client.msgTokens ?? MSG_BURST) + ((t - (client.msgAt ?? t)) / 1000) * MSG_RATE);
    client.msgAt = t;
    if (client.msgTokens < 1) return;
    client.msgTokens -= 1;
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 's': this.onState(client, s, m); break;
      case 'hit': this.onHit(client, s, m); break;
      case 'ignite': this.onIgnite(s, m); break;
      case 'shot': this.onShot(client, s, m); break;
      case 'nade': this.onNade(client, s, m); break;
      case 'map':
      case 'start':
      case 'ready':
      case 'buy':
        this.Game.command(s, m);
        break;
      case 'ping':
        if (finite(m.ts)) client.send(JSON.stringify({ e: [{ t: 'pong', ts: m.ts }] }));
        break;
      default:
        break;
    }
  }

  onState(client, s, m) {
    const level = this.world.level;
    if (![m.x, m.y, m.z, m.yw, m.pt].every(finite)) return;
    const limit = Math.max(level.width, level.depth);
    if (Math.abs(m.x) > limit || Math.abs(m.z) > limit || m.y < -40 || m.y > 60) return;
    s.position.set(m.x, m.y, m.z);
    s.yaw = m.yw;
    s.pitch = Math.max(-1.6, Math.min(1.6, m.pt));
    s.crouch = m.cr === 1;
    s.eyeHeight = s.crouch ? D.PLAYER_CROUCH_EYE : D.PLAYER_EYE;
    if (typeof m.w === 'string' && D.WEAPONS[m.w]) s.weapon = m.w;
    s.defusing = m.df === 1;
    s.dog = m.dg === 1;
    if (finite(m.pg)) s.ping = Math.max(0, Math.min(999, Math.round(m.pg)));
  }

  spend(client) {
    const t = this.now();
    if (!client.budgetAt) client.budgetAt = t;
    client.budget = Math.min(HIT_BUDGET, client.budget + ((t - client.budgetAt) / 1000) * HIT_BUDGET);
    client.budgetAt = t;
    if (client.budget < 1) return false;
    client.budget -= 1;
    return true;
  }

  onHit(client, s, m) {
    const { Game, world } = this;
    if (Game.phase !== 'live' || s.hp <= 0 || !this.spend(client)) return;
    const spec = D.WEAPONS[m.w];
    if (!spec || !Number.isInteger(m.id)) return;
    const reach = spec.range + 8;
    if (m.k === 1) {
      const king = world.kings.find((k) => k.id === m.id);
      if (!king || Math.hypot(king.position.x - s.position.x, king.position.z - s.position.z) > reach) return;
      Game.hitKing(king, spec.dmg, spec.name, m.hs === 1, s);
      return;
    }
    const h = world.hamsters.find((x) => x.id === m.id);
    if (!h || h.dead || h.shield > 0 || Math.hypot(h.position.x - s.position.x, h.position.z - s.position.z) > reach) return;
    const dir = vec3(m.d) ? m.d : [0, 0, 0];
    const k = spec.pierce ? 12 : 4;
    Game.damageHamster(h, spec.dmg, spec.name, m.hs === 1, { x: dir[0] * k, y: dir[1] * k, z: dir[2] * k }, s);
  }

  onIgnite(s, m) {
    const { Game, world } = this;
    if (Game.phase !== 'live' || s.hp <= 0 || !Number.isInteger(m.c) || !Number.isInteger(m.r)) return;
    const level = world.level;
    if (!level.inside(m.c, m.r)) return;
    const pos = level.tileCenter(m.c, m.r);
    if (Math.hypot(pos.x - s.position.x, pos.z - s.position.z) > 160) return;
    Game.ignite([m.c, m.r], 0, s);
  }

  onShot(client, s, m) {
    if (s.hp <= 0 || !D.WEAPONS[m.w] || !vec3(m.o) || !vec3(m.e)) return;
    this.queue.push({ msg: { t: 'shot', id: s.id, w: m.w, o: m.o, e: m.e }, except: client });
  }

  onNade(client, s, m) {
    const { Game, world } = this;
    const now = this.now();
    if (Game.phase !== 'live' || s.hp <= 0 || !vec3(m.p) || !vec3(m.v)) return;
    if (client.nadeAt && now - client.nadeAt < NADE_COOLDOWN * 1000) return;
    const speed = Math.hypot(m.v[0], m.v[1], m.v[2]);
    const eye = s.eyePosition();
    if (speed > 40 || Math.hypot(m.p[0] - eye.x, m.p[1] - eye.y, m.p[2] - eye.z) > 4) return;
    client.nadeAt = now;
    world.spawnGrenade(new THREE.Vector3(...m.p), new THREE.Vector3(...m.v), m.sm === 1, s);
  }
}
