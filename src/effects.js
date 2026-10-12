import * as THREE from 'three';
import { lerp, randf, srgb, TAU } from './util.js';

const MAX_PARTICLES = 2500;
const MAX_DECALS = 80;

function radialTexture(stops, size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'Temp';
    scene.add(this.root);
    this.timed = [];
    this.decals = [];

    const geo = new THREE.SphereGeometry(0.5, 6, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pm = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pm.frustumCulled = false;
    this.pm.count = 0;
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3);
    scene.add(this.pm);
    this.parts = [];
    this.dummy = new THREE.Object3D();

    this.holeTex = radialTexture([[0, 'rgba(13,10,8,0.95)'], [0.45, 'rgba(20,15,13,0.85)'], [1, 'rgba(13,10,8,0)']]);
    this.holeMat = new THREE.MeshBasicMaterial({
      map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false,
    });
    this.decalGeo = new THREE.PlaneGeometry(1, 1);

    this.lights = [];
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff9940, 0, 10, 2);
      scene.add(l);
      this.lights.push({ light: l, t: 0, peak: 0 });
    }
  }

  update(dt) {
    for (let i = this.timed.length - 1; i >= 0; i--) {
      if (!this.timed[i](dt)) this.timed.splice(i, 1);
    }
    for (const entry of this.lights) {
      if (entry.t > 0) {
        entry.t = Math.max(0, entry.t - dt);
        entry.light.intensity = entry.peak * (entry.t / 0.45);
      }
    }
    this.updateParticles(dt);
  }

  updateParticles(dt) {
    const parts = this.parts;
    const d = this.dummy;
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts[i] = parts[parts.length - 1];
        parts.pop();
        continue;
      }
    }
    for (const p of parts) {
      const damp = Math.exp(-p.damp * dt);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = 1 - p.age / p.life;
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(Math.max(0.0001, p.size * k));
      d.updateMatrix();
      this.pm.setMatrixAt(n, d.matrix);
      this.pm.instanceColor.setXYZ(n, p.r, p.g, p.b);
      n++;
    }
    this.pm.count = n;
    this.pm.instanceMatrix.needsUpdate = true;
    this.pm.instanceColor.needsUpdate = true;
  }

  burst(pos, colors, count, speed = 5, size = 0.12, lifetime = 0.8, gravity = -9.8) {
    const cols = colors.map((c) => (c instanceof THREE.Color ? c : srgb(c)));
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= MAX_PARTICLES) break;
      const a = Math.random() * TAU;
      const z = Math.random() * 2 - 1;
      const s = Math.sqrt(1 - z * z);
      const v = randf(speed * 0.4, speed);
      const f = Math.random() * (cols.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(cols.length - 1, i0 + 1);
      const col = cols[i0].clone().lerp(cols[i1], f - i0);
      this.parts.push({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * s * v, vy: z * v, vz: Math.sin(a) * s * v,
        age: 0, life: lifetime * randf(0.8, 1.0), size: randf(size * 0.6, size * 1.3),
        damp: randf(0.5, 1.5), gravity, r: col.r, g: col.g, b: col.b,
      });
    }
  }

  explosion(pos, big = 1.0, shake) {
    this.burst({ x: pos.x, y: pos.y + 0.5, z: pos.z },
      [[1.0, 0.55, 0.1], [1.0, 0.85, 0.3], [0.25, 0.22, 0.2]], Math.floor(60 * big), 11 * big, 0.45 * big, 1.1, -4);
    const entry = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    entry.light.position.set(pos.x, pos.y + 1.5, pos.z);
    entry.light.distance = 10 * big;
    entry.peak = 70 * big;
    entry.t = 0.45;
    entry.light.intensity = entry.peak;
    const mat = new THREE.MeshBasicMaterial({ color: srgb([1.0, 0.7, 0.3]), transparent: true, opacity: 0.8, toneMapped: false });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    ball.position.set(pos.x, pos.y + 0.8, pos.z);
    ball.scale.setScalar(0.3);
    this.root.add(ball);
    let age = 0;
    this.timed.push((dt) => {
      age += dt;
      ball.scale.setScalar(lerp(0.3, 3.2 * big, Math.min(1, age / 0.3)));
      mat.opacity = 0.8 * Math.max(0, 1 - age / 0.35);
      if (age >= 0.35) {
        this.root.remove(ball);
        ball.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
    if (shake) shake(0.35 * big);
  }

  floatText(pos, text, color, size = 96) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = `bold ${size}px sans-serif`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    const h = Math.ceil(size * 1.5);
    canvas.width = w;
    canvas.height = h;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#000';
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = `rgb(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)})`;
    ctx.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(w * 0.01, h * 0.01, 1);
    sprite.position.set(pos.x, pos.y, pos.z);
    sprite.renderOrder = 10;
    this.root.add(sprite);
    let age = 0;
    this.timed.push((dt) => {
      age += dt;
      sprite.position.y = pos.y + 1.5 * Math.min(1, age);
      mat.opacity = Math.max(0, 1 - age);
      if (age >= 1) {
        this.root.remove(sprite);
        tex.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  decal(pos, normal, size) {
    const mesh = new THREE.Mesh(this.decalGeo, this.holeMat);
    mesh.position.set(pos.x + normal.x * 0.012, pos.y + normal.y * 0.012, pos.z + normal.z * 0.012);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.rotateZ(Math.random() * TAU);
    mesh.scale.setScalar(size);
    mesh.renderOrder = 1;
    this.root.add(mesh);
    this.decals.push(mesh);
    if (this.decals.length > MAX_DECALS) this.root.remove(this.decals.shift());
  }

  impact(pos, normal) {
    this.decal(pos, normal, 0.14);
    this.burst({ x: pos.x + normal.x * 0.05, y: pos.y + normal.y * 0.05, z: pos.z + normal.z * 0.05 },
      [[0.75, 0.68, 0.55], [0.45, 0.4, 0.34]], 6, 2.5, 0.05, 0.45);
  }

  tracer(from, to, color, life = 0.05, width = 0.015) {
    const length = from.distanceTo(to);
    if (length < 0.3) return;
    const mat = new THREE.MeshBasicMaterial({ color: srgb(color), transparent: true, opacity: 1, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, length), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    this.root.add(mesh);
    let age = 0;
    this.timed.push((dt) => {
      age += dt;
      mat.opacity = Math.max(0, 1 - age / life);
      if (age >= life) {
        this.root.remove(mesh);
        mesh.geometry.dispose();
        mat.dispose();
        return false;
      }
      return true;
    });
  }

  clear() {
    for (const child of [...this.root.children]) this.root.remove(child);
    this.timed.length = 0;
    this.decals.length = 0;
    this.parts.length = 0;
    for (const entry of this.lights) {
      entry.t = 0;
      entry.light.intensity = 0;
    }
  }
}
