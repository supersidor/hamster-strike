import * as THREE from 'three';
import * as D from './data.js';
import { Game } from './game.js';
import { Level } from './level.js';
import { Collision } from './collide.js';
import { buildLevelMesh } from './levelMesh.js';
import { Effects } from './effects.js';
import { Sky } from './sky.js';
import { createBarrel } from './entities/barrel.js';
import { Nut } from './entities/nut.js';
import { Grenade } from './entities/grenade.js';
import { Smoke } from './entities/smoke.js';
import { Bomb } from './entities/bomb.js';
import { Hamster } from './entities/hamster.js';
import { King } from './entities/king.js';
import { Player } from './player.js';
import { randf, shuffle, srgb } from './util.js';

const SUN_DIR_TO = new THREE.Vector3(0.439, 0.643, 0.627).normalize();
const SUN_COLOR = srgb([1.0, 0.92, 0.8]);

export class World {
  constructor(renderer, mapTexts, assets) {
    this.renderer = renderer;
    this.assets = assets;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(srgb([0.85, 0.78, 0.68]), 0.004);
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.02, 400);
    this.scene.add(this.camera);

    this.level = new Level(mapTexts);
    this.collision = new Collision(this.level);
    this.effects = new Effects(this.scene);
    this.sky = new Sky(SUN_DIR_TO, SUN_COLOR);
    this.scene.add(this.sky.mesh);
    this.levelRoot = new THREE.Group();
    this.scene.add(this.levelRoot);
    this.barrelRoot = new THREE.Group();
    this.scene.add(this.barrelRoot);
    this.entityRoot = new THREE.Group();
    this.scene.add(this.entityRoot);
    this.barrelNodes = new Map();

    this.hamsters = [];
    this.kings = [];
    this.nuts = [];
    this.grenades = [];
    this.smokes = [];
    this.bombs = [];
    this.corpses = [];
    this.casings = [];
    this.hamsterDeck = [];
    this.lights();

    this.player = new Player(this);
    Game.attach(this);
  }

  lights() {
    const sun = new THREE.DirectionalLight(srgb([1.0, 0.92, 0.8]), 1.15 * Math.PI);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = -45;
    cam.right = 45;
    cam.top = 45;
    cam.bottom = -45;
    cam.near = 1;
    cam.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(srgb([0.6, 0.72, 1.0]), 0.35 * Math.PI);
    fill.position.set(-0.47, 0.574, -0.671).multiplyScalar(50);
    this.scene.add(fill);
    this.hemi = new THREE.HemisphereLight(srgb([0.62, 0.7, 0.85]), srgb([0.55, 0.5, 0.44]), 0.62 * Math.PI);
    this.scene.add(this.hemi);
    this.bombLight = new THREE.PointLight(0xff1a1a, 0, 4, 2);
    this.scene.add(this.bombLight);
  }

  loadMap(index) {
    const level = this.level;
    level.loadMap(index);
    for (const child of [...this.levelRoot.children]) {
      this.levelRoot.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.levelRoot.add(buildLevelMesh(level));
    this.collision.rebuild();
    this.applySky();
  }

  applySky() {
    const [zenith, horizon] = this.level.sky;
    this.sky.setColors(zenith, horizon);
    this.hemi.color.copy(srgb([horizon[0] * 0.75 + zenith[0] * 0.25, horizon[1] * 0.75 + zenith[1] * 0.25, horizon[2] * 0.75 + zenith[2] * 0.25]));
  }

  placePlayer() {
    this.player.place(this.level.playerStart, this.startYaw());
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

  resetBarrels() {
    const level = this.level;
    level.resetBarrelGrid();
    for (const node of this.barrelNodes.values()) this.barrelRoot.remove(node);
    this.barrelNodes.clear();
    for (const cell of level.barrels) {
      const node = createBarrel(cell, level.tileCenter(cell[0], cell[1]));
      this.barrelRoot.add(node);
      this.barrelNodes.set(cell[1] * level.cols + cell[0], node);
    }
  }

  removeBarrel(cell) {
    const key = cell[1] * this.level.cols + cell[0];
    const node = this.barrelNodes.get(key);
    if (node) this.barrelRoot.remove(node);
    this.barrelNodes.delete(key);
    this.level.clearCell(cell[0], cell[1]);
  }

  clearTemps() {
    for (const list of [this.hamsters, this.kings, this.nuts, this.grenades, this.smokes, this.bombs, this.corpses]) {
      for (const e of list) this.disposeEntity(e);
      list.length = 0;
    }
    for (const c of this.casings) this.entityRoot.remove(c.mesh);
    this.casings.length = 0;
    this.effects.clear();
    this.bombLight.intensity = 0;
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

  spawnHamster(pos, speed, spitEvery, kind = 'normal') {
    const h = new Hamster(speed, spitEvery, kind, this.nextHamsterTexture());
    const g = this.level.ground(pos);
    h.object.position.copy(g);
    this.entityRoot.add(h.object);
    this.hamsters.push(h);
    return h;
  }

  spawnKing() {
    const k = new King(this.assets.hamster);
    k.object.position.copy(this.level.bossStart);
    this.entityRoot.add(k.object);
    this.kings.push(k);
    return k;
  }

  spawnBomb(pos) {
    const b = new Bomb(pos, this.bombLight);
    this.entityRoot.add(b.object);
    this.bombs.push(b);
  }

  spawnNut(pos, dir, speed, dmg = 20) {
    const n = new Nut(pos, dir, speed, dmg);
    this.entityRoot.add(n.object);
    this.nuts.push(n);
  }

  spawnGrenade(pos, vel, smoke) {
    const g = new Grenade(pos, vel, smoke);
    this.entityRoot.add(g.object);
    this.grenades.push(g);
  }

  spawnSmoke(pos) {
    const s = new Smoke(this.level.ground(pos));
    this.entityRoot.add(s.object);
    this.smokes.push(s);
  }

  spawnCasing(pos, vel, shell) {
    if (!this.casingMats) {
      this.casingMats = {
        brass: new THREE.MeshStandardMaterial({ color: srgb([0.85, 0.65, 0.25]), metalness: 0.8, roughness: 0.3 }),
        shell: new THREE.MeshStandardMaterial({ color: srgb([0.8, 0.15, 0.12]), roughness: 0.6 }),
        brassGeo: new THREE.BoxGeometry(0.02, 0.02, 0.05),
        shellGeo: new THREE.BoxGeometry(0.03, 0.03, 0.09),
      };
    }
    const m = this.casingMats;
    const mesh = new THREE.Mesh(shell ? m.shellGeo : m.brassGeo, shell ? m.shell : m.brass);
    mesh.position.copy(pos);
    this.entityRoot.add(mesh);
    this.casings.push({ mesh, vel: vel.clone(), spin: new THREE.Vector3(randf(-20, 20), randf(-20, 20), randf(-20, 20)), life: 3.0 });
    if (this.casings.length > 40) this.entityRoot.remove(this.casings.shift().mesh);
  }

  burst(...args) {
    this.effects.burst(...args);
  }

  explosionFx(pos, big = 1.0) {
    this.effects.explosion(pos, big);
    Game.shake = Math.max(Game.shake, 0.35 * big);
  }

  floatText(...args) {
    this.effects.floatText(...args);
  }

  decal(...args) {
    this.effects.decal(...args);
  }

  impact(...args) {
    this.effects.impact(...args);
  }

  tracer(...args) {
    this.effects.tracer(...args);
  }

  update(dt) {
    this.player.update(dt);
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
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.vel.y -= D.GRAVITY * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      const ground = this.level.heightAt(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y < ground + 0.01) {
        c.mesh.position.y = ground + 0.01;
        c.vel.y = Math.abs(c.vel.y) * 0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.5);
      }
      if (c.life <= 0) {
        this.entityRoot.remove(c.mesh);
        this.casings.splice(i, 1);
      }
    }
    this.effects.update(dt);
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

  frame(time) {
    this.sky.update(this.camera, time);
    const p = this.player.position;
    const snap = 1;
    const cx = Math.round(p.x / snap) * snap;
    const cz = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + SUN_DIR_TO.x * 80, SUN_DIR_TO.y * 80, cz + SUN_DIR_TO.z * 80);
    this.sun.target.updateMatrixWorld();
  }
}
