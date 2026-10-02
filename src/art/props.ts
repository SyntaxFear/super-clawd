import { drawText, measure } from '../engine/font';
import { cached, fromRows, paint, type Img } from '../engine/sprite';
import type { Deco, Theme } from '../game/builder';

// ---------------------------------------------------------------- platforms

export function platform(tiles: number, theme: Theme, crumble: boolean): Img {
  return cached(`plat|${tiles}|${theme}|${crumble}`, () =>
    paint(tiles * 16, 8, (p) => {
      const w = tiles * 16;
      if (crumble) {
        p.rect(0, 0, w, 8, '#4a1414');
        p.rect(1, 0, w - 2, 7, '#8f3a3a');
        p.rect(1, 0, w - 2, 1, '#e5736e');
        for (let x = 6; x < w - 4; x += 11) {
          p.px(x, 2, '#4a1414');
          p.px(x + 1, 3, '#4a1414');
          p.px(x, 4, '#4a1414');
          p.px(x + 1, 5, '#4a1414');
        }
        for (let x = 3; x < w - 6; x += 22) {
          p.px(x, 2, '#ffd4cc');
          p.px(x + 2, 2, '#ffd4cc');
          p.px(x + 1, 3, '#ffd4cc');
          p.px(x, 4, '#ffd4cc');
          p.px(x + 2, 4, '#ffd4cc');
        }
        return;
      }
      if (theme === 'cloud') {
        p.rect(0, 0, w, 8, '#7d88a3');
        p.rect(1, 0, w - 2, 7, '#dfe5f1');
        p.rect(1, 0, w - 2, 1, '#ffffff');
        for (let x = 4; x < w - 4; x += 8) p.px(x, 3, x % 16 === 4 ? '#5fd47a' : '#b4bed4');
        p.rect(2, 5, w - 4, 1, '#c4cce0');
        return;
      }
      if (theme === 'hangar') {
        p.rect(0, 0, w, 8, '#22242a');
        p.rect(1, 0, w - 2, 7, '#5c606a');
        p.rect(1, 0, w - 2, 1, '#a8aeb9');
        for (let x = 1; x < w - 1; x += 8) {
          p.rect(x, 4, 4, 2, '#f2c14b');
          p.rect(x + 4, 4, 4, 2, '#1a1614');
        }
        return;
      }
      const dark = theme === 'deps';
      p.rect(0, 0, w, 8, dark ? '#0d1222' : '#1a1614');
      p.rect(1, 0, w - 2, 7, dark ? '#2a3452' : '#3a332f');
      p.rect(1, 0, w - 2, 1, dark ? '#a9b8e8' : '#f0e6d8');
      p.rect(1, 1, w - 2, 1, dark ? '#5468a8' : '#d97757');
      for (let x = 4; x < w - 6; x += 7) p.rect(x, 4, 4, 1, dark ? '#3b4a7a' : '#5a4b44');
    }),
  );
}

// ---------------------------------------------------------------- checkpoint / goal

export function checkpoint(reached: boolean, frame: number): Img {
  return cached(`cp|${reached}|${frame}`, () =>
    paint(14, 32, (p) => {
      p.rect(1, 2, 2, 28, '#9c968c');
      p.rect(1, 2, 1, 28, '#c9c3b8');
      p.rect(0, 29, 6, 3, '#4a3f37');
      p.rect(0, 29, 6, 1, '#6b5d52');
      const flag = reached ? '#d97757' : '#9c968c';
      const edge = reached ? '#8a3d27' : '#6b665e';
      p.rect(3, 2, 10, 7, flag);
      p.rect(3, 8, 10, 1, edge);
      if (frame) p.px(12, 8, flag);
      // git branch glyph.
      const c = reached ? '#ffffff' : '#d6d0c6';
      p.rect(6, 3, 1, 5, c);
      p.px(9, 3, c);
      p.px(9, 4, c);
      p.px(8, 5, c);
      p.px(7, 6, c);
      p.px(5, 7, c);
      p.px(7, 7, c);
    }),
  );
}

export function poleTop(frame: number): Img {
  return cached(`poletop|${frame}`, () =>
    paint(8, 8, (p) => {
      p.disc(4, 4, 3.8, '#b35a3e');
      p.disc(4, 4, 3, '#d97757');
      const c = frame % 2 ? '#ffffff' : '#ffe2cf';
      p.rect(3, 1, 2, 6, c);
      p.rect(1, 3, 6, 2, c);
      p.px(2, 2, '#f0a485');
    }),
  );
}

export function flag(passed: boolean, frame: number): Img {
  return cached(`flag|${passed}|${frame}`, () =>
    paint(18, 14, (p) => {
      const fill = passed ? '#46a758' : '#e5484d';
      const dark = passed ? '#24622f' : '#8f1d24';
      for (let y = 0; y < 13; y++) {
        const indent = frame ? Math.round(Math.sin(y * 0.6) * 1.5 + 1.5) : Math.round(Math.cos(y * 0.6) * 1.5 + 1.5);
        p.rect(indent, y, 18 - indent, 1, fill);
      }
      p.rect(0, 12, 18, 1, dark);
      p.rect(17, 0, 1, 13, dark);
      const w = '#ffffff';
      if (passed) {
        p.line(6, 6, 8, 8, w);
        p.line(6, 7, 8, 9, w);
        p.line(8, 8, 12, 3, w);
        p.line(8, 9, 12, 4, w);
      } else {
        for (let i = 0; i < 6; i++) {
          p.px(6 + i, 3 + i, w);
          p.px(7 + i, 3 + i, w);
          p.px(11 - i, 3 + i, w);
          p.px(12 - i, 3 + i, w);
        }
      }
    }),
  );
}

// ---------------------------------------------------------------- barriers

export function gate(h: number, safe: boolean, frame: number, dark: boolean): Img {
  return cached(`gate|${h}|${safe}|${frame}|${dark}`, () =>
    paint(20, h, (p, g) => {
      const post = dark ? '#5a5f78' : '#3a332f';
      p.rect(0, 0, 20, h, post);
      p.rect(2, 0, 16, h, '#1f1b18');
      const stripe = safe ? '#f2c14b' : '#e5484d';
      for (let band = 0; band < h; band += 40) {
        for (let y = band; y < Math.min(band + 10, h); y++) {
          for (let x = 2; x < 18; x++) if (((x + y) >> 2) % 2 === 0) p.px(x, y, stripe);
        }
      }
      // Lock in the middle.
      const cy = Math.round(h / 2) - 8;
      p.rect(6, cy + 6, 8, 8, '#d97757');
      p.rect(7, cy + 2, 6, 1, '#d97757');
      p.rect(7, cy + 2, 1, 5, '#d97757');
      p.rect(12, cy + 2, 1, 5, '#d97757');
      p.rect(9, cy + 8, 2, 3, frame ? '#1f1b18' : '#3a2a20');
      drawText(g, '?', 7, cy + 18, frame ? '#ffffff' : '#d97757');
    }),
  );
}

export function rateWall(h: number, dark: boolean): Img {
  return cached(`rate|${h}|${dark}`, () =>
    paint(20, h, (p) => {
      p.rect(0, 0, 20, h, dark ? '#6f7aa0' : '#1e2538');
      p.rect(2, 0, 16, h, '#3d4a63');
      for (let y = 6; y < h; y += 12) p.rect(3, y, 14, 1, '#2c364c');
      const cy = 10;
      p.disc(10, cy + 4, 5, '#ede6dc');
      p.disc(10, cy + 4, 4, '#3d4a63');
      p.rect(10, cy + 1, 1, 4, '#ede6dc');
      p.rect(10, cy + 4, 3, 1, '#ede6dc');
    }),
  );
}

// ---------------------------------------------------------------- decorations

const DUCK = [
  '....yyyy....',
  '...yyyyyy...',
  '...yykyyyoo.',
  '...yyyyyoooo',
  '....yyyy....',
  'y..yyyyyyy..',
  'yyyyyyyyyyy.',
  'yyyYYYYYYyy.',
  '.yyYYYYYYyy.',
  '..yyyyyyyy..',
];

function duck(): Img {
  return cached('duck', () => fromRows(DUCK, { y: '#f5c542', Y: '#e3ae2f', o: '#f08a24', k: '#1a1614' }));
}

function keycap(label: string): Img {
  return cached(`key|${label}`, () =>
    paint(13, 13, (p, g) => {
      p.rect(0, 1, 13, 12, '#8c8279');
      p.rect(1, 2, 11, 10, '#cfc8be');
      p.rect(2, 0, 9, 1, '#8c8279');
      p.rect(1, 1, 11, 8, '#f2eee8');
      p.rect(2, 1, 9, 1, '#ffffff');
      drawText(g, label, 4, 1, '#3a332f');
    }),
  );
}

function rack(frame: number, dark: boolean): Img {
  return cached(`rack|${frame}|${dark}`, () =>
    paint(16, 32, (p) => {
      p.rect(0, 0, 16, 32, dark ? '#4b5270' : '#1a1614');
      p.rect(1, 1, 14, 30, '#2b2623');
      for (let u = 0; u < 6; u++) {
        const y = 2 + u * 5;
        p.rect(2, y, 12, 4, '#3a332f');
        p.rect(3, y + 1, 6, 1, '#4a413b');
        const on = (u + frame) % 3 !== 0;
        p.px(11, y + 1, on ? '#5fd47a' : '#2f4a35');
        p.px(12, y + 2, (u + frame) % 2 ? '#f2b84b' : '#4a3a20');
      }
    }),
  );
}

function signImg(lines: string[], dark: boolean): Img {
  return cached(`sign|${lines.join('/')}|${dark}`, () => {
    const w = Math.max(...lines.map((l) => measure(l))) + 10;
    const h = lines.length * 9 + 12;
    return paint(w, h + 10, (p, g) => {
      p.rect(Math.floor(w / 2) - 1, h, 3, 10, dark ? '#6c665e' : '#5a4d44');
      p.rect(0, 0, w, h, dark ? '#d97757' : '#1a1614');
      p.rect(1, 1, w - 2, h - 2, '#1f1b18');
      p.rect(1, 1, w - 2, 5, '#3a332f');
      p.rect(3, 2, 2, 2, '#e06c5a');
      p.rect(6, 2, 2, 2, '#e3b341');
      p.rect(9, 2, 2, 2, '#5fb868');
      lines.forEach((l, i) => drawText(g, l, 5, 8 + i * 9, i === 0 ? '#ede6dc' : '#b9b0a4'));
    });
  });
}

const PROD_COLORS: Record<Theme, { body: string; roof: string; win: string; out: string }> = {
  terminal: { body: '#3b3633', roof: '#2b2623', win: '#1a1614', out: '#1a1614' },
  deps: { body: '#3a4566', roof: '#2a3452', win: '#121829', out: '#0b0e1a' },
  cloud: { body: '#e6ebf5', roof: '#c4cce0', win: '#3d4a63', out: '#7d88a3' },
  hangar: { body: '#4b4e57', roof: '#3a3d45', win: '#1a1b20', out: '#121316' },
};

function prod(theme: Theme, frame: number, open: boolean): Img {
  return cached(`prod|${theme}|${frame}|${open}`, () =>
    paint(84, 84, (p, g) => {
      const c = PROD_COLORS[theme];
      const ox = 2;
      const oy = 4;
      p.rect(ox + 39, oy, 2, 12, '#9c968c');
      p.rect(ox + 37, oy - 2, 6, 3, frame ? '#ff7a45' : '#8a3d27');
      p.rect(ox - 2, oy + 12, 84, 5, c.out);
      p.rect(ox - 1, oy + 13, 82, 3, c.roof);
      p.rect(ox, oy + 16, 80, 64, c.out);
      p.rect(ox + 1, oy + 17, 78, 63, c.body);
      for (let i = 0; i < 3; i++) {
        const wx = ox + 8 + i * 24;
        p.rect(wx, oy + 23, 16, 11, c.out);
        p.rect(wx + 1, oy + 24, 14, 9, c.win);
        for (let k = 0; k < 3; k++) {
          const on = (i + k + frame) % 3 !== 0;
          p.px(wx + 3 + k * 4, oy + 27, on ? '#5fd47a' : '#2f4a35');
          p.px(wx + 3 + k * 4, oy + 30, (i + k + frame) % 2 ? '#f2b84b' : '#4a3a20');
        }
      }
      p.rect(ox + 24, oy + 39, 32, 11, '#1a1614');
      p.rect(ox + 25, oy + 40, 30, 9, '#2e2926');
      drawText(g, 'PROD', ox + 29, oy + 41, '#d97757');
      p.rect(ox + 29, oy + 53, 22, 27, '#d97757');
      p.rect(ox + 31, oy + 55, 18, 25, open ? '#ffe2cf' : '#120f0d');
      if (!open) p.rect(ox + 45, oy + 67, 2, 2, '#d97757');
    }),
  );
}

export function drawDeco(g: CanvasRenderingContext2D, d: Deco, camX: number, theme: Theme, t: number, doorOpen: boolean): void {
  const x = Math.round(d.x - camX);
  const dark = theme !== 'terminal' && theme !== 'cloud';
  switch (d.kind) {
    case 'prod':
      g.drawImage(prod(theme, Math.floor(t * 2) % 2, doorOpen), x - 2, d.y - 4);
      break;
    case 'sign': {
      const img = signImg(d.text ?? [], dark);
      g.drawImage(img, x, d.y + 16 - img.height);
      break;
    }
    case 'duck':
      g.drawImage(duck(), x + 2, d.y + 6);
      break;
    case 'keys': {
      const labels = d.text ?? ['Y', 'N'];
      labels.forEach((l, i) => g.drawImage(keycap(l), x + i * 14, d.y + 3));
      break;
    }
    case 'rack':
      g.drawImage(rack(Math.floor(t * 3) % 3, dark), x, d.y - 16);
      break;
    default:
      break;
  }
}
