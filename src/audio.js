import * as THREE from 'three';

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();
    this.pending = [];
    this.muted = false;
    this.fwd = new THREE.Vector3();
    this.up = new THREE.Vector3();
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 1.0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  async load(base, onProgress) {
    const names = await (await fetch(`${base}sounds/index.json`)).json();
    const ctx = this.ensureContext();
    if (!ctx) return;
    let done = 0;
    await Promise.all(names.map(async (name) => {
      try {
        const res = await fetch(`${base}sounds/${name}.wav`);
        const data = await res.arrayBuffer();
        this.buffers.set(name, await ctx.decodeAudioData(data));
      } catch (err) {
        console.warn('sound failed', name, err);
      }
      done++;
      if (onProgress) onProgress(done / names.length);
    }));
  }

  resume() {
    const ctx = this.ensureContext();
    if (ctx && ctx.state !== 'running') ctx.resume();
  }

  play(name, volume = 0.6, pitch = 1.0) {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || ctx.state === 'closed') return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = pitch;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  playAt(name, volume, pos) {
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || ctx.state === 'closed') return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume * 2.0;
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 8;
    panner.maxDistance = 70;
    panner.rolloffFactor = 1;
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
    src.connect(gain).connect(panner).connect(this.master);
    src.start();
  }

  updateListener(camera) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    camera.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = this.fwd.x;
      l.forwardY.value = this.fwd.y;
      l.forwardZ.value = this.fwd.z;
      l.upX.value = this.up.x;
      l.upY.value = this.up.y;
      l.upZ.value = this.up.z;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }
  }
}

export const Audio = new AudioSystem();
