// One-off generator for placeholder PWA icons (solid background + white cross).
// Run with: node scripts/gen-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [79, 70, 229]; // indigo-600

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const cross = 0.18; // thickness of cross bars as fraction of size
  const margin = 0.22; // inset for rounded-square feel (we skip actual rounding, keep flat)
  const barW = Math.round(size * cross);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const cx = size / 2, cy = size / 2;
      const inVert = Math.abs(x - cx) < barW / 2 && y > size * margin && y < size * (1 - margin);
      const inHoriz = Math.abs(y - cy) < barW / 2 && x > size * margin && x < size * (1 - margin);
      const isCross = inVert || inHoriz;
      const off = 1 + x * 4;
      if (isCross) {
        row[off] = 255; row[off + 1] = 255; row[off + 2] = 255; row[off + 3] = 255;
      } else {
        row[off] = BG[0]; row[off + 1] = BG[1]; row[off + 2] = BG[2]; row[off + 3] = 255;
      }
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

for (const [name, size] of targets) {
  fs.writeFileSync(path.join(outDir, name), makePng(size));
  console.log('wrote', name);
}
