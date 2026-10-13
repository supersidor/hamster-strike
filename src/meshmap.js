import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export const LINK_BITS = { '1,0': 1, '-1,0': 2, '0,1': 4, '0,-1': 8 };
export const CLOSED = -32768;

export function decodeBase64(text) {
  if (typeof Buffer !== 'undefined') {
    const b = Buffer.from(text, 'base64');
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
  }
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function collisionGeometry(positions, index) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

export function parseMeshMap(meta, buffer) {
  const { vertices, indices, solid } = meta.counts;
  let offset = 0;
  const take = (Type, n) => {
    const out = new Type(buffer, offset, n);
    offset += n * Type.BYTES_PER_ELEMENT;
    return out;
  };
  const positions = take(Float32Array, vertices * 3);
  const uvs = take(Float32Array, vertices * 2);
  const index = take(Uint32Array, indices);
  const solidIndex = take(Uint32Array, solid);
  const nav = meta.nav;
  const heightBytes = decodeBase64(nav.heights);
  const heights = new Int16Array(heightBytes.buffer, heightBytes.byteOffset, nav.cols * nav.rows);
  const links = decodeBase64(nav.links);
  const kingLinks = decodeBase64(nav.kingLinks);
  const bvh = new MeshBVH(collisionGeometry(positions, solidIndex));
  return {
    kind: 'mesh',
    title: meta.name,
    walls: meta.walls || [],
    sky: meta.sky || [],
    fog: meta.fog,
    stepUp: meta.stepUp,
    navRadius: meta.navRadius,
    dir: meta.dir,
    materials: meta.materials,
    markers: meta.markers,
    nav: { cell: nav.cell, cols: nav.cols, rows: nav.rows, x0: nav.x0, z0: nav.z0, heights, links, kingLinks },
    geometry: { positions, uvs, index },
    bvh,
  };
}
