import * as THREE from 'three';
import './style.css';
import { Game } from './game.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Hud } from './hud.js';
import { loadAssets } from './assets.js';
import { Net } from './net.js';
import { parseMeshMap } from './meshmap.js';

THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  'float fogFactor = 1.0 - exp( - fogDensity * vFogDepth );',
);

const tileMaps = import.meta.glob('./maps/*.txt', { query: '?raw', import: 'default', eager: true });
const meshMaps = import.meta.glob('./maps/*.json', { import: 'default', eager: true });
const meshBins = import.meta.glob('./maps/*.bin', { query: '?url', import: 'default', eager: true });
const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');

const STEP = 1 / 120;

function loadMaps() {
  return Promise.all([...Object.keys(tileMaps), ...Object.keys(meshMaps)].sort().map(async (key) => {
    if (key in tileMaps) return tileMaps[key];
    const bin = await (await fetch(meshBins[key.replace(/\.json$/, '.bin')])).arrayBuffer();
    return parseMeshMap(meshMaps[key], bin);
  }));
}

async function boot() {
  const canvas = document.getElementById('game');
  const loading = document.getElementById('loading');
  const fill = loading.querySelector('.fill');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  Input.attach(canvas);
  if (debug) {
    Object.defineProperty(Input, 'locked', { get: () => true, set: () => {} });
    Input.lock = () => {};
  }
  const [assets, maps] = await Promise.all([loadAssets(BASE, (p) => { fill.style.width = `${Math.round(p * 100)}%`; }), loadMaps()]);
  const world = new World(renderer, maps, assets);
  const hud = new Hud(document.getElementById('hud'), BASE);
  Net.init(world, assets, params);
  if (debug) window.cs = { Game, world, THREE, Input, Audio, renderer, hud, Net };

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    world.camera.aspect = w / h;
    world.camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const unlockAudio = () => Audio.resume();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  loading.classList.add('done');
  let last = performance.now();
  let lastRender = 0;
  let acc = 0;
  let clock = 0;
  const step = (now, render = true) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    const paused = Game.playing() && !Input.locked && Game.role !== 'client';
    if (!paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        world.update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 8) acc = 0;
    } else {
      acc = 0;
    }
    Net.frame(now);
    world.player.frame(dt);
    world.frame(clock);
    Audio.updateListener(world.camera);
    hud.update(world.player, world.camera);
    if (render) renderer.render(world.scene, world.camera);
  };
  const frame = (now) => {
    requestAnimationFrame(frame);
    step(now);
  };
  requestAnimationFrame(frame);
  if (debug) {
    window.cs.drive = async (seconds, hook) => {
      const channel = new MessageChannel();
      const turn = () => new Promise((resolve) => {
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(0);
      });
      const end = performance.now() + seconds * 1000;
      while (performance.now() < end) {
        const now = performance.now();
        if (now - last >= 4) {
          const render = now - lastRender >= 100;
          if (render) lastRender = now;
          step(now, render);
          if (hook) hook();
        }
        await turn();
      }
    };
  }
  if (params.has('online')) Net.connect();
}

boot().catch((err) => {
  console.error(err);
  const note = document.querySelector('#loading .note');
  if (note) note.textContent = `Failed to start: ${err.message}`;
});
