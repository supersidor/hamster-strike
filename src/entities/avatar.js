import * as THREE from 'three';
import * as D from '../data.js';
import { srgb } from '../util.js';

const BODY_GEO = new THREE.BoxGeometry(0.5, 0.66, 0.28);
const ARM_GEO = new THREE.BoxGeometry(0.14, 0.5, 0.16);
const LEG_GEO = new THREE.BoxGeometry(0.2, 0.62, 0.22);
const PLANE = new THREE.PlaneGeometry(1, 1);
const SHIRT = new THREE.MeshStandardMaterial({ color: srgb([0.18, 0.34, 0.72]), roughness: 0.75 });
const PANTS = new THREE.MeshStandardMaterial({ color: srgb([0.16, 0.18, 0.24]), roughness: 0.8 });
const SKIN = new THREE.MeshStandardMaterial({ color: srgb([0.93, 0.74, 0.6]), roughness: 0.8 });
const FLASH_MAT = new THREE.MeshBasicMaterial({
  color: srgb([1.0, 0.8, 0.35]), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});
const gunMaterials = new Map();

function gunMaterial(assets, name) {
  const spec = D.WEAPONS[name];
  if (assets.weaponMaterials[spec.model]) return assets.weaponMaterials[spec.model];
  if (!spec.tint) return assets.gunMaterial;
  if (!gunMaterials.has(name)) {
    const mat = assets.gunMaterial.clone();
    mat.color.copy(new THREE.Color(1, 1, 1).lerp(srgb(spec.color), 0.45));
    gunMaterials.set(name, mat);
  }
  return gunMaterials.get(name);
}

function labelSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = '#9fd4ff';
  ctx.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.2;
  sprite.renderOrder = 5;
  return sprite;
}

export class Avatar {
  constructor(assets, name) {
    this.assets = assets;
    this.weapon = '';
    this.flashT = 0;
    this.object = new THREE.Group();
    this.body = new THREE.Group();
    this.object.add(this.body);

    const torso = new THREE.Mesh(BODY_GEO, SHIRT);
    torso.position.y = 0.93;
    const legL = new THREE.Mesh(LEG_GEO, PANTS);
    legL.position.set(-0.13, 0.31, 0);
    const legR = new THREE.Mesh(LEG_GEO, PANTS);
    legR.position.set(0.13, 0.31, 0);
    const armL = new THREE.Mesh(ARM_GEO, SHIRT);
    armL.position.set(-0.32, 0.95, -0.12);
    armL.rotation.x = -0.9;
    this.arm = new THREE.Group();
    this.arm.position.set(0.32, 1.12, 0);
    const armR = new THREE.Mesh(ARM_GEO, SHIRT);
    armR.position.set(0, -0.2, -0.05);
    armR.rotation.x = -0.9;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), SKIN);
    hand.position.set(0, -0.2, -0.36);
    this.arm.add(armR, hand);
    this.gunPivot = new THREE.Group();
    this.gunPivot.position.set(0, -0.2, -0.3);
    this.arm.add(this.gunPivot);
    this.body.add(torso, legL, legR, armL, this.arm);
    for (const m of [torso, legL, legR, armL, armR]) m.castShadow = true;

    this.headMat = new THREE.MeshStandardMaterial({ map: assets.petro, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    this.head = new THREE.Mesh(PLANE, this.headMat);
    this.head.scale.set(0.62, 0.62, 1);
    this.head.castShadow = true;
    this.object.add(this.head);
    this.label = labelSprite(name);
    this.object.add(this.label);
    this.setCrouch(false);
  }

  setCrouch(crouch) {
    this.crouch = crouch;
    this.body.scale.y = crouch ? 0.7 : 1;
    this.head.position.y = crouch ? 1.2 : 1.55;
    this.label.position.y = crouch ? 1.85 : 2.2;
  }

  setWeapon(name) {
    if (name === this.weapon || !D.WEAPONS[name]) return;
    this.weapon = name;
    for (const child of [...this.gunPivot.children]) this.gunPivot.remove(child);
    const spec = D.WEAPONS[name];
    const geo = this.assets.weaponMeshes[spec.model];
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const s = (spec.length * 0.9) / (bb.max.x - bb.min.x);
    const mesh = new THREE.Mesh(geo, gunMaterial(this.assets, name));
    mesh.matrixAutoUpdate = false;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -s), new THREE.Vector3(-s, 0, 0), new THREE.Vector3(0, s, 0));
    basis.setPosition(((bb.max.y + bb.min.y) / 2) * s, -bb.max.z * s * 0.7, bb.min.x * s + 0.05);
    mesh.matrix.copy(basis);
    mesh.matrixWorldNeedsUpdate = true;
    mesh.castShadow = true;
    this.gunPivot.add(mesh);
    this.muzzle = new THREE.Mesh(PLANE, FLASH_MAT);
    this.muzzle.scale.setScalar(0.3);
    this.muzzle.position.set(0, 0, -spec.length * 0.9 - 0.05);
    this.muzzle.visible = false;
    this.gunPivot.add(this.muzzle);
  }

  fire() {
    this.flashT = 0.06;
  }

  pose(pos, yaw, pitch, crouch, weapon) {
    this.object.position.copy(pos);
    this.body.rotation.y = yaw;
    this.arm.rotation.x = Math.max(-1.2, Math.min(1.2, pitch)) * 0.8;
    if (crouch !== this.crouch) this.setCrouch(crouch);
    this.setWeapon(weapon);
  }

  update(dt, camera) {
    const p = this.object.position;
    this.head.rotation.y = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.muzzle) {
        this.muzzle.visible = this.flashT > 0;
        this.muzzle.rotation.z = Math.random() * Math.PI * 2;
      }
    }
  }

  dispose() {
    this.headMat.dispose();
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}
