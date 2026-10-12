import * as THREE from 'three';
import * as D from '../data.js';
import { Game } from '../game.js';
import { stdMat } from '../util.js';

const BODY = stdMat([0.72, 0.12, 0.08], { metalness: 0.35, roughness: 0.45 });
const BAND = stdMat([0.95, 0.78, 0.1], { metalness: 0.5, roughness: 0.45 });
const LID = stdMat([0.08, 0.08, 0.08], { metalness: 0.2, roughness: 0.45 });
const geos = {
  body: new THREE.CylinderGeometry(0.7, 0.7, D.BARREL_H, 20),
  band: new THREE.CylinderGeometry(0.72, 0.72, 0.18, 20),
  lid: new THREE.CylinderGeometry(0.3, 0.3, 0.04, 14),
};

export function createBarrel(cell, pos) {
  const g = new THREE.Group();
  g.position.copy(pos);
  const add = (geo, mat, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  add(geos.body, BODY, D.BARREL_H / 2);
  add(geos.band, BAND, D.BARREL_H * 0.3);
  add(geos.band, BAND, D.BARREL_H * 0.7);
  add(geos.lid, LID, D.BARREL_H + 0.02);
  g.userData.cell = cell;
  g.userData.hit = () => Game.ignite(cell);
  return g;
}
