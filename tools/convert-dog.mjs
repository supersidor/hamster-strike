import fs from 'node:fs';

const [src, out, albedoOut] = process.argv.slice(2);
const LENGTH = 1.5;
if (!src || !out) {
  console.error('usage: convert-dog.mjs <file.glb> <outbase> [albedo.png]');
  process.exit(1);
}

const glb = fs.readFileSync(src);
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString());
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart);

const TYPES = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function read(index) {
  const acc = json.accessors[index];
  const view = json.bufferViews[acc.bufferView];
  const Type = TYPES[acc.componentType];
  const n = WIDTH[acc.type];
  const base = binStart + (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || n * Type.BYTES_PER_ELEMENT;
  const result = new Type(acc.count * n);
  for (let i = 0; i < acc.count; i++) {
    const row = new Type(glb.buffer.slice(glb.byteOffset + base + i * stride, glb.byteOffset + base + i * stride + n * Type.BYTES_PER_ELEMENT));
    result.set(row, i * n);
  }
  return result;
}

const node = json.nodes.find((n) => n.mesh !== undefined);
const prim = json.meshes[node.mesh].primitives[0];
const pos = Float32Array.from(read(prim.attributes.POSITION));
const nor = Float32Array.from(read(prim.attributes.NORMAL));
const uv = Float32Array.from(read(prim.attributes.TEXCOORD_0));
const index = Uint32Array.from(read(prim.indices));

const s = node.scale ? node.scale[0] : 1;
const t = node.translation || [0, 0, 0];
for (let i = 0; i < pos.length; i += 3) {
  pos[i] = pos[i] * s + t[0];
  pos[i + 1] = pos[i + 1] * s + t[1];
  pos[i + 2] = pos[i + 2] * s + t[2];
}

for (let i = 0; i < pos.length; i += 3) {
  pos[i] = -pos[i];
  pos[i + 2] = -pos[i + 2];
  nor[i] = -nor[i];
  nor[i + 2] = -nor[i + 2];
}

const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3) {
  for (let k = 0; k < 3; k++) {
    min[k] = Math.min(min[k], pos[i + k]);
    max[k] = Math.max(max[k], pos[i + k]);
  }
}
const scale = LENGTH / (max[2] - min[2]);
const cx = (min[0] + max[0]) / 2;
const cz = (min[2] + max[2]) / 2;
for (let i = 0; i < pos.length; i += 3) {
  pos[i] = (pos[i] - cx) * scale;
  pos[i + 1] = (pos[i + 1] - min[1]) * scale;
  pos[i + 2] = (pos[i + 2] - cz) * scale;
}

const nor8 = new Int8Array(nor.length);
for (let i = 0; i < nor.length; i++) nor8[i] = Math.round(nor[i] * 127);

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
  Dog: {
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

if (albedoOut) {
  const mat = json.materials[prim.material];
  const sg = mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness;
  const info = sg && sg.diffuseTexture ? sg.diffuseTexture : mat.pbrMetallicRoughness.baseColorTexture;
  const tex = json.textures[info.index];
  const view = json.bufferViews[json.images[tex.source].bufferView];
  fs.writeFileSync(albedoOut, bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
}

const size = [0, 1, 2].map((k) => +((max[k] - min[k]) * scale).toFixed(3));
console.log(manifest, offset, 'size', size);
