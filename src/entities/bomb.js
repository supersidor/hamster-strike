import * as THREE from 'three';
import { Game } from '../game.js';
import { stdMat } from '../util.js';

export class Bomb {
  constructor(pos, light) {
    this.dead = false;
    this.light = light;
    this.object = new THREE.Group();
    this.object.position.copy(pos);
    this.body = new THREE.Group();
    this.object.add(this.body);
    const box = (size, p, rgb) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), stdMat(rgb));
      m.position.set(...p);
      m.castShadow = true;
      this.body.add(m);
    };
    box([0.5, 0.18, 0.32], [0, 0.09, 0], [0.35, 0.25, 0.15]);
    box([0.14, 0.2, 0.26], [-0.12, 0.2, 0], [0.7, 0.5, 0.25]);
    box([0.14, 0.2, 0.26], [0.07, 0.2, 0], [0.7, 0.5, 0.25]);
    box([0.18, 0.04, 0.12], [0.15, 0.2, 0.06], [0.1, 0.12, 0.1]);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0d0d, emissiveIntensity: 1 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), this.ledMat);
    led.position.set(0.2, 0.2, -0.08);
    this.body.add(led);
    light.position.set(pos.x, pos.y + 0.5, pos.z);

    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 96;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.label.scale.set(1.5, 0.56, 1);
    this.label.position.y = 0.9;
    this.label.renderOrder = 10;
    this.object.add(this.label);
    this.text = '';
  }

  update() {
    const timer = Game.bombTimer;
    const rate = timer > 10 ? 2.0 : (timer > 3 ? 5.0 : 12.0);
    const on = Math.floor(Game.now() * rate) % 2 === 0;
    this.body.scale.setScalar(on ? 1.08 : 1.0);
    this.ledMat.emissiveIntensity = on ? 6.0 : 0.2;
    this.light.intensity = on ? 12 : 0;
    const text = Math.max(0, timer).toFixed(1);
    if (text !== this.text) {
      this.text = text;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, 256, 96);
      ctx.font = 'bold 72px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, 128, 48);
      ctx.fillStyle = '#ff4d4d';
      ctx.fillText(text, 128, 48);
      this.texture.needsUpdate = true;
    }
  }

  dispose() {
    this.light.intensity = 0;
  }
}
