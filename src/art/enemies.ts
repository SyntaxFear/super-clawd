import { cached, fromRows, paint, type Img } from '../engine/sprite';

// ---------------------------------------------------------------- Bug

const BUG_BODY = [
  '...k........k...',
  '....k......k....',
  '.....kkkkkk.....',
  '....kwwkkwwk....',
  '...kkwpkkpwkk...',
  '..GGGGGGGGGGGG..',
  '.GllgggGGllgggG.',
  'GglggggGGlgggggG',
  'GggggggGGggggggG',
  'GggggggGGggggggG',
  '.GgggggGGgggggG.',
  '..GGGGGGGGGGGG..',
];
const BUG_LEGS = [
  ['.k...k....k...k.', 'k...k......k...k'],
  ['..k..k....k..k..', '..k...k..k...k..'],
];
const BUG_SQUASH = ['....kkkkkkkk....', '..GGGGGGGGGGGG..', '.GllgggGGllgggG.', 'GggggggGGggggggG', '.GGGGGGGGGGGGGG.', 'k.k.k......k.k.k'];

function bugPal(dark: boolean): Record<string, string> {
  return dark
    ? { k: '#5c8f55', G: '#3f8a3a', g: '#6fd35c', l: '#b5f0a0', w: '#f5f5f5', p: '#101010' }
    : { k: '#253d22', G: '#2f6b2c', g: '#63c251', l: '#a6e58f', w: '#f5f5f5', p: '#101010' };
}

export function bug(frame: number, dark: boolean): Img {
  return cached(`bug|${frame}|${dark}`, () => fromRows([...BUG_BODY, ...BUG_LEGS[frame % 2]], bugPal(dark)));
}

export function bugSquash(dark: boolean): Img {
  return cached(`bugsq|${dark}`, () => fromRows(BUG_SQUASH, bugPal(dark)));
}

// ---------------------------------------------------------------- Infinite Loop

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d <= -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d;
}

export function loop(rot: number, walkFrame: number, shell: boolean): Img {
  return cached(`loop|${rot}|${shell ? 's' : walkFrame}`, () =>
    paint(16, 16, (p) => {
      const cx = 8;
      const cy = shell ? 8 : 7;
      const a0 = -Math.PI / 4 + (rot * Math.PI) / 4;
      const base = '#46c8da';
      const light = '#a3edf5';
      const dark = '#1f7f8f';
      const out = '#0f4a55';
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          const r = Math.hypot(dx, dy);
          const th = Math.atan2(dy, dx);
          const d = angDiff(th, a0);
          if (d >= 0 && d <= 0.75) {
            const width = 3.9 * (1 - d / 0.75);
            if (Math.abs(r - 5.6) <= width) p.px(x, y, d < 0.15 ? light : base);
            continue;
          }
          if (d > 0.75 && d < 1.35) continue;
          if (r >= 3.9 && r <= 7.3) {
            const edge = r > 6.6 || r < 4.5;
            const col = edge ? out : dy < -2 ? light : dy > 2.5 ? dark : base;
            p.px(x, y, col);
          }
        }
      }
      if (!shell) {
        p.rect(5, 6, 2, 2, '#ffffff');
        p.rect(9, 6, 2, 2, '#ffffff');
        p.px(6, 7, '#0b1a1e');
        p.px(9, 7, '#0b1a1e');
        const fx = walkFrame ? [4, 9] : [3, 10];
        for (const x of fx) p.rect(x, 14, 3, 2, '#0f4a55');
      }
    }),
  );
}

// ---------------------------------------------------------------- Flaky Test

export function flaky(fail: boolean, frame: number): Img {
  return cached(`flaky|${fail}|${frame}`, () =>
    paint(16, 16, (p) => {
      const fill = fail ? '#e5484d' : '#46a758';
      const rim = fail ? '#8f1d24' : '#24622f';
      const hi = fail ? '#ff9a9e' : '#9be0a0';
      for (let y = 0; y < 14; y++)
        for (let x = 1; x < 15; x++) {
          const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 7);
          if (r > 6.9) continue;
          p.px(x, y, r > 5.9 ? rim : fill);
        }
      p.rect(4, 2, 2, 1, hi);
      p.px(3, 3, hi);
      const w = '#ffffff';
      if (fail) {
        for (let i = 0; i < 6; i++) {
          p.rect(5 + i, 4 + i, 1, 1, w);
          p.rect(5 + i, 5 + i, 1, 1, w);
          p.rect(10 - i, 4 + i, 1, 1, w);
          p.rect(10 - i, 5 + i, 1, 1, w);
        }
      } else {
        p.line(4, 7, 6, 9, w);
        p.line(4, 8, 6, 10, w);
        p.line(6, 9, 11, 4, w);
        p.line(6, 10, 11, 5, w);
      }
      const feet = frame ? [4, 9] : [3, 10];
      for (const x of feet) p.rect(x, 14, 3, 2, rim);
    }),
  );
}

export function flakySquash(): Img {
  return cached('flakysq', () =>
    paint(16, 6, (p) => {
      p.rect(2, 1, 12, 4, '#e5484d');
      p.rect(1, 2, 14, 2, '#e5484d');
      p.rect(2, 5, 12, 1, '#8f1d24');
      p.rect(6, 2, 4, 1, '#ffffff');
    }),
  );
}

// ---------------------------------------------------------------- Null Pointer

const CURSOR = [
  'k........',
  'kk.......',
  'kwk......',
  'kwwk.....',
  'kwwwk....',
  'kwwwwk...',
  'kwwwwwk..',
  'kwwwwwwk.',
  'kwwwwwwwk',
  'kwwwwkkkk',
  'kwwkwwk..',
  'kwk.kwwk.',
  'kk..kwwk.',
  'k....kwwk',
  '.....kwwk',
  '......kk.',
];

export function nullptr(): Img {
  return cached('nullptr', () =>
    paint(14, 16, (p, g) => {
      g.drawImage(fromRows(CURSOR, { k: '#e5484d', w: '#ffffff' }), 3, 0);
      void p;
    }),
  );
}

// ---------------------------------------------------------------- Memory Leak

const LEAK_SIZES: [number, number][] = [
  [14, 12],
  [20, 17],
  [28, 23],
];

export function leak(stage: number, frame: number): Img {
  return cached(`leak|${stage}|${frame}`, () => {
    const [W, H] = LEAK_SIZES[stage];
    return paint(W, H, (p) => {
      const main = '#b07cf0';
      const dark = '#6b3fb0';
      const light = '#e0c8ff';
      const cx = W / 2;
      const cy = H * 0.62;
      const rx = W / 2;
      const ry = H * 0.62;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const nx = (x + 0.5 - cx) / rx;
          const ny = (y + 0.5 - cy) / ry;
          const inside = y + 0.5 >= cy ? Math.abs(nx) <= 1 - (y === H - 1 && (x + frame) % 3 === 0 ? 0.25 : 0) : nx * nx + ny * ny <= 1;
          if (!inside) continue;
          const edge = nx * nx + ny * ny > 0.72 && y + 0.5 < cy;
          p.px(x, y, y >= H - 2 ? dark : edge && nx > 0 ? dark : main);
        }
      }
      // Shine.
      p.rect(Math.round(W * 0.22), Math.round(H * 0.18), Math.max(2, Math.round(W * 0.12)), 1, light);
      p.px(Math.round(W * 0.18), Math.round(H * 0.26), light);
      // Eyes.
      const ew = stage === 2 ? 3 : 2;
      const eh = stage === 0 ? 2 : stage === 1 ? 3 : 4;
      const ey = Math.round(H * 0.38);
      for (const ex of [Math.round(W * 0.3), Math.round(W * 0.7) - ew]) {
        p.rect(ex, ey, ew, eh, '#ffffff');
        p.rect(ex + ew - 1, ey + eh - Math.max(1, eh - 1), 1, Math.max(1, eh - 1), '#1a1030');
      }
      // Drips.
      const dx = frame ? Math.round(W * 0.2) : Math.round(W * 0.75);
      p.rect(dx, H - 1, 1, 1, light);
      if (stage > 0) p.rect(Math.round(W / 2) - 2, Math.round(H * 0.68), 5, 1, '#3d1f6b');
    });
  });
}

// ---------------------------------------------------------------- Deprecated Warning

const WARN = [
  '......kk......',
  '.....kyyk.....',
  '.....kyyk.....',
  '....kyKKyk....',
  '....kyKKyk....',
  '...kyyKKyyk...',
  '...kyyKKyyk...',
  '..kyyyKKyyyk..',
  '..kyyyyyyyyk..',
  '.kyyyyKKyyyyk.',
  '.kyyyyyyyyyyk.',
  'kkkkkkkkkkkkkk',
];

export function deprecated(frame: number): Img {
  return cached(`warn|${frame}`, () =>
    paint(20, 14, (p, g) => {
      const wing = '#f5f1e8';
      const edge = '#b8b0a0';
      const up = frame === 0;
      const rows = up ? [2, 3, 4, 5] : [5, 6, 7, 8];
      const widths = up ? [1, 2, 3, 2] : [2, 3, 2, 1];
      rows.forEach((y, i) => {
        const w = widths[i];
        p.rect(3 - w, y, w, 1, wing);
        p.rect(17, y, w, 1, wing);
      });
      p.px(0, rows[up ? 2 : 1], edge);
      p.px(19, rows[up ? 2 : 1], edge);
      g.drawImage(fromRows(WARN, { k: '#3a2a05', y: '#f5c542', K: '#1a1405' }), 3, 1);
    }),
  );
}

// ---------------------------------------------------------------- node_modules

export function thwomp(angry: boolean): Img {
  return cached(`thwomp|${angry}`, () =>
    paint(32, 32, (p) => {
      const out = '#5a3f22';
      const box = '#c49a6c';
      const light = '#e0bb8c';
      const shadeC = '#9c7448';
      const tape = '#ead9b6';
      p.rect(0, 0, 32, 32, out);
      p.rect(1, 1, 30, 30, box);
      p.rect(1, 1, 30, 1, light);
      p.rect(1, 1, 1, 30, light);
      p.rect(30, 2, 1, 29, shadeC);
      p.rect(2, 30, 29, 1, shadeC);
      p.rect(1, 8, 30, 1, shadeC);
      p.rect(13, 1, 6, 8, tape);
      p.rect(13, 8, 6, 1, '#cdb88f');
      // Eyes.
      p.rect(6, 12, 7, 6, '#ffffff');
      p.rect(19, 12, 7, 6, '#ffffff');
      p.rect(6, 12, 7, 1, '#d8d0c4');
      p.rect(19, 12, 7, 1, '#d8d0c4');
      if (angry) {
        p.rect(10, 14, 2, 3, '#120d08');
        p.rect(20, 14, 2, 3, '#120d08');
        p.line(5, 9, 12, 12, out);
        p.line(5, 10, 12, 13, out);
        p.line(26, 9, 19, 12, out);
        p.line(26, 10, 19, 13, out);
      } else {
        p.rect(9, 14, 2, 3, '#120d08');
        p.rect(21, 14, 2, 3, '#120d08');
      }
      // Gritted teeth.
      p.rect(8, 21, 16, 6, '#120d08');
      p.rect(9, 22, 14, 4, '#f5f1e8');
      for (let x = 11; x < 23; x += 3) p.rect(x, 22, 1, 4, '#9c968c');
      p.rect(9, 24, 14, 1, '#9c968c');
    }),
  );
}

// ---------------------------------------------------------------- failing CI job (lava bubble)

export function bubble(frame: number): Img {
  return cached(`bubble|${frame}`, () =>
    paint(12, 14, (p) => {
      p.disc(6, 8, 5.6, '#b4232c');
      p.disc(6, 8, 4.6, '#e5484d');
      p.rect(frame ? 3 : 4, 5, 2, 1, '#ff9a9e');
      p.px(4, 7, '#ffffff');
      p.px(8, 7, '#ffffff');
      p.px(5, 8, '#ffffff');
      p.px(7, 8, '#ffffff');
      p.px(6, 9, '#ffffff');
      p.px(5, 10, '#ffffff');
      p.px(7, 10, '#ffffff');
      p.px(4, 11, '#ffffff');
      p.px(8, 11, '#ffffff');
      // Flame tail.
      p.rect(frame ? 4 : 6, 1, 2, 2, '#ff7a45');
      p.rect(5, 2, 2, 2, '#ffb36b');
    }),
  );
}

// ---------------------------------------------------------------- Spinner glyph (✻ ✶ ✳ ✢)

export function spinner(frame: number): Img {
  return cached(`spin|${frame}`, () =>
    paint(9, 9, (p) => {
      const o = '#ff6b3d';
      const c = '#ffd166';
      const plus = frame === 0 || frame === 1;
      const cross = frame === 0 || frame === 2;
      if (plus) {
        p.rect(4, 0, 1, 9, o);
        p.rect(0, 4, 9, 1, o);
      }
      if (cross) {
        for (let i = 1; i < 8; i++) {
          p.px(i, i, o);
          p.px(8 - i, i, o);
        }
      }
      if (frame === 3) {
        p.rect(3, 1, 3, 1, o);
        p.rect(3, 7, 3, 1, o);
        p.rect(1, 3, 1, 3, o);
        p.rect(7, 3, 1, 3, o);
      }
      p.rect(3, 3, 3, 3, c);
      p.px(4, 4, '#ffffff');
    }),
  );
}
