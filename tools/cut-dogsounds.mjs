import fs from 'node:fs';
import path from 'node:path';

const [, , srcDir, outDir] = process.argv;
if (!srcDir || !outDir) {
  console.error('usage: cut-dogsounds.mjs <dir with mono 32 kHz wavs> <out dir>');
  process.exit(1);
}

const RATE = 32000;
const PEAK = 0.8;

function readWav(name) {
  const b = fs.readFileSync(path.join(srcDir, `${name}.wav`));
  let o = 12;
  while (o < b.length) {
    const id = b.toString('ascii', o, o + 4);
    const len = b.readUInt32LE(o + 4);
    if (id === 'data') {
      const n = len >> 1;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(o + 8 + i * 2) / 32768;
      return out;
    }
    o += 8 + len;
  }
  throw new Error(`no data chunk in ${name}`);
}

function writeWav(file, samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}

function envelope(s) {
  const win = Math.round(RATE * 0.01);
  const out = [];
  for (let i = 0; i + win <= s.length; i += win) {
    let sum = 0;
    for (let j = 0; j < win; j++) sum += s[i + j] * s[i + j];
    out.push(Math.sqrt(sum / win));
  }
  return out;
}

function segments(s, thr = 0.08, gap = 0.15) {
  const env = envelope(s);
  const t = Math.max(...env) * thr;
  const g = Math.round(gap / 0.01);
  const segs = [];
  let st = -1;
  let last = -1;
  env.forEach((v, i) => {
    if (v >= t) {
      if (st < 0) st = i;
      last = i;
    } else if (st >= 0 && i - last > g) {
      segs.push([st, last]);
      st = -1;
    }
  });
  if (st >= 0) segs.push([st, last]);
  const pad = Math.round(RATE * 0.02);
  return segs.map(([a, c]) => s.slice(Math.max(0, a * 0.01 * RATE - pad | 0), Math.min(s.length, (c + 1) * 0.01 * RATE + pad | 0)));
}

function trim(s, thr = 0.03) {
  const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let a = 0;
  let c = s.length - 1;
  while (a < c && Math.abs(s[a]) < peak * thr) a++;
  while (c > a && Math.abs(s[c]) < peak * thr) c--;
  return s.slice(a, c + 1);
}

function window(s, from, dur) {
  return s.slice(Math.round(from * RATE), Math.round((from + dur) * RATE));
}

function shift(s, rate) {
  const n = Math.floor((s.length - 1) / rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const k = Math.floor(p);
    out[i] = s[k] + (s[k + 1] - s[k]) * (p - k);
  }
  return out;
}

function finish(s, fadeIn = 0.004, fadeOut = 0.03) {
  const peak = s.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const out = new Float32Array(s.length);
  const fi = Math.min(s.length / 2, Math.round(fadeIn * RATE));
  const fo = Math.min(s.length / 2, Math.round(fadeOut * RATE));
  for (let i = 0; i < s.length; i++) {
    let g = PEAK / peak;
    if (i < fi) g *= i / fi;
    if (i >= s.length - fo) g *= (s.length - 1 - i) / fo;
    out[i] = s[i] * g;
  }
  return out;
}

const bark = [
  ...['Dog_Bark_1', 'Dog_Bark_2', 'Dog_Bark_3', 'Dog_Bark', 'barking_01', 'barking_02'].map((n) => trim(readWav(n))),
  ...segments(readWav('dog_barking_mono')).slice(0, 4),
].map((s) => finish(s));

const growlBase = [...[0, 1, 2, 3, 4, 5].map((i) => trim(readWav(`growl_${i}`))), trim(readWav('dog-growl'))];
const growl = [...growlBase, shift(growlBase[1], 0.85), shift(growlBase[3], 1.15), shift(growlBase[6], 0.9)].map((s) => finish(s, 0.01, 0.06));

const whineBase = [...segments(readWav('Sad_Dog'), 0.1, 0.12), ...segments(readWav('Sad_Dog_1'), 0.1, 0.12)]
  .filter((s) => s.length > RATE * 0.3)
  .sort((a, b) => b.length - a.length);
const whine = [...whineBase.slice(0, 6), shift(whineBase[0], 0.85), shift(whineBase[1], 1.15), shift(whineBase[2], 1.25), shift(whineBase[3], 0.8)].map((s) => finish(s, 0.02, 0.1));

const wolf = readWav('wolf_howls');
const howl = Array.from({ length: 10 }, (_, i) => window(wolf, 0.4 + i * 2.75, 2.5)).map((s) => finish(s, 0.2, 0.4));

const groups = { bark, growl, whine, howl };
fs.mkdirSync(outDir, { recursive: true });
const names = [];
for (const [kind, list] of Object.entries(groups)) {
  if (list.length !== 10) throw new Error(`${kind}: ${list.length} clips, need 10`);
  list.forEach((s, i) => {
    const name = `${kind}_${i + 1}`;
    writeWav(path.join(outDir, `${name}.wav`), s);
    names.push(name);
    console.log(name, (s.length / RATE).toFixed(2), 's');
  });
}
fs.writeFileSync(path.join(outDir, 'index.json'), `${JSON.stringify(names, null, 2)}\n`);
