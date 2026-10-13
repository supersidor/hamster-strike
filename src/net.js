import * as THREE from 'three';
import * as D from './data.js';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { Soldier } from './soldier.js';
import { Avatar } from './entities/avatar.js';
import { r2 } from './protocol.js';

const DELAY = 100;
const STATE_MS = 33;
const PING_MS = 2000;
const NAME_KEY = 'hs_name';

const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

class Track {
  constructor(angles = []) {
    this.t = [];
    this.v = [];
    this.angles = angles;
  }

  push(t, values) {
    const last = this.v[this.v.length - 1];
    const v = values.slice();
    if (last) for (const i of this.angles) v[i] = last[i] + wrapAngle(v[i] - last[i]);
    this.t.push(t);
    this.v.push(v);
    if (this.t.length > 8) {
      this.t.shift();
      this.v.shift();
    }
  }

  sample(rt, out, vel) {
    const n = this.t.length;
    if (n === 0) return false;
    const dim = this.v[0].length;
    if (n === 1 || rt <= this.t[0]) {
      for (let i = 0; i < dim; i++) {
        out[i] = this.v[n === 1 ? 0 : 0][i];
        vel[i] = 0;
      }
      return true;
    }
    if (rt >= this.t[n - 1]) {
      for (let i = 0; i < dim; i++) {
        out[i] = this.v[n - 1][i];
        vel[i] = 0;
      }
      return true;
    }
    let b = n - 1;
    while (b > 1 && this.t[b - 1] > rt) b--;
    const a = b - 1;
    const span = this.t[b] - this.t[a] || 1;
    const k = (rt - this.t[a]) / span;
    for (let i = 0; i < dim; i++) {
      out[i] = this.v[a][i] + (this.v[b][i] - this.v[a][i]) * k;
      vel[i] = ((this.v[b][i] - this.v[a][i]) / span) * 1000;
    }
    return true;
  }
}

const OUT = [];
const VEL = [];

class NetClient {
  constructor() {
    this.state = 'offline';
    this.notice = '';
    this.ws = null;
    this.world = null;
    this.assets = null;
    this.params = new URLSearchParams();
    this.name = '';
    this.rtt = 0;
    this.lastState = 0;
    this.lastPing = 0;
    this.lastFrame = 0;
    this.remotes = new Map();
    this.spectateIdx = 0;
    this.watching = null;
  }

  init(world, assets, params) {
    this.world = world;
    this.assets = assets;
    this.params = params;
    try {
      this.name = params.get('name') || localStorage.getItem(NAME_KEY) || '';
    } catch {
      this.name = params.get('name') || '';
    }
  }

  get online() {
    return this.state === 'online';
  }

  url() {
    const override = this.params.get('server');
    const u = new URL(override || 'ws', location.href);
    u.protocol = u.protocol.replace('http', 'ws');
    return u.toString();
  }

  rename() {
    const typed = window.prompt('Your name (max 16 characters)', this.name || 'Petro');
    if (typed === null) return;
    this.name = typed.replace(/[<>&"'`]/g, '').trim().slice(0, 16);
    try {
      localStorage.setItem(NAME_KEY, this.name);
    } catch {
      this.name = this.name || 'Petro';
    }
  }

  onKey(code) {
    const idle = Game.phase === 'title' || Game.phase === 'match_end';
    if (code === 'KeyO' && this.state === 'offline' && Game.phase === 'title') {
      this.connect();
      return true;
    }
    if (code === 'KeyX' && this.state === 'online' && idle) {
      this.leave();
      return true;
    }
    if (code === 'KeyN' && this.state === 'offline' && Game.phase === 'title') {
      this.rename();
      return true;
    }
    return false;
  }

  connect() {
    if (this.ws) return;
    if (!this.name) this.name = 'Petro';
    this.notice = '';
    this.state = 'connecting';
    Game.setRole('client');
    Game.out = (m) => this.send(m);
    Game.toTitle();
    let ws;
    try {
      ws = new WebSocket(this.url());
    } catch {
      this.teardown('Could not reach the server');
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name: this.name }));
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.teardown(this.state === 'connecting' ? 'Could not reach the server' : 'Disconnected from the server');
    };
    ws.onerror = () => {};
  }

  leave() {
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close();
    this.teardown('');
  }

  teardown(notice) {
    this.ws = null;
    this.state = 'offline';
    this.notice = notice;
    for (const r of this.remotes.values()) this.dropAvatar(r);
    this.remotes.clear();
    this.watching = null;
    Game.soldiers = [Game.me];
    Game.out = null;
    Game.setRole('solo');
    this.world.clearTemps();
    Game.me.ready = false;
    Game.toTitle();
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  onMessage(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (m.t === 'welcome') {
      this.onWelcome(m);
      return;
    }
    if (this.state === 'connecting') {
      if ((m.e || []).some((e) => e.t === 'full')) this.notice = 'The server is full';
      return;
    }
    if (this.state !== 'online') return;
    for (const e of m.e || []) this.onEvent(e);
    if (m.s) this.onSnapshot(m.s);
  }

  onWelcome(m) {
    const world = this.world;
    const me = Game.me;
    this.state = 'online';
    me.id = m.id;
    me.name = m.you[18];
    if (world.level.mapIndex !== m.map) {
      world.clearTemps();
      world.loadMap(m.map);
    }
    Game.resetMatchStats();
    Game.resetRoundState();
    for (const cell of m.barrels) world.removeBarrel(cell);
    Game.result = m.result;
    Game.reason = m.reason;
    Game.targetSite = Game.level.bombSites.find((s) => s[0] === m.site) || Game.level.bombSites[0];
    for (const e of m.hs) this.spawnHamster(e, false);
    for (const e of m.ks) this.spawnKing(e);
    for (const s of m.smokes) world.spawnSmoke(v3(s.p)).life = s.life;
    if (m.bomb) this.plant(m.bomb);
    this.applyMine(m.you);
    me.hp = m.you[8];
    this.lastState = 0;
    this.lastPing = 0;
  }

  plant(e) {
    Game.bombPos = v3(e.p);
    Game.bombSite = e.site;
    Game.bombPlanted = true;
    this.world.spawnBomb(Game.bombPos);
  }

  spawnHamster(e, fx = true) {
    const world = this.world;
    const tex = this.assets.hamsterByName[e.tex] || world.nextHamsterTexture();
    const h = world.spawnHamster(v3(e.p), 1.0, 5.0, e.k, tex, e.id);
    h.object.position.set(e.p[0], e.p[1], e.p[2]);
    h.shield = e.sh;
    h.carrier = e.ca === 1;
    h.helmetHp = e.hm;
    if (h.helmet && e.hm <= 0) {
      h.visual.remove(h.helmet);
      h.helmet = null;
    }
    h.track = new Track();
    h.track.push(performance.now(), e.p);
    if (fx) world.burst({ x: e.p[0], y: e.p[1] + 0.6, z: e.p[2] }, [[0.95, 0.85, 0.7], [1.0, 0.7, 0.75]], 12, 3.0, 0.12);
    return h;
  }

  spawnKing(e) {
    const k = this.world.spawnKing(e.id);
    k.object.position.set(e.p[0], e.p[1], e.p[2]);
    k.grow = e.g;
    k.track = new Track();
    k.track.push(performance.now(), e.p);
    return k;
  }

  find(list, id) {
    return list.find((e) => e.id === id) || null;
  }

  onEvent(e) {
    const world = this.world;
    switch (e.t) {
      case 'pong':
        this.rtt = Math.max(0, performance.now() - e.ts);
        break;
      case 'place':
        Game.player.place({ x: e.p[0], y: e.p[1] - 0.05, z: e.p[2] }, e.yaw);
        break;
      case 'newmatch':
        Game.resetMatchStats();
        world.clearTemps();
        break;
      case 'map':
        world.clearTemps();
        world.loadMap(e.i);
        Game.resetRoundState();
        break;
      case 'freeze':
        Game.round = e.round;
        Game.resetRoundState();
        Game.phase = 'buy';
        Game.timer = D.FREEZE_TIME;
        Game.ensureAmmo(Game.secondary);
        Game.ensureAmmo(Game.primary);
        if (Game.primary !== '') Game.current = Game.primary;
        break;
      case 'live':
        Game.phase = 'live';
        Game.targetSite = Game.level.bombSites.find((s) => s[0] === e.site) || Game.targetSite;
        Game.bossMax = e.bossMax;
        for (const s of Game.soldiers) s.roundKills = 0;
        break;
      case 'rend':
        Game.phase = 'round_end';
        Game.result = e.result;
        Game.reason = e.reason;
        Game.ct = e.ct;
        Game.t = e.tt;
        break;
      case 'clear':
        world.clearTemps();
        break;
      case 'mend':
        Game.phase = 'match_end';
        break;
      case 'hs':
        this.spawnHamster(e);
        break;
      case 'hd': {
        const h = this.find(world.hamsters, e.id);
        if (!h) break;
        const pos = h.position.clone();
        const size = h.size;
        h.die(e.imp ? { x: e.imp[0], y: e.imp[1], z: e.imp[2] } : null);
        if (e.hs) world.floatText(pos.add({ x: 0, y: size + 0.3, z: 0 }), 'HEADSHOT', [1.0, 0.3, 0.3]);
        break;
      }
      case 'hh': {
        const h = this.find(world.hamsters, e.id);
        if (h) h.flash = 0.25;
        break;
      }
      case 'hm': {
        const h = this.find(world.hamsters, e.id);
        if (h && h.helmet) h.knockHelmet(e.d);
        break;
      }
      case 'ks':
        this.spawnKing(e);
        break;
      case 'kh': {
        const k = this.find(world.kings, e.id);
        if (k) k.flash = 0.15;
        break;
      }
      case 'kd': {
        const k = this.find(world.kings, e.id);
        if (!k) break;
        world.floatText({ x: k.position.x, y: k.position.y + 5.0, z: k.position.z }, 'THE KING IS DEAD', [1.0, 0.85, 0.2], 140);
        k.die();
        break;
      }
      case 'ns': {
        const vel = v3(e.v);
        world.spawnNut(v3(e.p), vel, vel.length(), 0, e.id);
        break;
      }
      case 'nx': {
        const n = this.find(world.nuts, e.id);
        if (n) n.dead = true;
        break;
      }
      case 'gs':
        world.spawnGrenade(v3(e.p), v3(e.v), e.sm === 1, null, e.id);
        break;
      case 'sm':
        world.spawnSmoke(v3(e.p));
        break;
      case 'bp':
        this.plant(e);
        break;
      case 'bx': {
        world.removeBarrel([e.c, e.r]);
        const pos = Game.level.tileCenter(e.c, e.r);
        world.decal({ x: pos.x, y: pos.y + 0.05, z: pos.z }, { x: 0, y: 1, z: 0 }, 3.2);
        break;
      }
      case 'ex':
        world.explosionFx(v3(e.p), e.b);
        break;
      case 'snd':
        if (e.p) Audio.playAt(e.n, e.v, { x: e.p[0], y: e.p[1], z: e.p[2] });
        else Audio.play(e.n, e.v, e.r || 1);
        break;
      case 'say':
        Game.say(e.text, e.sec);
        break;
      case 'feed':
        Game.feed(e.text);
        break;
      case 'shake':
        Game.shake = Math.max(Game.shake, e.v);
        break;
      case 'fb':
        Game.applyFeedback(e);
        break;
      case 'shot':
        this.remoteShot(e);
        break;
      default:
        break;
    }
  }

  remoteShot(e) {
    const s = this.remotes.get(e.id);
    if (!s) return;
    if (s.avatar) s.avatar.fire();
    const o = v3(e.o);
    const to = v3(e.e);
    const snd = D.WEAPON_SOUNDS[e.w];
    if (snd) Audio.playAt(snd[0], snd[1] * 0.8, o);
    const dir = to.clone().sub(o).normalize();
    const from = o.clone().addScaledVector(dir, 0.5);
    from.y -= 0.2;
    if (e.w === 'awp') this.world.tracer(from, to, [0.5, 1.0, 0.5], 0.35, 0.02);
    else this.world.tracer(from, to, [1.0, 0.85, 0.4], 0.05, 0.012);
  }

  applyMine(row) {
    const me = Game.me;
    me.hp = row[8];
    me.armor = Math.min(me.armor, row[9]);
    me.kills = row[11];
    me.deaths = row[12];
    me.headshots = row[13];
    me.mvps = row[14];
    me.defuse = row[15];
    me.ready = row[16] === 1;
    me.ping = row[17];
  }

  addRemote(row) {
    const s = new Soldier(row[0], row[18]);
    s.track = new Track([3]);
    s.position.set(row[1], row[2], row[3]);
    s.avatar = new Avatar(this.assets, row[18]);
    this.world.entityRoot.add(s.avatar.object);
    this.remotes.set(s.id, s);
    Game.soldiers.push(s);
    return s;
  }

  dropAvatar(s) {
    if (!s.avatar) return;
    this.world.entityRoot.remove(s.avatar.object);
    s.avatar.dispose();
    s.avatar = null;
  }

  removeRemote(id) {
    const s = this.remotes.get(id);
    if (!s) return;
    this.dropAvatar(s);
    this.remotes.delete(id);
    const i = Game.soldiers.indexOf(s);
    if (i >= 0) Game.soldiers.splice(i, 1);
  }

  onSnapshot(s) {
    const now = performance.now();
    Game.phase = s.ph;
    Game.timer = s.tm;
    Game.round = s.rd;
    Game.ct = s.ct;
    Game.t = s.tt;
    Game.bossHp = s.bh;
    Game.bossMax = s.bm;
    Game.bossAlive = s.ba === 1;
    Game.bombPlanted = s.bp === 1 && Game.bombPos !== null;
    Game.bombTimer = s.bt;
    const seen = new Set();
    for (const row of s.s) {
      if (row[0] === Game.me.id) {
        this.applyMine(row);
        continue;
      }
      seen.add(row[0]);
      const r = this.remotes.get(row[0]) || this.addRemote(row);
      r.hp = row[8];
      r.armor = row[9];
      r.kit = row[10] === 1;
      r.kills = row[11];
      r.deaths = row[12];
      r.headshots = row[13];
      r.mvps = row[14];
      r.ping = row[17];
      r.crouch = row[6] === 1;
      r.weapon = row[7];
      r.track.push(now, [row[1], row[2], row[3], row[4], row[5]]);
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.removeRemote(id);
    const world = this.world;
    for (const row of s.h) {
      const h = this.find(world.hamsters, row[0]);
      if (!h) continue;
      h.track.push(now, [row[1], row[2], row[3]]);
      h.carrier = (row[4] & 1) !== 0;
      if ((row[4] & 2) === 0) h.shield = 0;
      h.aim = row[5];
      if (row.length > 6) h.aimTarget.set(row[6], row[7], row[8]);
    }
    for (const row of s.k) {
      const k = this.find(world.kings, row[0]);
      if (!k) continue;
      k.track.push(now, [row[1], row[2], row[3]]);
      k.grow = row[4];
      k.mode = row[5];
    }
  }

  spectated() {
    const live = [...this.remotes.values()].filter((s) => s.hp > 0);
    if (live.length === 0) return null;
    return live[this.spectateIdx % live.length];
  }

  cycleSpectate() {
    this.spectateIdx++;
  }

  frame(now) {
    if (this.state !== 'online') return;
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    const rt = now - DELAY;
    const world = this.world;
    for (const h of world.hamsters) {
      if (!h.track || !h.track.sample(rt, OUT, VEL)) continue;
      h.object.position.set(OUT[0], OUT[1], OUT[2]);
      h.move.set(VEL[0], 0, VEL[2]);
    }
    for (const k of world.kings) {
      if (!k.track || !k.track.sample(rt, OUT, VEL)) continue;
      k.object.position.set(OUT[0], OUT[1], OUT[2]);
      k.move.set(VEL[0], 0, VEL[2]);
    }
    this.watching = Game.hp <= 0 && Game.playing() ? this.spectated() : null;
    for (const s of this.remotes.values()) {
      if (!s.track.sample(rt, OUT, VEL)) continue;
      s.position.set(OUT[0], OUT[1], OUT[2]);
      s.yaw = OUT[3];
      s.pitch = OUT[4];
      s.eyeHeight = s.crouch ? D.PLAYER_CROUCH_EYE : D.PLAYER_EYE;
      const a = s.avatar;
      if (!a) continue;
      a.pose(s.position, s.yaw, s.pitch, s.crouch, s.weapon);
      a.object.visible = s.hp > 0 && s !== this.watching && Game.phase !== 'title';
      a.update(dt, world.camera);
    }
    if (now - this.lastState >= STATE_MS) {
      this.lastState = now;
      const p = Game.player;
      this.send({
        t: 's',
        x: r2(p.position.x),
        y: r2(p.position.y),
        z: r2(p.position.z),
        yw: r2(p.yaw),
        pt: r2(p.pitch),
        cr: p.crouching ? 1 : 0,
        w: Game.current,
        df: Game.me.defusing ? 1 : 0,
        pg: Math.round(this.rtt),
      });
    }
    if (now - this.lastPing >= PING_MS) {
      this.lastPing = now;
      this.send({ t: 'ping', ts: now });
    }
  }
}

export const Net = new NetClient();
