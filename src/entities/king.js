import * as THREE from 'three';
import * as D from '../data.js';
import { Game } from '../game.js';
import { Audio } from '../audio.js';
import { flatDist, randf, stdMat, TAU } from '../util.js';

const PLANE = new THREE.PlaneGeometry(1, 1);
const tmp = new THREE.Vector3();

export class King {
  constructor(texture) {
    this.isKing = true;
    this.texture = texture;
    this.mode = 0;
    this.timer = 0;
    this.move = new THREE.Vector3();
    this.flash = 0;
    this.summons = 0;
    this.grow = 0.2;
    this.dead = false;
    this.flip = 1;

    this.object = new THREE.Group();
    this.visual = new THREE.Group();
    this.object.add(this.visual);
    this.material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    this.sprite = new THREE.Mesh(PLANE, this.material);
    this.sprite.scale.set(D.BOSS_SIZE, D.BOSS_SIZE, 1);
    this.sprite.position.y = D.BOSS_SIZE / 2;
    this.sprite.castShadow = true;
    this.visual.add(this.sprite);

    const crown = new THREE.Group();
    crown.position.set(0, D.BOSS_SIZE * 0.97, 0.05);
    this.visual.add(crown);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffcc33, metalness: 0.9, roughness: 0.25, emissive: 0x805900 });
    const ruby = new THREE.MeshStandardMaterial({ color: 0xe60d1a, emissive: 0xcc0010, emissiveIntensity: 1.5 });
    const box = (parent, size, pos, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      m.position.set(...pos);
      parent.add(m);
      return m;
    };
    box(crown, [1.9, 0.5, 0.25], [0, 0, 0], gold);
    for (const k of [-1, 0, 1]) {
      const spike = box(crown, [0.45, 0.45, 0.2], [k * 0.65, 0.38, 0], gold);
      spike.rotation.z = Math.PI / 4;
      box(crown, [0.16, 0.16, 0.1], [k * 0.65, 0, 0.14], ruby);
    }
    const cape = box(this.visual, [D.BOSS_SIZE * 0.7, D.BOSS_SIZE * 0.55, 0.05], [0, D.BOSS_SIZE * 0.33, -0.25], ruby);
    cape.castShadow = true;
    this.visual.scale.setScalar(this.grow);
  }

  get position() {
    return this.object.position;
  }

  height() {
    return D.BOSS_SIZE * this.grow;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    const world = Game.world;
    world.removeKing(this);
    const p = this.position;
    world.burst({ x: p.x, y: p.y + 2, z: p.z }, [[1.0, 0.85, 0.2], [1, 1, 1], [0.95, 0.88, 0.75], [0.9, 0.1, 0.1]], 120, 9, 0.25, 1.4);
    world.explosionFx(p, 1.2);
    this.disposed = true;
  }

  mouth() {
    const p = this.position;
    return new THREE.Vector3(p.x, p.y + this.height() * 0.45, p.z);
  }

  update(dt, world) {
    if (this.dead) return;
    const t = Game.now();
    const level = world.level;
    const cam = world.camera;
    this.grow = Math.min(1, this.grow + dt * 0.8);
    this.flash = Math.max(0, this.flash - dt);
    this.material.color.set(this.flash > 0 ? 0xff6666 : 0xffffff);
    const pos = this.position;
    this.visual.rotation.y = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z);
    const pulse = 1 + (this.flash > 0 ? 0.06 * Math.sin(t * 40) : 0);
    this.visual.scale.setScalar(Math.max(0.15, this.grow * pulse));
    if (Game.bossHp <= 0 || !Game.active()) return;

    const me = Game.playerPos();
    const toX = me.x - pos.x;
    const toZ = me.z - pos.z;
    const dist = Math.max(0.1, Math.hypot(toX, toZ));
    const enraged = Game.bossHp <= D.BOSS_HP / 2;
    const eye = tmp.set(pos.x, pos.y + this.height() * 0.8, pos.z);
    const pe = Game.playerEye();
    const sees = dist < D.BOSS_SIGHT_RANGE && Game.hp > 0 && Game.clearLine(eye, pe) && !Game.smoked(eye, pe);
    let wobble = 0;
    if (this.grow >= 1) this.timer -= dt;
    if (this.mode === 0) {
      const walk = (enraged ? 95 : 70) * 0.03;
      const route = sees ? tmp.set(0, 0, 0) : level.steer(Game.bombPlanted ? Game.flow : Game.siteFlow, pos, tmp);
      if (route.lengthSq() !== 0) {
        this.move.copy(route).multiplyScalar(walk * 1.5);
      } else if (sees || Game.bombPlanted) {
        this.move.set(toX / dist * walk, 0, toZ / dist * walk);
      } else {
        this.move.set(0, 0, 0);
      }
      if (this.timer <= 0 && sees) {
        const roll = Math.random();
        const mouth = this.mouth();
        if (enraged && this.summons < 2 && roll < 0.25) {
          this.summons++;
          for (let i = 0; i < 3; i++) {
            world.spawnHamster(new THREE.Vector3(pos.x + randf(-2.5, 2.5), pos.y, pos.z + randf(-2.5, 2.5)), 150 * D.SPEED_SCALE, 3.5, 'normal');
          }
          world.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, [[0.95, 0.88, 0.75], [1.0, 0.7, 0.75]], 30, 6, 0.15);
          Game.say('Need backup!', 1.5);
          this.timer = 1.5;
        } else if (roll < 0.5) {
          this.mode = 1;
          this.timer = 0.7;
          Audio.playAt('boss_roar', 0.9, mouth);
          this.move.set(0, 0, 0);
        } else if (roll < 0.75) {
          const n = enraged ? 16 : 12;
          const off = Math.random() * TAU;
          const nutSpeed = (enraged ? 230 : 190) * D.NUT_SPEED_SCALE;
          for (let k = 0; k < n; k++) {
            const a = off + (k * TAU) / n;
            world.spawnNut(mouth, new THREE.Vector3(Math.cos(a), -0.02, Math.sin(a)), nutSpeed);
          }
          Game.say('Fire in the hole!', 1.2);
          Audio.play('fire_in_the_hole', 0.8);
          this.timer = enraged ? 1.6 : 2.2;
        } else {
          const aim = new THREE.Vector3(me.x, me.y + 1.2, me.z).sub(mouth);
          const offs = enraged ? [-0.3, -0.15, 0, 0.15, 0.3] : [-0.2, 0, 0.2];
          for (const o of offs) world.spawnNut(mouth, aim.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, o), 320 * D.NUT_SPEED_SCALE);
          Audio.playAt('spit', 0.8, mouth);
          this.timer = enraged ? 1.2 : 1.8;
        }
      }
    } else if (this.mode === 1) {
      wobble = Math.sin(t * 70) * 0.15;
      if (this.timer <= 0) {
        const charge = (enraged ? 620 : 520) * 0.03;
        this.move.set(toX / dist * charge, 0, toZ / dist * charge);
        this.mode = 2;
        this.timer = 0.75;
      }
    } else if (this.timer <= 0) {
      this.mode = 0;
      this.timer = enraged ? 1.4 : 2.0;
    }
    const col = world.collision;
    pos.y = col.support(pos.x, pos.z, D.BOSS_WALL_R + 0.1, pos.y, D.MAX_CLIMB);
    const hit = col.moveCircle(pos, this.move.x * dt, this.move.z * dt, D.BOSS_WALL_R, pos.y, D.MAX_CLIMB);
    pos.y = col.support(pos.x, pos.z, D.BOSS_WALL_R + 0.1, pos.y, D.MAX_CLIMB);
    if (hit && this.mode === 2) {
      Audio.playAt('metal', 0.9, { x: pos.x, y: pos.y + 1, z: pos.z });
      Game.shake = Math.max(Game.shake, 0.3);
      this.mode = 0;
      this.timer = 1.2;
      world.burst({ x: pos.x, y: pos.y + 1, z: pos.z }, [[1, 1, 1], [1.0, 0.8, 0.2]], 16, 5, 0.12);
    }
    this.sprite.position.x = wobble;
    this.sprite.rotation.z = Math.sin(t * 8) * 0.05;
    if (this.move.lengthSq() > 0.0025) {
      const right = Math.cos(this.visual.rotation.y);
      const rightZ = -Math.sin(this.visual.rotation.y);
      this.flip = (right * this.move.x + rightZ * this.move.z) > 0 ? -1 : 1;
    }
    this.sprite.scale.x = D.BOSS_SIZE * this.flip;
    if (flatDist(pos, me) < D.BOSS_R + D.PLAYER_R + 0.1 && Math.abs(me.y - pos.y) < this.height()) {
      Game.hurtPlayer(40, 'Hamster King');
    }
  }
}
