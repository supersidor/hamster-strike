import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMeshMap } from '../src/meshmap.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/maps');
let cache = null;

export function loadMapEntries() {
  if (cache) return cache;
  cache = fs.readdirSync(dir).filter((f) => f.endsWith('.txt') || f.endsWith('.json')).sort().map((f) => {
    const file = path.join(dir, f);
    if (f.endsWith('.txt')) return fs.readFileSync(file, 'utf8');
    const bin = fs.readFileSync(file.replace(/\.json$/, '.bin'));
    return parseMeshMap(JSON.parse(fs.readFileSync(file, 'utf8')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  });
  return cache;
}
