import fs from 'node:fs';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const [src, out, name] = process.argv.slice(2);
if (!src || !out || !name) {
  console.error('usage: convert-gun.mjs <file.obj> <outbase> <name>');
  process.exit(1);
}
const root = new OBJLoader().parse(fs.readFileSync(src, 'utf8'));
const parts = [];
root.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  parts.push(g);
});
const geo = mergeVertices(mergeGeometries(parts), 1e-4);
const remap = (arr) => {
  for (let i = 0; i < arr.length; i += 3) {
    const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]];
    arr[i] = z;
    arr[i + 1] = x;
    arr[i + 2] = y;
  }
};
const pos = Float32Array.from(geo.attributes.position.array);
const nor = Float32Array.from(geo.attributes.normal.array);
remap(pos);
remap(nor);
const nor8 = new Int8Array(nor.length);
for (let i = 0; i < nor.length; i++) nor8[i] = Math.round(nor[i] * 127);
const uv = Float32Array.from(geo.attributes.uv.array);
const index = Uint32Array.from(geo.index.array);

const chunks = [];
let offset = 0;
const push = (arr) => {
  const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, Buffer.alloc(pad));
  const at = offset;
  offset += bytes.length + pad;
  return at;
};
const manifest = {
  [name]: {
    vertices: pos.length / 3,
    indices: index.length,
    position: push(pos),
    normal: push(nor8),
    uv: push(uv),
    index: push(index),
  },
};
fs.writeFileSync(`${out}.json`, JSON.stringify(manifest));
fs.writeFileSync(`${out}.bin`, Buffer.concat(chunks));
console.log(manifest, offset);
