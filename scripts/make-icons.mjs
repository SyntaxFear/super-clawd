// Generates the app icons (PNG + SVG) from Clawd's pixel silhouette. Run: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

// 16x12 Clawd, built with the same geometry as the in-game small sprite (src/art/hero.ts).
// o = body, d = shade, l = light, k = eye, g = legs
function buildClawd() {
  const W = 16,
    H = 12,
    bx = 2,
    bw = 12,
    bh = 9;
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < W && y < H) grid[y][x] = c;
  };
  for (const lx of [1, 3, 8, 10]) for (let y = bh; y < H; y++) set(bx + lx, y, 'g');
  for (let y = 0; y < bh; y++) for (let x = bx; x < bx + bw; x++) set(x, y, 'o');
  for (let x = bx; x < bx + bw; x++) set(x, 0, 'l');
  for (let y = 1; y <= Math.ceil(bh / 2); y++) set(bx, y, 'l');
  for (let y = 1; y < bh; y++) set(bx + bw - 1, y, 'd');
  for (let x = bx; x < bx + bw; x++) set(x, bh - 1, 'd');
  for (const ax of [0, bx + bw]) {
    for (let x = ax; x < ax + 2; x++) {
      set(x, 4, 'o');
      set(x, 5, 'd');
    }
  }
  for (const ex of [bx + 2, bx + bw - 3]) for (let y = 2; y < 4; y++) set(ex, y, 'k');
  return grid.map((r) => r.join(''));
}
const CLAWD = buildClawd();
const PAL = { o: [217, 119, 87], d: [176, 88, 60], l: [238, 156, 126], k: [30, 20, 18], g: [150, 76, 50] };
const BG = [31, 27, 24];
const GRID = 20; // cells across the icon

function render(size) {
  const cell = Math.floor(size / GRID);
  const off = Math.floor((size - cell * GRID) / 2);
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // Rounded-square background.
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (cx < radius && cy < radius) inside = (radius - cx) ** 2 + (radius - cy) ** 2 <= radius ** 2;
      const i = (y * size + x) * 4;
      if (inside) px.set([...BG, 255], i);
    }
  const ox = Math.floor((GRID - 16) / 2);
  const oy = Math.floor((GRID - 12) / 2) + 1;
  CLAWD.forEach((row, ry) => {
    for (let rx = 0; rx < 16; rx++) {
      const c = PAL[row[rx]];
      if (!c) continue;
      for (let y = 0; y < cell; y++)
        for (let x = 0; x < cell; x++) {
          const X = off + (ox + rx) * cell + x;
          const Y = off + (oy + ry) * cell + y;
          px.set([...c, 255], (Y * size + X) * 4);
        }
    }
  });
  return px;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = render(size);
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    raw.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg() {
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  let rects = '';
  const ox = (GRID - 16) / 2;
  const oy = (GRID - 12) / 2 + 1;
  CLAWD.forEach((row, ry) => {
    for (let rx = 0; rx < 16; rx++) {
      const c = PAL[row[rx]];
      if (c) rects += `<rect x="${ox + rx}" y="${oy + ry}" width="1" height="1" fill="${hex(c)}"/>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges"><rect width="${GRID}" height="${GRID}" rx="4.4" fill="${hex(BG)}"/>${rects}</svg>\n`;
}

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/icon-192.png', png(192));
fs.writeFileSync('public/icon-512.png', png(512));
fs.writeFileSync('public/icon.svg', svg());
console.log('icons written');
