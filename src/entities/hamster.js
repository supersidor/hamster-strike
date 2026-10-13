import * as THREE from 'three';
import * as D from '../data.js';
import { Game } from '../game.js';
import { Audio } from '../audio.js';
import { clamp, flatDist, randf, randi, srgb, stdMat, TAU } from '../util.js';

const RED = stdMat([0.85, 0.1, 0.12]);
const HELMET_MAT = stdMat([0.36, 0.42, 0.3], { metalness: 0.6, roughness: 0.35 });
const PACK_MAT = stdMat([0.4, 0.28, 0.16]);
const LED_MAT = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff1a1a, emissiveIntensity: 4 });
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
const LASER_MAT = new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.7, toneMapped: false });
const PLANE = new THREE.PlaneGeometry(1, 1);
const SHADOW_GEO = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
const LED_GEO = new THREE.SphereGeometry(0.04, 8, 6);
const LASER_GEO = new THREE.BoxGeometry(0.025, 0.025, 1);
const tmpDir = new THREE.Vector3();
const tmpSteer = new THREE.Vector3();
const tmpMouth = new THREE.Vector3();

export class Hamster {
  constructor(speed, spitTime, kind, texture) {
    const spec = D.HAMSTER_KINDS[kind];
    this.isHamster = true;
    this.id = 0;
    this.kind = kind;
    this.texture = texture;
    this.speed = speed * spec.speed;
    this.spitEvery = spitTime;
    this.size = spec.size;
    this.radius = spec.r;
    this.hp = spec.hp;
    this.tint = spec.tint;
    this.contact = spec.contact;
    this.label = spec.label;
    this.helmetHp = kind === 'tank' ? D.HELMET_HP : 0;
    this.timer = randf(0.2, 1.0);
    this.spit = randf(1.5, Math.max(1.6, spitTime));
    this.phase = Math.random() * TAU;
    this.shield = D.SPAWN_SHIELD;
    this.flash = 0;
    this.dead = false;
    this.nav = false;
    this.carrier = false;
    this.move = new THREE.Vector3();
    this.helmet = null;
    this.clanked = false;
    this.aim = 0;
    this.aimCd = 0;
    this.fling = new THREE.Vector3();
    this.corpseT = 0;
    this.spin = 0;
    this.flip = 1;
    this.aimTarget = new THREE.Vector3();
    this.build();
  }

  get position() {
    return this.object.position;
  }

  build() {
    const tex = this.texture;
    const used = tex.userData.used || { x: 0, y: 0, w: tex.image.width, h: tex.image.height };
    const W = tex.image.width;
    const H = tex.image.height;
    let px = this.size / Math.max(1, used.h);
    if (used.w * px > this.size * 1.7) {
      px = (this.size * 1.7) / used.w;
      this.size = used.h * px;
    }
    this.radius = clamp(used.w * px * 0.4, this.radius, 0.8);
    this.route = randi(0, Game.level.routeFlows.length);

    this.object = new THREE.Group();
    this.visual = new THREE.Group();
    this.object.add(this.visual);

    this.cutMat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    this.blendMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, depthWrite: false });
    this.sprite = new THREE.Mesh(PLANE, this.cutMat);
    this.sprite.scale.set(W * px, H * px, 1);
    this.baseScale = new THREE.Vector2(W * px, H * px);
    this.sprite.position.y = (used.y + used.h - H / 2) * px;
    this.sprite.castShadow = true;
    this.visual.add(this.sprite);

    const size = this.size;
    const band = new THREE.Mesh(new THREE.BoxGeometry(size * 0.55, size * 0.08, 0.04), RED);
    band.position.set(0, size * 0.78, 0.03);
    this.visual.add(band);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(size * 0.16, size * 0.06, 0.04), RED);
    knot.position.set(size * 0.32, size * 0.74, 0.03);
    knot.rotation.z = -0.6;
    this.visual.add(knot);

    if (this.helmetHp > 0) {
      this.helmet = new THREE.Mesh(new THREE.SphereGeometry(size * 0.3, 14, 6, 0, TAU, 0, Math.PI / 2), HELMET_MAT);
      this.helmet.scale.y = 0.5;
      this.helmet.position.set(0, size * 0.8, 0.02);
      this.helmet.castShadow = true;
      this.visual.add(this.helmet);
    }
    if (this.kind === 'sniper') {
      this.laser = new THREE.Mesh(LASER_GEO, LASER_MAT);
      this.laser.visible = false;
      this.object.add(this.laser);
    }
    this.pack = new THREE.Group();
    const brick = new THREE.Mesh(new THREE.BoxGeometry(size * 0.34, size * 0.22, 0.12), PACK_MAT);
    const led = new THREE.Mesh(LED_GEO, LED_MAT);
    led.position.set(size * 0.1, size * 0.06, 0.07);
    this.pack.add(brick, led);
    this.pack.position.set(-size * 0.25, size * 0.35, 0.08);
    this.pack.visible = false;
    this.visual.add(this.pack);

    const shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    shadow.scale.setScalar(this.radius * 1.1);
    shadow.position.y = 0.03;
    this.object.add(shadow);
    this.setTint(this.tint);
  }

  setTint(rgb, alpha) {
    this.cutMat.color.copy(srgb(rgb));
    this.blendMat.color.copy(srgb(rgb));
    if (alpha !== undefined) this.blendMat.opacity = alpha;
  }

  useBlend(on) {
    const mat = on ? this.blendMat : this.cutMat;
    if (this.sprite.material !== mat) this.sprite.material = mat;
  }

  die(impulse) {
    if (this.dead) return;
    this.dead = true;
    impulse = impulse || { x: 0, y: 0, z: 0 };
    const len = Math.hypot(impulse.x, impulse.y, impulse.z);
    this.pack.visible = false;
    if (this.laser) this.laser.visible = false;
    this.fling.set(impulse.x, impulse.y + 2.5 + len * 0.35, impulse.z);
    this.spin = (4.0 + len) * (Math.random() < 0.5 ? 1 : -1);
    this.corpseT = D.CORPSE_TIME;
    this.useBlend(true);
    this.setTint([1.0, 0.5, 0.5], 1);
    Game.world.removeHamster(this);
  }

  knockHelmet(dmg) {
    this.helmetHp -= dmg;
    if (Game.visual) {
      Audio.playAt('metal', 0.7, this.position);
      if (!this.clanked) {
        this.clanked = true;
        Game.world.floatText({ x: this.position.x, y: this.position.y + this.size + 0.3, z: this.position.z }, 'CLANG', [0.8, 0.85, 0.9], 80);
      }
    }
    if (this.helmetHp > 0) return;
    const at = new THREE.Vector3();
    this.helmet.getWorldPosition(at);
    this.visual.remove(this.helmet);
    this.helmet = null;
    if (Game.visual) Game.world.burst(at, [[0.36, 0.42, 0.3], [0.7, 0.7, 0.7]], 10, 4.0, 0.08, 0.6);
  }

  dispose() {
    this.cutMat.dispose();
    this.blendMat.dispose();
  }

  corpse(dt, world) {
    this.corpseT -= dt;
    const f = this.fling;
    f.y -= D.GRAVITY * dt;
    const p = this.position;
    const nx = p.x + f.x * dt;
    const nz = p.z + f.z * dt;
    if (world.collision.blockedAt(nx, p.z, 0.2, p.y, 0.3)) f.x *= -0.45;
    else p.x = nx;
    if (world.collision.blockedAt(p.x, nz, 0.2, p.y, 0.3)) f.z *= -0.45;
    else p.z = nz;
    p.y += f.y * dt;
    const ground = world.level.heightAt(p.x, p.z, p.y);
    if (p.y < ground) {
      p.y = ground;
      f.y = Math.abs(f.y) * 0.45;
      f.x *= 0.7;
      f.z *= 0.7;
    }
    this.sprite.rotation.z += this.spin * dt;
    const k = 1 - this.corpseT / D.CORPSE_TIME;
    this.sprite.scale.set(this.baseScale.x * (1 + k * 0.4) * this.flip, this.baseScale.y * (1 - k * 0.6), 1);
    this.blendMat.opacity = 1 - k * 0.5;
    if (this.corpseT > 0) return;
    world.burst({ x: p.x, y: p.y + this.size * 0.3, z: p.z },
      [[0.95, 0.88, 0.75], [1.0, 0.7, 0.75], [0.85, 0.15, 0.15], [1, 1, 1]], this.size > 1.4 ? 26 : 18, 4.5, 0.14, 0.9);
    this.disposed = true;
  }

  update(dt, world) {
    if (this.dead) {
      this.corpse(dt, world);
      return;
    }
    if (Game.authority) this.think(dt, world);
    if (Game.visual) this.animate(dt, world);
  }

  animate(dt, world) {
    const t = Game.now();
    const cam = world.camera;
    const pos = this.position;
    this.visual.rotation.y = Math.atan2(cam.position.x - pos.x, cam.position.z - pos.z);
    if (!Game.authority && this.shield > 0) this.shield = Math.max(0, this.shield - dt);

    if (this.shield > 0) {
      this.useBlend(true);
      this.setTint([1, 1, 1], Math.floor(this.shield * 10) % 2 === 0 ? 0.35 : 0.85);
    } else if (this.flash > 0) {
      this.useBlend(false);
      this.setTint([1.0, 0.4, 0.4]);
    } else {
      this.useBlend(false);
      this.setTint(this.carrier ? [1.0, 0.75, 0.45] : this.tint);
    }
    this.flash = Math.max(0, this.flash - dt);
    this.pack.visible = this.carrier;
    if (this.laser) this.updateLaser(pos);
    if (!Game.active()) return;

    const moving = this.move.length() > 0.05;
    const squish = moving ? Math.sin(t * 14 + this.phase) * 0.06 : Math.sin(t * 4 + this.phase) * 0.03;
    if (moving) {
      const right = Math.cos(this.visual.rotation.y);
      const rightZ = -Math.sin(this.visual.rotation.y);
      this.flip = (right * this.move.x + rightZ * this.move.z) > 0 ? -1 : 1;
    }
    this.sprite.scale.set(this.baseScale.x * (1 + squish) * this.flip, this.baseScale.y * (1 - squish), 1);
    this.sprite.rotation.z = moving ? Math.sin(t * 10 + this.phase) * 0.08 : 0;
  }

  think(dt, world) {
    if (!Game.active()) return;
    const t = Game.now();
    const level = world.level;
    const pos = this.position;

    if (Game.needCarrier && !Game.bombPlanted && this.shield <= 0) {
      Game.needCarrier = false;
      this.carrier = true;
      this.route = 0;
      Game.carriers++;
      if (Game.carriers > 1) Game.say('A hamster picked up the bomb!', 2.0);
    }
    const target = Game.target(pos);
    const me = target.position;
    const toX = me.x - pos.x;
    const toZ = me.z - pos.z;
    const dist = Math.hypot(toX, toZ);
    const eye = tmpDir.set(pos.x, pos.y + this.size * 0.75, pos.z);
    this.timer -= dt;
    const pe = target.eyePosition();
    const sees = dist < D.SIGHT_RANGE && target.hp > 0 && Game.clearLine(eye, pe) && !Game.smoked(eye, pe);
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - dt);
      const a = Math.atan2(-toZ, -toX) + Math.sin(t * 6 + this.phase) * 0.5;
      this.move.set(Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.speed * 1.3);
      this.timer = 0.2;
    }
    if (this.carrier && !Game.bombPlanted && flatDist(pos, Game.targetSite[1]) < D.PLANT_RANGE) {
      this.carrier = false;
      Game.plantBomb();
    }
    if (this.kind === 'sniper') this.snipe(dt, sees, dist, pos, me, world);
    if (this.timer <= 0 && this.shield <= 0) {
      const flows = level.routeFlows;
      if (this.route > 0 && (sees || this.route > flows.length || level.steer(flows[this.route - 1], pos, tmpSteer).lengthSq() === 0)) {
        this.route = 0;
      }
      let goal;
      if (this.carrier) goal = Game.siteFlow;
      else if (this.route > 0) goal = flows[this.route - 1];
      else goal = Game.flow;
      const d = (sees && dist < 8) ? tmpSteer.set(0, 0, 0) : level.steer(goal, pos, tmpSteer);
      this.nav = d.lengthSq() !== 0;
      let a;
      let s;
      if (this.nav) {
        a = Math.atan2(d.z, d.x) + randf(-0.3, 0.3);
        this.timer = randf(0.15, 0.3);
        s = this.speed * 1.2;
      } else if (dist < 7.5 && Math.random() < 0.6) {
        a = Math.atan2(toZ, toX) + randf(-0.4, 0.4);
        this.timer = randf(0.5, 0.9);
        s = this.speed * 1.35;
      } else {
        a = Math.random() * TAU;
        this.timer = randf(0.6, 1.6);
        s = Math.random() < 0.8 ? this.speed : 0;
      }
      this.move.set(Math.cos(a) * s, 0, Math.sin(a) * s);
    }
    const col = world.collision;
    const wall = Math.min(this.radius, world.level.wallRadius);
    pos.y = col.support(pos.x, pos.z, wall + 0.1, pos.y, D.MAX_CLIMB);
    let vx = this.move.x;
    let vz = this.move.z;
    if (this.kind === 'speedy' && (vx !== 0 || vz !== 0)) {
      const l = Math.hypot(vx, vz);
      const k = (Math.sin(t * 9 + this.phase) * this.speed * 0.6) / l;
      vx += -this.move.z * k;
      vz += this.move.x * k;
    }
    const hit = col.moveCircle(pos, vx * dt, vz * dt, wall, pos.y, D.MAX_CLIMB);
    pos.y = col.support(pos.x, pos.z, wall + 0.1, pos.y, D.MAX_CLIMB);
    if (hit) {
      if (!this.nav) this.move.multiplyScalar(-1);
      this.timer = Math.min(this.timer, this.nav ? 0.1 : 0.3);
    }

    this.spit -= dt;
    if (this.spit <= 0 && this.shield <= 0 && this.kind !== 'speedy' && this.kind !== 'sniper') {
      this.spit = randf(2.5, Math.max(3.0, 5.5 - Game.round * 0.8));
      if (sees) {
        const nx = dist > 0 ? toX / dist : 0;
        const nz = dist > 0 ? toZ / dist : 1;
        const mouth = new THREE.Vector3(pos.x + nx * (this.radius + 0.15), pos.y + this.size * 0.45, pos.z + nz * (this.radius + 0.15));
        const aim = new THREE.Vector3(me.x, me.y + 1.2, me.z).sub(mouth);
        const offsets = this.kind === 'chubby' ? [-0.25, 0, 0.25] : [0];
        for (const off of offsets) {
          world.spawnNut(mouth, aim.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, off), (210 + Game.round * 20) * D.NUT_SPEED_SCALE);
        }
        Audio.playAt('spit', 0.4, mouth);
        this.move.set(0, 0, 0);
        this.timer = 0.35;
      }
    }
    for (const s of Game.soldiers) {
      if (s.hp > 0 && flatDist(pos, s.position) < D.PLAYER_R + this.radius + 0.1 && Math.abs(s.position.y - pos.y) < this.size && this.shield <= 0) {
        Game.hurtSoldier(s, this.contact, this.label);
      }
    }
  }

  snipe(dt, sees, dist, pos, me, world) {
    this.aimCd = Math.max(0, this.aimCd - dt);
    const mouth = new THREE.Vector3(pos.x, pos.y + this.size * 0.6, pos.z);
    const target = this.aimTarget.set(me.x, me.y + 1.3, me.z);
    if (sees && dist < D.SNIPER_RANGE && this.shield <= 0 && this.aimCd <= 0 && !this.carrier) {
      this.aim += dt;
      this.move.set(0, 0, 0);
      this.timer = 0.2;
      if (this.aim >= D.SNIPER_AIM) {
        this.aim = 0;
        this.aimCd = randf(2.0, 3.0);
        world.spawnNut(mouth, target.clone().sub(mouth), D.SNIPER_NUT_SPEED, D.SNIPER_DMG);
        Audio.playAt('spit', 0.7, mouth);
      }
    } else {
      this.aim = 0;
    }
  }

  updateLaser(pos) {
    const mouth = tmpMouth.set(pos.x, pos.y + this.size * 0.6, pos.z);
    const target = this.aimTarget;
    this.laser.visible = this.aim > 0 && (this.aim < D.SNIPER_AIM * 0.7 || Math.floor(this.aim * 20) % 2 === 0);
    if (this.laser.visible) {
      const length = mouth.distanceTo(target);
      this.laser.position.copy(mouth).add(target).multiplyScalar(0.5).sub(pos);
      this.laser.scale.set(1, 1, length);
      this.laser.lookAt(target);
    }
  }
}
