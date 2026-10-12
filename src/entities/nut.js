import * as THREE from 'three';
import { Game } from '../game.js';
import { segmentDistance } from '../collide.js';
import * as D from '../data.js';
import { randf, stdMat } from '../util.js';

const MAT = stdMat([0.62, 0.4, 0.2], { roughness: 0.6 });
const CAP_MAT = stdMat([0.38, 0.24, 0.12], { roughness: 0.6 });
const BODY = new THREE.SphereGeometry(0.13, 10, 8).scale(1, 1.15, 1);
const CAP = new THREE.SphereGeometry(0.14, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const A = new THREE.Vector3();
const B = new THREE.Vector3();

export class Nut {
  constructor(pos, dir, speed, dmg = 20) {
    this.velocity = dir.clone().normalize().multiplyScalar(speed);
    this.dmg = dmg;
    this.life = 3.0;
    this.spin = new THREE.Vector3(randf(-10, 10), randf(-10, 10), randf(-10, 10));
    this.dead = false;
    this.object = new THREE.Group();
    const body = new THREE.Mesh(BODY, MAT);
    const cap = new THREE.Mesh(CAP, CAP_MAT);
    cap.position.y = 0.07;
    body.castShadow = true;
    this.object.add(body, cap);
    this.object.position.copy(pos);
  }

  update(dt, world) {
    if (!Game.active()) {
      this.dead = true;
      return;
    }
    this.life -= dt;
    const from = this.object.position;
    const to = from.clone().addScaledVector(this.velocity, dt);
    const hit = world.collision.raycast(from, to, true);
    if (hit) {
      if (hit.barrel) Game.ignite(hit.barrel);
      this.dead = true;
      return;
    }
    this.object.position.copy(to);
    this.object.rotation.x += this.spin.x * dt;
    this.object.rotation.y += this.spin.y * dt;
    this.object.rotation.z += this.spin.z * dt;
    const p = Game.playerPos();
    A.set(p.x, p.y + 0.2, p.z);
    B.set(p.x, p.y + 1.7, p.z);
    if (segmentDistance(to, A, B) < D.PLAYER_R + 0.15) {
      this.dead = true;
      Game.hurtPlayer(this.dmg, 'Hamster');
      return;
    }
    if (this.life <= 0) this.dead = true;
  }
}
