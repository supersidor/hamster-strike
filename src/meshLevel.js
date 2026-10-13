import * as THREE from 'three';
import { addBombsiteLabels } from './levelMesh.js';

const loader = new THREE.TextureLoader();
const textures = new Map();

function texture(dir, name) {
  const url = `${import.meta.env.BASE_URL}maps/${dir}/${name}.webp`;
  if (!textures.has(url)) {
    const tex = loader.load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    textures.set(url, tex);
  }
  return textures.get(url);
}

export function buildMeshLevel(level) {
  const data = level.maps[level.mapIndex];
  const group = new THREE.Group();
  group.name = 'Level';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.geometry.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.geometry.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(data.geometry.index, 1));
  geometry.computeVertexNormals();
  const materials = data.materials.map((m, i) => {
    geometry.addGroup(m.start, m.count, i);
    return new THREE.MeshStandardMaterial({ map: texture(data.dir, m.texture), roughness: 0.95, metalness: 0 });
  });
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  addBombsiteLabels(level, group);
  return group;
}
