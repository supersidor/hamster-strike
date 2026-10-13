import * as THREE from 'three';
import * as D from './data.js';

export class Soldier {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = false;
    this.weapon = 'usp';
    this.eyeHeight = D.PLAYER_EYE;
    this.hp = 100;
    this.armor = 0;
    this.kit = false;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.mvps = 0;
    this.roundKills = 0;
    this.streak = 0;
    this.streakT = 0;
    this.hurt = 0;
    this.defuse = 0;
    this.defusing = false;
    this.ready = false;
    this.played = true;
    this.lowHpSaid = false;
    this.ping = 0;
    this.avatar = null;
    this.client = null;
  }

  eyePosition() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  resetRound() {
    this.hp = 100;
    this.hurt = 0;
    this.defuse = 0;
    this.defusing = false;
    this.lowHpSaid = false;
    this.ready = false;
    this.played = true;
  }

  resetMatch() {
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.mvps = 0;
    this.roundKills = 0;
    this.armor = 0;
    this.kit = false;
    this.streak = 0;
    this.streakT = 0;
  }
}
