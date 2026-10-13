import * as THREE from 'three';
import * as D from './data.js';
import { Game } from './game.js';
import { SimWorld } from './simworld.js';
import { buildLevelMesh } from './levelMesh.js';
import { buildMeshLevel } from './meshLevel.js';
import { Effects } from './effects.js';
import { Sky } from './sky.js';
import { createBarrel } from './entities/barrel.js';
import { Bomb } from './entities/bomb.js';
import { Player } from './player.js';
import { randf, srgb } from './util.js';

const SUN_DIR_TO = new THREE.Vector3(0.439, 0.643, 0.627).normalize();
const SUN_COLOR = srgb([1.0, 0.92, 0.8]);

export class World extends SimWorld {
  constructor(renderer, maps, assets) {
    super(maps, assets);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(srgb([0.85, 0.78, 0.68]), 0.004);
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.02, 400);
    this.scene.add(this.camera);

    this.effects = new Effects(this.scene);
    this.sky = new Sky(SUN_DIR_TO, SUN_COLOR);
    this.scene.add(this.sky.mesh);
    this.levelRoot = new THREE.Group();
    this.scene.add(this.levelRoot);
    this.barrelRoot = new THREE.Group();
    this.scene.add(this.barrelRoot);
    this.scene.add(this.entityRoot);
    this.barrelNodes = new Map();
    this.casings = [];
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
    super.loadMap(index);
    for (const child of [...this.levelRoot.children]) {
      this.levelRoot.remove(child);
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
    this.levelRoot.add(this.level.kind === 'mesh' ? buildMeshLevel(this.level) : buildLevelMesh(this.level));
    this.scene.fog.density = this.level.maps[this.level.mapIndex].fog ?? 0.004;
    this.applySky();
  }

  applySky() {
    const [zenith, horizon] = this.level.sky;
    this.sky.setColors(zenith, horizon);
    this.hemi.color.copy(srgb([horizon[0] * 0.75 + zenith[0] * 0.25, horizon[1] * 0.75 + zenith[1] * 0.25, horizon[2] * 0.75 + zenith[2] * 0.25]));
  }

  placeSoldier(s, spot, yaw) {
    super.placeSoldier(s, spot, yaw);
    if (s === Game.me) this.player.place(spot, yaw);
  }

  resetBarrels() {
    super.resetBarrels();
    const level = this.level;
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
    super.removeBarrel(cell);
  }

  clearTemps() {
    super.clearTemps();
    for (const c of this.casings) this.entityRoot.remove(c.mesh);
    this.casings.length = 0;
    this.effects.clear();
    this.bombLight.intensity = 0;
  }

  spawnBomb(pos) {
    const b = new Bomb(pos, this.bombLight);
    this.entityRoot.add(b.object);
    this.bombs.push(b);
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

  preUpdate(dt) {
    this.player.update(dt);
  }

  postUpdate(dt) {
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      c.vel.y -= D.GRAVITY * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      const ground = this.level.heightAt(c.mesh.position.x, c.mesh.position.z, c.mesh.position.y);
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
