import * as THREE from 'three';
import * as D from '../data.js';
import { Game } from '../game.js';
import { Audio } from '../audio.js';
import { flatDist, randf, stdMat } from '../util.js';

const RADIUS = 0.1;
const HE_MAT = stdMat([0.25, 0.4, 0.2]);
const SMOKE_MAT = stdMat([0.55, 0.6, 0.62]);
const CAP_MAT = stdMat([0.2, 0.2, 0.2], { metalness: 0.8 });
const BODY = new THREE.CylinderGeometry(0.08, 0.08, 0.2, 12);
const CAP = new THREE.BoxGeometry(0.06, 0.06, 0.1);

export class Grenade {
  constructor(pos, vel, smoke) {
    this.smoke = smoke;
    this.fuse = smoke ? 1.9 : 1.6;
    this.velocity = vel.clone();
    this.dead = false;
    this.object = new THREE.Group();
    const body = new THREE.Mesh(BODY, smoke ? SMOKE_MAT : HE_MAT);
    const cap = new THREE.Mesh(CAP, CAP_MAT);
    cap.position.set(0, 0.12, 0.02);
    body.castShadow = true;
    this.object.add(body, cap);
    this.object.position.copy(pos);
    this.spin = new THREE.Vector3(randf(-8, 8), randf(-8, 8), randf(-8, 8));
  }

  update(dt, world) {
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.detonate(world);
      return;
    }
    const v = this.velocity;
    v.y -= D.GRAVITY * dt;
    v.multiplyScalar(Math.exp(-0.3 * dt));
    const from = this.object.position;
    const to = from.clone().addScaledVector(v, dt);
    const hit = world.collision.raycast(from, to.clone().addScaledVector(v.clone().normalize(), RADIUS), false);
    const ground = world.level.heightAt(to.x, to.z);
    if (hit) {
      const n = hit.normal;
      this.object.position.copy(hit.point).addScaledVector(n, RADIUS + 0.005);
      const vn = v.dot(n);
      if (vn < 0) {
        v.addScaledVector(n, -(1 + 0.35) * vn);
        const tangent = v.clone().addScaledVector(n, -v.dot(n));
        v.addScaledVector(tangent, -0.2);
      }
      if (v.length() < 0.4) v.set(0, 0, 0);
      this.spin.multiplyScalar(0.7);
    } else {
      this.object.position.copy(to);
      if (to.y - RADIUS < ground && v.y < 0) {
        this.object.position.y = ground + RADIUS;
        v.y = Math.abs(v.y) > 1.0 ? -v.y * 0.35 : 0;
        v.x *= 0.8;
        v.z *= 0.8;
      }
    }
    this.object.rotation.x += this.spin.x * dt;
    this.object.rotation.y += this.spin.y * dt;
    this.object.rotation.z += this.spin.z * dt;
  }

  detonate(world) {
    this.dead = true;
    const pos = this.object.position.clone();
    if (this.smoke) {
      world.spawnSmoke(pos);
      Audio.playAt('smoke', 0.9, pos);
      return;
    }
    world.explosionFx(pos, 1.0);
    Audio.playAt('explosion', 0.8, pos);
    Game.blast(pos, 'HE Grenade', D.HE_RADIUS, D.HE_DMG, D.HE_RADIUS + 1.5, 8);
    const pp = Game.playerPos();
    if (flatDist(pp, pos) < D.HE_SELF_RADIUS && Math.abs(pp.y - pos.y) < D.HE_SELF_RADIUS) {
      Game.hurtPlayer(D.HE_SELF_DMG, "Petro's own grenade");
    }
  }
}
