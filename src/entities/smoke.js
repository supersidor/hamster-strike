import * as THREE from 'three';
import * as D from '../data.js';
import { randf, TAU } from '../util.js';

let puffTexture = null;
function texture() {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

export class Smoke {
  constructor(pos) {
    this.life = D.SMOKE_TIME;
    this.radius = 0;
    this.dead = false;
    this.object = new THREE.Group();
    this.object.position.copy(pos);
    this.object.scale.setScalar(0.1);
    this.materials = [];
    const tex = texture();
    for (let i = 0; i < 48; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: new THREE.Color().setRGB(0.74, 0.76, 0.78, THREE.SRGBColorSpace), transparent: true, opacity: 0.95,
        depthWrite: false, fog: false, rotation: randf(0, TAU),
      });
      const puff = new THREE.Sprite(mat);
      const a = Math.random() * TAU;
      const d = Math.sqrt(Math.random()) * D.SMOKE_RADIUS * 0.75;
      puff.position.set(Math.cos(a) * d, randf(0.4, 3.6), Math.sin(a) * d);
      puff.scale.setScalar(randf(3.0, 4.6));
      this.object.add(puff);
      this.materials.push(mat);
    }
  }

  center() {
    const p = this.object.position;
    return { x: p.x, y: p.y + 1.6, z: p.z };
  }

  update(dt) {
    this.life -= dt;
    if (this.life <= 0) {
      this.dead = true;
      return;
    }
    const s = Math.max(0.05, Math.min(1, Math.min((D.SMOKE_TIME - this.life) * 2, this.life / 1.5)));
    this.object.scale.setScalar(s);
    this.radius = D.SMOKE_RADIUS * s * 0.9;
    const alpha = 0.95 * Math.min(1, this.life / 1.5);
    for (const m of this.materials) {
      m.opacity = alpha;
      m.rotation += dt * 0.1;
    }
  }

  dispose() {
    for (const m of this.materials) m.dispose();
  }
}
