globalThis.window = { innerWidth: 1920, innerHeight: 1080 };
globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(v) {} }) };
import fs from 'node:fs';
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const { mergeVertices } = await import('three/examples/jsm/utils/BufferGeometryUtils.js');

const [src, out] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const wanted = ['Pistol', 'ShotGun', 'Gun-AK47', 'Sniper'];
const chunks = [];
const manifest = {};
let offset = 0;
const push = (arr) => {
  const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, Buffer.alloc(pad));
  const at = offset;
  offset += bytes.length + pad;
  return at;
};
root.traverse((o) => {
  if (!o.isMesh || !wanted.includes(o.name)) return;
  const geo = mergeVertices(o.geometry, 1e-4);
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const uv = geo.attributes.uv.array;
  const nor8 = new Int8Array(nor.length);
  for (let i = 0; i < nor.length; i++) nor8[i] = Math.round(nor[i] * 127);
  const index = Uint32Array.from(geo.index.array);
  manifest[o.name] = {
    vertices: pos.length / 3,
    indices: index.length,
    position: push(new Float32Array(pos)),
    normal: push(nor8),
    uv: push(new Float32Array(uv)),
    index: push(index),
  };
});
fs.writeFileSync(out, JSON.stringify(manifest));
fs.writeFileSync(out.replace(/\.json$/, '.bin'), Buffer.concat(chunks));
console.log(manifest, offset);
