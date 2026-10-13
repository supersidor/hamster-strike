import * as THREE from 'three';
import * as D from './data.js';
import { Game } from './game.js';
import { Level } from './level.js';
import { Collision } from './collide.js';
import { Nut } from './entities/nut.js';
import { Grenade } from './entities/grenade.js';
import { Smoke } from './entities/smoke.js';
import { Hamster } from './entities/hamster.js';
import { King } from './entities/king.js';
import { shuffle, TAU } from './util.js';

export class SimWorld {
  constructor(mapTexts, assets) {
    this.assets = assets;
    this.level = new Level(mapTexts);
    this.collision = new Collision(this.level);
    this.entityRoot = new THREE.Group();
    this.hamsters = [];
    this.kings = [];
    this.nuts = [];
    this.grenades = [];
    this.smokes = [];
    this.bombs = [];
    this.corpses = [];
    this.hamsterDeck = [];
    this.nextId = 1;
    this.player = null;
  }

  loadMap(index) {
    this.level.loadMap(index);
    this.collision.rebuild();
  }

  resetBarrels() {
    this.level.resetBarrelGrid();
  }

  removeBarrel(cell) {
    this.level.clearCell(cell[0], cell[1]);
  }

  startYaw() {
    const level = this.level;
    let mx = 0;
    let mz = 0;
    for (const p of level.spawnPoints) {
      mx += p.x;
      mz += p.z;
    }
    const n = Math.max(1, level.spawnPoints.length);
    const dx = mx / n - level.playerStart.x;
    const dz = mz / n - level.playerStart.z;
    return Math.atan2(-dx, -dz);
  }

  spawnSpots(count) {
    const level = this.level;
    const start = level.playerStart;
    const out = [start];
    for (let ring = 1; out.length < count && ring < 8; ring++) {
      const radius = ring * 1.1;
      const steps = ring * 6;
      for (let k = 0; k < steps && out.length < count; k++) {
        const a = (k / steps) * TAU;
        const x = start.x + Math.cos(a) * radius;
        const z = start.z + Math.sin(a) * radius;
        const y = level.heightAt(x, z);
        if (Math.abs(y - start.y) > 0.4 || this.collision.blockedAt(x, z, D.PLAYER_R + 0.1, y, 0.3)) continue;
        out.push(new THREE.Vector3(x, y, z));
      }
    }
    while (out.length < count) out.push(start);
    return out;
  }

  placeSoldiers() {
    const yaw = this.startYaw();
    const spots = this.spawnSpots(Game.soldiers.length);
    Game.soldiers.forEach((s, i) => this.placeSoldier(s, spots[i], yaw));
  }

  placeSoldier(s, spot, yaw) {
    s.position.set(spot.x, spot.y + 0.05, spot.z);
    s.yaw = yaw;
    s.pitch = 0;
  }

  clearTemps() {
    for (const list of [this.hamsters, this.kings, this.nuts, this.grenades, this.smokes, this.bombs, this.corpses]) {
      for (const e of list) this.disposeEntity(e);
      list.length = 0;
    }
  }

  disposeEntity(e) {
    if (e.object) this.entityRoot.remove(e.object);
    if (e.dispose) e.dispose();
  }

  removeHamster(h) {
    const i = this.hamsters.indexOf(h);
    if (i >= 0) this.hamsters.splice(i, 1);
    this.corpses.push(h);
  }

  removeKing(k) {
    const i = this.kings.indexOf(k);
    if (i >= 0) this.kings.splice(i, 1);
    this.corpses.push(k);
  }

  nextHamsterTexture() {
    const pool = this.assets.hamsterPool;
    if (pool.length === 0) return this.assets.hamster;
    if (this.hamsterDeck.length === 0) this.hamsterDeck = shuffle([...pool]);
    return this.hamsterDeck.pop();
  }

  spawnHamster(pos, speed, spitEvery, kind = 'normal', texture = null, id = 0) {
    const h = new Hamster(speed, spitEvery, kind, texture || this.nextHamsterTexture());
    h.id = id || this.nextId++;
    h.object.position.copy(this.level.ground(pos));
    this.entityRoot.add(h.object);
    this.hamsters.push(h);
    return h;
  }

  spawnKing(id = 0) {
    const k = new King(this.assets.hamster);
    k.id = id || this.nextId++;
    k.object.position.copy(this.level.bossStart);
    this.entityRoot.add(k.object);
    this.kings.push(k);
    return k;
  }

  spawnBomb() {}

  spawnNut(pos, dir, speed, dmg = 20, id = 0) {
    const n = new Nut(pos, dir, speed, dmg);
    n.id = id || this.nextId++;
    this.entityRoot.add(n.object);
    this.nuts.push(n);
    return n;
  }

  spawnGrenade(pos, vel, smoke, owner = Game.me, id = 0) {
    const g = new Grenade(pos, vel, smoke, owner);
    g.id = id || this.nextId++;
    this.entityRoot.add(g.object);
    this.grenades.push(g);
    return g;
  }

  spawnSmoke(pos) {
    const s = new Smoke(this.level.ground(pos));
    this.entityRoot.add(s.object);
    this.smokes.push(s);
    return s;
  }

  burst() {}

  explosionFx() {}

  floatText() {}

  decal() {}

  impact() {}

  tracer() {}

  preUpdate() {}

  postUpdate() {}

  update(dt) {
    this.preUpdate(dt);
    Game.update(dt);
    for (const h of [...this.hamsters]) h.update(dt, this);
    for (const k of [...this.kings]) k.update(dt, this);
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const e = this.corpses[i];
      e.update(dt, this);
      if (e.disposed) {
        this.disposeEntity(e);
        this.corpses.splice(i, 1);
      }
    }
    this.tick(this.nuts, dt);
    this.tick(this.grenades, dt);
    this.tick(this.smokes, dt);
    for (const b of this.bombs) b.update(dt);
    this.postUpdate(dt);
  }

  tick(list, dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.update(dt, this);
      if (e.dead) {
        this.disposeEntity(e);
        list.splice(i, 1);
      }
    }
  }
}
