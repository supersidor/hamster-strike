import * as THREE from 'three';
import * as D from './data.js';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { rayCylinder } from './collide.js';
import { clamp, expo, randf, srgb, TAU } from './util.js';

const SENSITIVITY = 0.0022;
const FOV = 74;
const SCOPE_FOV = 18;
const GUN_REAR = 0.02;
const GUN_SCALE = 1.8;
const MAX_HITS = 24;

export class Player {
  constructor(world) {
    this.world = world;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.camera = world.camera;
    this.yaw = 0;
    this.pitch = 0;
    this.punch = 0;
    this.fireCd = 0;
    this.nadeCd = 0;
    this.woofCd = 0;
    this.lastWoof = 0;
    this.patT = 0;
    this.patCd = 0;
    this.lastPat = 0;
    this.wagT = 0;
    this.crouching = false;
    this.scoped = false;
    this.spread = 0;
    this.bob = 0;
    this.kick = 0;
    this.spray = 0;
    this.recoilYaw = 0;
    this.fovKick = 0;
    this.baseFov = FOV;
    this.eye = D.PLAYER_EYE;
    this.roll = 0;
    this.grounded = false;
    this.flashT = 0;
    this.gunId = '';
    this.gun = null;
    this.muzzle = null;
    this.flash = null;
    this.wantReload = false;
    this.wantSwitch = false;
    this.wantHe = false;
    this.wantSmoke = false;
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.viewmodel = new THREE.Group();
    this.viewmodel.scale.setScalar(0.3);
    this.camera.add(this.viewmodel);
    this.patHand = this.buildPatHand();
    this.camera.add(this.patHand);
    this.flashLight = new THREE.PointLight(0xffcc73, 0, 6, 2);
    this.flashLight.position.set(0.1, -0.1, -0.6);
    this.camera.add(this.flashLight);
    this.gunMeshes = null;

    Input.onKey = (code) => this.onKey(code);
    Input.onMouseDown = (button) => this.onMouseDown(button);
  }

  eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eye, this.position.z);
  }

  place(pos, facing) {
    this.position.set(pos.x, pos.y + 0.05, pos.z);
    this.velocity.set(0, 0, 0);
    this.yaw = facing;
    this.pitch = 0;
    this.punch = 0;
    this.spray = 0;
    this.recoilYaw = 0;
    this.fovKick = 0;
    this.crouching = false;
    this.eye = D.PLAYER_EYE;
    this.roll = 0;
    this.scoped = false;
    this.grounded = false;
    this.syncCamera();
  }

  onKey(code) {
    if (Net.onKey(code)) return;
    if (Game.phase === 'title' || Game.phase === 'match_end') {
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') Input.lock();
    } else if (Game.playing() && (code === 'Space' || code === 'Enter')) {
      Input.lock();
    }
    Game.onKey(code);
    switch (code) {
      case 'KeyR': this.wantReload = true; break;
      case 'KeyQ': this.wantSwitch = true; break;
      case 'KeyG': this.wantHe = true; break;
      case 'KeyF': this.wantSmoke = true; break;
      case 'KeyE': this.pat(); break;
      case 'KeyH':
        if (Game.playing()) {
          Game.me.dog = !Game.me.dog;
          Game.announce = Game.me.dog ? 'DOG MODE ON' : 'DOG MODE OFF';
          Game.announceT = 1.5;
        }
        break;
      default:
        if (D.DOG_SOUNDS[code]) this.woof(D.DOG_SOUNDS[code]);
        break;
    }
  }

  woof(kind) {
    if (!Game.playing() || !Game.me.dog || Game.hp <= 0 || this.woofCd > 0) return;
    this.woofCd = D.DOG_SOUND_CD;
    let v = 1 + Math.floor(Math.random() * D.DOG_VARIANTS);
    if (v === this.lastWoof) v = (v % D.DOG_VARIANTS) + 1;
    this.lastWoof = v;
    Audio.play(`dog_${kind}_${v}`, 0.9);
    if (Game.role === 'client') Game.send({ t: 'woof', n: kind, v });
  }

  buildPatHand() {
    const group = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.3), new THREE.MeshStandardMaterial({ color: srgb([0.18, 0.34, 0.72]), roughness: 0.75 }));
    sleeve.position.z = 0.15;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.11), new THREE.MeshStandardMaterial({ color: srgb([0.93, 0.74, 0.6]), roughness: 0.8 }));
    hand.position.z = -0.03;
    group.add(sleeve, hand);
    group.visible = false;
    return group;
  }

  nearBomb() {
    return Game.bombPlanted && Math.hypot(this.position.x - Game.bombPos.x, this.position.z - Game.bombPos.z) < D.DEFUSE_RANGE;
  }

  pat() {
    if (Game.role !== 'client' || !Game.playing() || Game.me.dog || Game.hp <= 0 || this.patCd > 0 || this.nearBomb()) return;
    const dog = Net.patTarget(this.position, this.forward());
    if (!dog) return;
    let v = 1 + Math.floor(Math.random() * D.DOG_VARIANTS);
    if (v === this.lastPat) v = (v % D.DOG_VARIANTS) + 1;
    this.lastPat = v;
    this.patT = D.PAT_TIME;
    this.patCd = D.PAT_TIME;
    Audio.playAt(`dog_${D.DOG_PAT_SOUND}_${v}`, 0.9, { x: dog.position.x, y: dog.position.y + 0.5, z: dog.position.z });
    Net.patFx(dog, null);
    Game.send({ t: 'pat', id: dog.id, v });
  }

  wag() {
    this.wagT = D.PAT_TIME;
  }

  onMouseDown(button) {
    if (Game.playing() && !Input.locked) {
      Input.lock();
      return;
    }
    if (Game.role === 'client' && Game.hp <= 0 && Game.playing()) Net.cycleSpectate();
    if (button === 2 && Game.current === 'awp' && Game.active() && Input.locked) this.scoped = !this.scoped;
  }

  get playing() {
    return Game.playing();
  }

  update(dt) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.nadeCd = Math.max(0, this.nadeCd - dt);
    this.woofCd = Math.max(0, this.woofCd - dt);
    this.patT = Math.max(0, this.patT - dt);
    this.patCd = Math.max(0, this.patCd - dt);
    this.wagT = Math.max(0, this.wagT - dt);
    this.punch = this.punch * Math.exp(-7 * dt);
    this.kick = this.kick * Math.exp(-14 * dt);
    this.recoilYaw = this.recoilYaw * Math.exp(-5 * dt);
    this.fovKick = this.fovKick * Math.exp(-8 * dt);
    this.flashT = Math.max(0, this.flashT - dt);

    if (!Game.playing()) {
      this.yaw += dt * 0.12;
      this.pitch += (-0.08 - this.pitch) * Math.min(1, dt);
      this.viewmodel.visible = false;
      this.patHand.visible = false;
      this.wantReload = this.wantSwitch = this.wantHe = this.wantSmoke = false;
      this.scoped = false;
      this.roll = 0;
      this.eye = D.PLAYER_EYE;
      return;
    }
    if (Game.hp <= 0) {
      this.eye += (0.3 - this.eye) * expo(5, dt);
      this.roll += (0.6 - this.roll) * expo(4, dt);
      this.viewmodel.visible = false;
      this.patHand.visible = false;
      this.velocity.x = 0;
      this.velocity.z = 0;
      this.vertical(dt, false);
      return;
    }
    this.roll = this.wagT > 0 ? 0.04 * Math.sin((D.PAT_TIME - this.wagT) * 16) * Math.min(1, this.wagT / 0.3) : 0;
    const live = Game.active();
    if (Game.current !== 'awp' || !live || Game.reloading > 0) this.scoped = false;
    if (this.wantSwitch && live && Game.primary !== '') {
      Game.current = Game.current === Game.primary ? Game.secondary : Game.primary;
      Game.reloading = 0;
      this.fireCd = Math.max(this.fireCd, 0.25);
      this.scoped = false;
    }
    if (this.wantReload && live && Game.reloading <= 0 && (Game.ammo[Game.current] || 0) < D.WEAPONS[Game.current].mag) {
      Game.reloading = D.WEAPONS[Game.current].reload;
      Audio.play('reload', 0.9);
      this.scoped = false;
    }
    this.wantReload = false;
    this.wantSwitch = false;

    const defusing = live && this.nearBomb() && Input.isDown('KeyE');
    if (Game.role === 'client') {
      if (defusing && !Game.me.defusing) Audio.play('use', 0.8);
      Game.me.defusing = defusing;
    } else if (defusing) {
      if (Game.defuse === 0) Audio.play('use', 0.8);
      Game.defuse += dt;
      if (Game.defuse >= (Game.kit ? D.KIT_DEFUSE_TIME : D.DEFUSE_TIME)) Game.defused();
    } else {
      Game.defuse = 0;
    }

    this.move(dt, live && !defusing);
    const me = Game.me;
    me.yaw = this.yaw;
    me.pitch = this.pitch;
    me.crouch = this.crouching;
    me.weapon = Game.current;
    me.eyeHeight = this.eye;

    const spec = D.WEAPONS[Game.current];
    const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.spread = this.weaponSpread(spec, hspeed);
    this.syncCamera();
    const shooting = Input.mouse.has(0) && Input.locked;
    if (!shooting || Game.reloading > 0) this.spray = Math.max(0, this.spray - dt * 12);
    if (live && shooting && !defusing && this.patT <= 0 && this.fireCd <= 0 && Game.reloading <= 0) this.fire(spec);
    if (live && this.nadeCd <= 0 && (this.wantHe || this.wantSmoke)) {
      this.nadeCd = D.NADE_COOLDOWN;
      const fwd = this.forward();
      const pos = this.eyePosition().addScaledVector(fwd, 0.5);
      const vel = fwd.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3, 0)).addScaledVector(this.velocity, 0.5);
      if (Game.role === 'client') Game.send({ t: 'nade', p: [pos.x, pos.y, pos.z], v: [vel.x, vel.y, vel.z], sm: this.wantSmoke ? 1 : 0 });
      else this.world.spawnGrenade(pos, vel, this.wantSmoke);
      if (this.wantSmoke) {
        Game.say('Smoke out!', 1.5);
      } else {
        Audio.play('fire_in_the_hole', 0.8);
        Game.say('Fire in the hole!', 1.5);
      }
    }
    this.wantHe = false;
    this.wantSmoke = false;
    this.updateViewmodel(dt, hspeed);
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  weaponSpread(spec, hspeed) {
    if (Game.current === 'awp') return this.scoped && hspeed < 1 ? 0 : 0.05 + hspeed * 0.01;
    let s = spec.spread;
    if (spec.settle) s *= 1 + (0.12 - 1) * clamp((this.spray - 2) / 8, 0, 1);
    else s += this.spray * spec.climb * 0.5;
    s += hspeed * 0.006;
    if (!this.grounded) s += 0.06;
    if (this.crouching) s *= 0.7;
    return s;
  }

  move(dt, canMove) {
    let ix = 0;
    let iz = 0;
    this.crouching = canMove && (Input.isDown('ControlLeft') || Input.isDown('ControlRight') || Input.isDown('KeyC'));
    if (canMove) {
      ix = (Input.isDown('KeyD') ? 1 : 0) - (Input.isDown('KeyA') ? 1 : 0);
      iz = (Input.isDown('KeyS') ? 1 : 0) - (Input.isDown('KeyW') ? 1 : 0);
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = ix * cos + iz * sin;
    let wz = -ix * sin + iz * cos;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) {
      wx /= wl;
      wz /= wl;
    }
    let top = D.PLAYER_SPEED;
    if (Input.isDown('ShiftLeft') || Input.isDown('ShiftRight')) top = D.PLAYER_WALK;
    if (this.crouching) top = D.PLAYER_WALK * 0.8;
    top *= D.WEAPONS[Game.current].move || 1;
    if (this.scoped) top *= 0.6;
    const k = expo(this.grounded ? 14 : 2.5, dt);
    this.velocity.x += (wx * top - this.velocity.x) * k;
    this.velocity.z += (wz * top - this.velocity.z) * k;
    this.vertical(dt, canMove && Input.isDown('Space'));
    this.eye += ((this.crouching ? D.PLAYER_CROUCH_EYE : D.PLAYER_EYE) - this.eye) * expo(12, dt);
  }

  vertical(dt, jump) {
    const col = this.world.collision;
    const p = this.position;
    const v = this.velocity;
    const step = Game.level.stepUp;
    const wasGrounded = this.grounded;
    if (wasGrounded) v.y = jump ? D.JUMP_SPEED : 0;
    else v.y -= D.GRAVITY * dt;
    if (col.moveCircle(p, v.x * dt, 0, D.PLAYER_R, p.y, step)) v.x = 0;
    if (col.moveCircle(p, 0, v.z * dt, D.PLAYER_R, p.y, step)) v.z = 0;
    p.y += v.y * dt;
    if (v.y > 0) {
      const head = this.eye + 0.18;
      const top = col.ceiling(p.x, p.z, D.PLAYER_R * 0.8, p.y);
      if (p.y + head > top) {
        p.y = top - head;
        v.y = 0;
      }
    }
    const ground = col.support(p.x, p.z, D.PLAYER_R * 0.8, p.y, step);
    if (v.y <= 0 && p.y - ground <= (wasGrounded ? step : 0.0001)) {
      p.y = ground;
      v.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
    if (p.y < -30) p.y = Game.level.heightAt(p.x, p.z);
  }

  frame(dt) {
    const [mx, my] = Input.takeMouse();
    if (Input.locked && Game.playing() && Game.hp > 0) {
      const sens = SENSITIVITY * (this.camera.fov / FOV);
      this.yaw -= mx * sens;
      this.pitch = clamp(this.pitch - my * sens, -1.5, 1.5);
    }
    this.baseFov += ((this.scoped ? SCOPE_FOV : FOV) - this.baseFov) * expo(25, dt);
    const fov = this.baseFov - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.syncCamera();
  }

  syncCamera() {
    const watch = Net.watching;
    if (watch) {
      this.camera.position.set(watch.position.x, watch.position.y + watch.eyeHeight, watch.position.z);
      this.euler.set(watch.pitch, watch.yaw, 0);
      this.camera.quaternion.setFromEuler(this.euler);
      this.camera.updateMatrixWorld(true);
      return;
    }
    const shake = Game.shake;
    this.camera.position.set(this.position.x, this.position.y + this.eye, this.position.z);
    this.euler.set(
      this.pitch + this.punch + randf(-0.02, 0.02) * shake,
      this.yaw + this.recoilYaw + randf(-0.02, 0.02) * shake,
      this.roll,
    );
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.updateMatrixWorld(true);
  }

  fire(spec) {
    const weapon = Game.current;
    const mag = Game.ammo[weapon] || 0;
    if (mag <= 0) {
      if (Game.reloading <= 0) {
        Game.reloading = spec.reload;
        Audio.play('reload', 0.9);
      }
      return;
    }
    Game.ammo[weapon] = mag - 1;
    this.fireCd = spec.rate;
    Game.pop = 0.15;
    const snd = D.WEAPON_SOUNDS[weapon];
    Audio.play(snd[0], snd[1], snd[2] || 1);
    const origin = this.camera.position.clone();
    const fwd = this.forward();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    let shotEnd = null;
    for (let i = 0; i < spec.pellets; i++) {
      const r = this.spread * Math.sqrt(Math.random());
      const a = Math.random() * TAU;
      const dir = fwd.clone().addScaledVector(right, Math.tan(r) * Math.cos(a)).addScaledVector(up, Math.tan(r) * Math.sin(a)).normalize();
      const end = this.hitscan(origin, dir, spec, weapon);
      if (!shotEnd) shotEnd = end;
    }
    if (Game.role === 'client' && shotEnd) {
      Game.send({ t: 'shot', w: weapon, o: [origin.x, origin.y, origin.z], e: [shotEnd.x, shotEnd.y, shotEnd.z] });
    }
    const pull = spec.settle ? Math.max(0, 4 - this.spray) : this.spray;
    this.punch += spec.kick + spec.climb * pull;
    this.recoilYaw += Math.sin(this.spray * 0.7) * spec.climb * pull * 0.4;
    this.spray = Math.min(this.spray + 1, 12);
    this.kick = 1;
    this.flashT = 0.05;
    const eject = origin.clone().addScaledVector(right, 0.18).addScaledVector(up, -0.12).addScaledVector(fwd, 0.35);
    const vel = right.clone().multiplyScalar(randf(1.5, 2.5)).addScaledVector(up, randf(1.5, 2.5)).add(this.velocity);
    this.world.spawnCasing(eject, vel, weapon === 'nova');
    if (weapon === 'awp') this.scoped = false;
    if (Game.ammo[weapon] === 0) {
      Game.reloading = spec.reload;
      Audio.play('reload', 0.9);
    }
  }

  hitscan(origin, dir, spec, weapon) {
    const world = this.world;
    const col = world.collision;
    const pierce = spec.pierce;
    const end = origin.clone().addScaledVector(dir, spec.range);
    const muzzle = new THREE.Vector3();
    if (this.muzzle) this.muzzle.getWorldPosition(muzzle);
    else muzzle.copy(origin);
    let from = origin.clone();
    let tracerEnd = end.clone();
    let killed = 0;
    let kingHit = false;
    let worldDecals = 0;
    const done = new Set();
    for (let i = 0; i < MAX_HITS; i++) {
      const dx = end.x - from.x;
      const dy = end.y - from.y;
      const dz = end.z - from.z;
      const wh = col.raycast(from, end, false);
      let bestT = wh ? wh.t : Infinity;
      let kind = wh ? 'world' : null;
      let target = null;
      for (const h of world.hamsters) {
        if (done.has(h)) continue;
        const p = h.position;
        const hit = rayCylinder(from, dx, dy, dz, p.x, p.z, h.radius, p.y + 0.05, p.y + 0.05 + Math.max(h.size * 0.95, h.radius * 2));
        if (hit.t >= 0 && hit.t < bestT) {
          bestT = hit.t;
          kind = 'hamster';
          target = h;
        }
      }
      for (const k of world.kings) {
        if (done.has(k)) continue;
        const p = k.position;
        const s = Math.max(0.2, k.grow);
        const hit = rayCylinder(from, dx, dy, dz, p.x, p.z, D.BOSS_R * s, p.y + 0.05 * s, p.y + (D.BOSS_SIZE * 0.95 + 0.05) * s);
        if (hit.t >= 0 && hit.t < bestT) {
          bestT = hit.t;
          kind = 'king';
          target = k;
        }
      }
      if (!kind) break;
      const pos = new THREE.Vector3(from.x + dx * bestT, from.y + dy * bestT, from.z + dz * bestT);
      if (kind === 'hamster') {
        done.add(target);
        from = pos.clone().addScaledVector(dir, 0.01);
        if (target.shield > 0) continue;
        const headshot = pos.y > target.position.y + target.size * 0.66;
        world.burst(pos, [[1, 1, 1], [0.95, 0.85, 0.7], [0.9, 0.2, 0.2]], 8, 3.0, 0.07, 0.5);
        if (Game.role === 'client') {
          Game.send({ t: 'hit', id: target.id, w: weapon, hs: headshot ? 1 : 0, d: [dir.x, dir.y, dir.z] });
        } else if (Game.damageHamster(target, spec.dmg, spec.name, headshot, { x: dir.x * (pierce ? 12 : 4), y: dir.y * (pierce ? 12 : 4), z: dir.z * (pierce ? 12 : 4) })) {
          killed++;
          if (killed === 2) Audio.play('holy_shit', 0.8);
        }
        if (!pierce) {
          tracerEnd = pos;
          break;
        }
      } else if (kind === 'king') {
        done.add(target);
        from = pos.clone().addScaledVector(dir, 0.01);
        if (!kingHit) {
          kingHit = true;
          const headshot = pos.y > target.position.y + target.height() * 0.7;
          world.burst(pos, [[1, 1, 1], [0.95, 0.85, 0.7]], 10, 3.5, 0.1, 0.5);
          if (Game.role === 'client') Game.send({ t: 'hit', k: 1, id: target.id, w: weapon, hs: headshot ? 1 : 0 });
          else Game.hitKing(target, spec.dmg, spec.name, headshot);
        }
        if (!pierce) {
          tracerEnd = pos;
          break;
        }
      } else {
        if (wh.barrel) {
          if (Game.role === 'client') Game.send({ t: 'ignite', c: wh.barrel[0], r: wh.barrel[1] });
          else Game.ignite(wh.barrel);
        }
        if (worldDecals < 3) {
          world.impact(wh.point, wh.normal);
          worldDecals++;
        }
        from = wh.point.clone().addScaledVector(dir, 0.02);
        if (!pierce) {
          tracerEnd = wh.point;
          break;
        }
      }
    }
    if (weapon === 'awp') world.tracer(muzzle, tracerEnd, [0.5, 1.0, 0.5], 0.35, 0.02);
    else if (Math.random() < 0.5) world.tracer(muzzle, tracerEnd, [1.0, 0.85, 0.4], 0.05, 0.012);
    return tracerEnd;
  }

  updateViewmodel(dt, hspeed) {
    this.viewmodel.visible = !this.scoped;
    if (this.gunId !== Game.current) this.buildGun(Game.current);
    this.bob += dt * hspeed * 1.6;
    const sway = Math.min(1, hspeed / 4);
    const sx = Math.sin(this.bob) * 0.012 * sway;
    const sy = Math.abs(Math.cos(this.bob)) * 0.012 * sway;
    let dip = 0;
    if (Game.reloading > 0) {
      dip = Math.sin(clamp(Game.reloading / D.WEAPONS[Game.current].reload, 0, 1) * Math.PI) * 0.18;
    }
    let lower = 0;
    if (this.patT > 0) {
      const k = D.PAT_TIME - this.patT;
      lower = Math.min(1, k / 0.12, this.patT / 0.15);
      const stroke = Math.sin(k * 11);
      this.patHand.position.set(0.1, -0.22 * lower - 0.1 * (1 - lower), -0.42 - 0.1 * stroke);
      this.patHand.rotation.set(-0.5 + 0.2 * stroke, 0, 0);
    }
    this.patHand.visible = this.patT > 0 && !this.scoped;
    this.viewmodel.position.set(0.11 + sx, -0.1 - dip * 0.5 - lower * 0.3 + sy, -0.2 + this.kick * 0.03);
    this.viewmodel.rotation.set(this.kick * 0.12 - dip, 0, dip * 0.8);
    const on = this.flashT > 0;
    if (this.flash) {
      this.flash.visible = on;
      this.flash.rotation.z = Math.random() * TAU;
    }
    this.flashLight.intensity = on ? 30 : 0;
  }

  gunGeometry(name) {
    const meshes = this.world.assets.weaponMeshes;
    return meshes[name];
  }

  box(parent, size, pos, rgb, metal = 0.3) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color: srgb(rgb), metalness: metal, roughness: 0.5 }));
    m.position.set(...pos);
    parent.add(m);
    return m;
  }

  buildGun(weapon) {
    if (this.gun) {
      this.viewmodel.remove(this.gun);
      this.gun.traverse((o) => {
        if (o.material && o.userData.own) o.material.dispose();
      });
    }
    this.gunId = weapon;
    const spec = D.WEAPONS[weapon];
    const length = spec.length;
    const gun = new THREE.Group();
    gun.scale.setScalar(GUN_SCALE);
    this.viewmodel.add(gun);
    this.gun = gun;
    const dark = [0.12, 0.12, 0.13];
    const skin = [0.93, 0.74, 0.6];
    this.box(gun, [0.09, 0.1, 0.3], [0.02, -0.12, 0.2], [0.2, 0.28, 0.4], 0);
    this.box(gun, [0.08, 0.09, 0.08], [0, -0.08, 0.03], skin, 0);

    const geo = this.gunGeometry(spec.model);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const sizeX = bb.max.x - bb.min.x;
    const sizeZ = bb.max.z - bb.min.z;
    const centerY = (bb.max.y + bb.min.y) / 2;
    const s = length / sizeX;
    const rear = spec.slot === 2 ? GUN_REAR : GUN_REAR - 0.02;
    const front = rear - length;
    const top = 0.05;
    const assets = this.world.assets;
    const mat = (assets.weaponMaterials[spec.model] ?? assets.gunMaterial).clone();
    if (spec.tint) mat.color.copy(new THREE.Color(1, 1, 1).lerp(srgb(spec.color), 0.45));
    const model = new THREE.Mesh(geo, mat);
    model.userData.own = true;
    model.matrixAutoUpdate = false;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -s), new THREE.Vector3(-s, 0, 0), new THREE.Vector3(0, s, 0));
    basis.setPosition(centerY * s, top - bb.max.z * s, rear + bb.min.x * s);
    model.matrix.copy(basis);
    model.matrixWorldNeedsUpdate = true;
    gun.add(model);
    if (spec.slot === 1) this.box(gun, [0.08, 0.1, 0.1], [-0.02, -0.07, front + length * 0.4], skin, 0);
    if (weapon === 'negev') {
      const can = this.world.assets.canister.clone(true);
      can.scale.setScalar(0.24);
      can.rotation.y = Math.PI / 2;
      can.position.set(0, -0.08, front + length * 0.6);
      can.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.color.multiply(new THREE.Color(0.55, 0.55, 0.5));
          o.userData.own = true;
          o.castShadow = false;
        }
      });
      gun.add(can);
      this.box(gun, [0.02, 0.02, 0.22], [0.025, -0.05, front + 0.14], dark, 0.8);
      this.box(gun, [0.02, 0.02, 0.22], [-0.025, -0.05, front + 0.14], dark, 0.8);
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, top - sizeZ * s * 0.3, front - 0.03);
    gun.add(this.muzzle);
    const fm = new THREE.MeshBasicMaterial({
      color: srgb([1.0, 0.8, 0.35]), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), fm);
    this.flash.userData.own = true;
    this.flash.visible = false;
    this.muzzle.add(this.flash);
    gun.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    });
  }
}
