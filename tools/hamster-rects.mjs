import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/hamster-rects.mjs <hamsters dir> <out.json>');
  process.exit(1);
}

function decodeRgba(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error(`${file}: only 8-bit non-interlaced RGBA is supported`);
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? cur[i - 4] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= 4 ? prev[i - 4] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { width, height, px };
}

function usedRect({ width, height, px }) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return [width, height, 0, 0, width, height];
  return [width, height, x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

const result = {};
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.png')).sort()) {
  result[path.basename(f, '.png')] = usedRect(decodeRgba(path.join(src, f)));
}
fs.writeFileSync(out, `${JSON.stringify(result)}\n`);
console.log(`rects: ${Object.keys(result).length} hamsters -> ${out}`);
