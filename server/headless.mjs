import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const noop = new Proxy(function stub() {}, {
  get: () => noop,
  set: () => true,
  apply: () => noop,
});
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };

const { Game } = await import('../src/game.js');
const { Audio } = await import('../src/audio.js');
const { SimWorld } = await import('../src/simworld.js');
const { hamsterSpawn, kingSpawn, vec, r2 } = await import('../src/protocol.js');

export function loadMapTexts() {
  const dir = path.join(root, 'src/maps');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
}

function stubTexture(name, w, h, used) {
  const t = new THREE.Texture();
  t.name = name;
  t.image = { width: w, height: h };
  t.userData.used = used;
  return t;
}

export function loadHamsterPool() {
  const rects = JSON.parse(fs.readFileSync(path.join(root, 'public/hamsters/rects.json'), 'utf8'));
  const pool = Object.keys(rects).sort().map((name) => {
    const [w, h, x, y, rw, rh] = rects[name];
    return stubTexture(name, w, h, { x, y, w: rw, h: rh });
  });
  return { pool, king: stubTexture('king', 256, 256, null) };
}

export class ServerWorld extends SimWorld {
  constructor(mapTexts) {
    const { pool, king } = loadHamsterPool();
    super(mapTexts, { hamsterPool: pool, hamster: king });
    this.texturesByName = new Map(pool.map((t) => [t.name, t]));
    Game.attach(this);
  }

  placeSoldier(s, spot, yaw) {
    super.placeSoldier(s, spot, yaw);
    Game.emitTo(s, { t: 'place', p: vec(s.position), yaw: r2(yaw) });
  }

  removeHamster(h) {
    const i = this.hamsters.indexOf(h);
    if (i >= 0) this.hamsters.splice(i, 1);
    this.disposeEntity(h);
  }

  removeKing(k) {
    const i = this.kings.indexOf(k);
    if (i >= 0) this.kings.splice(i, 1);
    this.disposeEntity(k);
  }

  spawnHamster(...args) {
    const h = super.spawnHamster(...args);
    Game.emit(hamsterSpawn(h));
    return h;
  }

  spawnKing(...args) {
    const k = super.spawnKing(...args);
    Game.emit(kingSpawn(k));
    return k;
  }

  spawnBomb(pos) {
    Game.emit({ t: 'bp', p: vec(pos), site: Game.targetSite[0] });
  }

  spawnNut(pos, dir, speed, dmg, id) {
    const n = super.spawnNut(pos, dir, speed, dmg, id);
    Game.emit({ t: 'ns', id: n.id, p: vec(pos), v: vec(n.velocity) });
    return n;
  }

  spawnGrenade(pos, vel, smoke, owner, id) {
    const g = super.spawnGrenade(pos, vel, smoke, owner, id);
    Game.emit({ t: 'gs', id: g.id, p: vec(pos), v: vec(vel), sm: smoke ? 1 : 0, o: owner ? owner.id : 0 });
    return g;
  }

  spawnSmoke(pos) {
    const s = super.spawnSmoke(pos);
    Game.emit({ t: 'sm', p: vec(s.object.position) });
    return s;
  }

  explosionFx(pos, big = 1.0) {
    Game.emit({ t: 'ex', p: vec(pos), b: big });
  }
}

export function installAudio() {
  Audio.play = (name, vol = 0.6, rate = 1) => Game.emit(rate === 1 ? { t: 'snd', n: name, v: vol } : { t: 'snd', n: name, v: vol, r: rate });
  Audio.playAt = (name, vol, pos) => Game.emit({ t: 'snd', n: name, v: vol, p: vec(pos) });
}

export function createServerGame(sink) {
  installAudio();
  Game.setRole('server');
  Game.soldiers = [];
  Game.sink = sink;
  const world = new ServerWorld(loadMapTexts());
  return { Game, world };
}
