import { hash2 } from '../engine/rng';
import { cached, paint, type Img, type Painter } from '../engine/sprite';
import type { Theme } from '../game/builder';
import { T, TILE } from '../game/tiles';
import type { World } from '../game/world';
import * as Items from './items';

interface GroundPal {
  fill: string;
  edge: string;
  top: [string, string, string];
  code: string[];
}

interface ThemeTiles {
  ground: GroundPal;
  brick: { base: string; light: string; dark: string; mortar: string; code: string };
  used: { base: string; border: string; light: string };
  hard: { base: string; light: string; dark: string; border: string };
  pipe: { base: string; light: string; dark: string; out: string };
}

export const TILE_THEMES: Record<Theme, ThemeTiles> = {
  terminal: {
    ground: {
      fill: '#2e2926',
      edge: '#1a1614',
      top: ['#f0e6d8', '#d97757', '#3a332f'],
      code: ['#4a413b', '#57493f', '#7a4a38', '#3f5a44', '#3d4a63', '#5a4b6b', '#4a413b'],
    },
    brick: { base: '#c8674a', light: '#e28f70', dark: '#8e3f2a', mortar: '#5e2a1c', code: '#f0a88c' },
    used: { base: '#8c7b6e', border: '#4a3f37', light: '#a89585' },
    hard: { base: '#9aa0ab', light: '#c7ccd4', dark: '#5f6570', border: '#3f444d' },
    pipe: { base: '#3e9c8f', light: '#8fe0d1', dark: '#22605a', out: '#133b36' },
  },
  deps: {
    ground: {
      fill: '#1f2740',
      edge: '#0d1222',
      top: ['#a9b8e8', '#5468a8', '#2a3452'],
      code: ['#2c375a', '#34406a', '#3b3f73', '#2f4a5e', '#4a3f6b', '#2c375a'],
    },
    brick: { base: '#4a5ba0', light: '#7083c8', dark: '#2f3b70', mortar: '#151a36', code: '#9fb0ec' },
    used: { base: '#3c4566', border: '#1b2036', light: '#525d84' },
    hard: { base: '#5a6788', light: '#8090b4', dark: '#3a4560', border: '#1e2538' },
    pipe: { base: '#2f8a7f', light: '#6fcfc0', dark: '#1a524b', out: '#0c2f2b' },
  },
  cloud: {
    ground: {
      fill: '#cdd5e6',
      edge: '#7d88a3',
      top: ['#ffffff', '#eef2fa', '#dbe1ee'],
      code: ['#b4bed4', '#b4bed4', '#aab5cc', '#5fd47a', '#b4bed4', '#f2b84b'],
    },
    brick: { base: '#c8674a', light: '#e28f70', dark: '#8e3f2a', mortar: '#5e2a1c', code: '#f0a88c' },
    used: { base: '#9aa3b8', border: '#5d6680', light: '#b8c0d2' },
    hard: { base: '#b9c2d6', light: '#e1e6f0', dark: '#8690a8', border: '#5d6680' },
    pipe: { base: '#3e9c8f', light: '#8fe0d1', dark: '#22605a', out: '#133b36' },
  },
  hangar: {
    ground: {
      fill: '#4b4e57',
      edge: '#22242a',
      top: ['#a8aeb9', '#7c808c', '#5c606a'],
      code: ['#3a3d45', '#3a3d45', '#565a64', '#3a3d45'],
    },
    brick: { base: '#7a3b3b', light: '#a35656', dark: '#4f2424', mortar: '#241010', code: '#c97b7b' },
    used: { base: '#5c4a4a', border: '#2a1e1e', light: '#7a6464' },
    hard: { base: '#6b6f7a', light: '#9ba0ab', dark: '#474a53', border: '#24262c' },
    pipe: { base: '#9a6a44', light: '#d6a676', dark: '#5e3d24', out: '#2e1c10' },
  },
};

export function brickColor(theme: Theme): string {
  return TILE_THEMES[theme].brick.base;
}

function codeLines(p: Painter, pal: GroundPal, seed: number, from: number, theme: Theme): void {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  if (theme === 'hangar') {
    p.px(2, from + 1, pal.code[0]);
    p.px(13, from + 1, pal.code[0]);
    p.px(2, 13, pal.code[0]);
    p.px(13, 13, pal.code[0]);
    p.rect(0, 15, 16, 1, pal.code[1]);
    if (seed % 3 === 0) p.rect(4, 8, 8, 1, pal.code[2]);
    return;
  }
  if (theme === 'cloud') {
    p.rect(2, from + 3, 12, 1, pal.code[0]);
    p.rect(2, from + 6, 12, 1, pal.code[1]);
    if (seed % 2 === 0) p.px(12, from + 1, pal.code[3]);
    if (seed % 3 === 0) p.px(10, from + 1, pal.code[5]);
    p.rect(2, 14, 12, 1, pal.code[2]);
    return;
  }
  for (let row = from + 1; row < 16; row += 4) {
    let x = Math.floor(rnd() * 4);
    while (x < 15) {
      const len = 2 + Math.floor(rnd() * 5);
      const col = pal.code[Math.floor(rnd() * pal.code.length)];
      p.rect(x, row, Math.min(len, 16 - x), 1, col);
      x += len + 1 + Math.floor(rnd() * 2);
      if (rnd() < 0.25) break;
    }
  }
}

function groundTile(theme: Theme, top: boolean, left: boolean, right: boolean, v: number): Img {
  return cached(`gr|${theme}|${+top}${+left}${+right}|${v}`, () =>
    paint(16, 16, (p) => {
      const pal = TILE_THEMES[theme].ground;
      p.rect(0, 0, 16, 16, pal.fill);
      codeLines(p, pal, v * 977 + 13, top ? 3 : 0, theme);
      if (top && theme === 'cloud') {
        p.g.clearRect(0, 0, 16, 6);
        p.rect(0, 2, 16, 4, '#ffffff');
        p.disc(4, 3.2, 3.3, '#ffffff');
        p.disc(12, 3.2, 3.3, '#ffffff');
        p.rect(0, 6, 16, 1, pal.top[2]);
        p.px(2, 1, '#ffffff');
        p.rect(0, 5, 16, 1, pal.top[1]);
      } else if (top) {
        p.rect(0, 0, 16, 1, pal.top[0]);
        p.rect(0, 1, 16, 1, pal.top[1]);
        p.rect(0, 2, 16, 1, pal.top[2]);
      }
      if (left) p.rect(0, 0, 1, 16, pal.edge);
      if (right) p.rect(15, 0, 1, 16, pal.edge);
      if (top && left && theme !== 'cloud') {
        p.g.clearRect(0, 0, 1, 1);
        p.px(1, 0, pal.top[1]);
      }
      if (top && right && theme !== 'cloud') {
        p.g.clearRect(15, 0, 1, 1);
        p.px(14, 0, pal.top[1]);
      }
    }),
  );
}

function brickTile(theme: Theme): Img {
  return cached(`brick|${theme}`, () =>
    paint(16, 16, (p) => {
      const b = TILE_THEMES[theme].brick;
      p.rect(0, 0, 16, 16, b.mortar);
      const rows: [number, number[]][] = [
        [0, [0, 8]],
        [8, [-4, 4, 12]],
      ];
      for (const [y, xs] of rows) {
        for (const x0 of xs) {
          const x = Math.max(0, x0);
          const w = Math.min(x0 + 8, 16) - x - 1;
          if (w <= 0) continue;
          p.rect(x, y, w, 7, b.base);
          p.rect(x, y, w, 1, b.light);
          p.rect(x, y + 6, w, 1, b.dark);
          if (w > 4) p.rect(x + 2, y + 3, Math.min(4, w - 3), 1, b.code);
        }
      }
    }),
  );
}

function promptTile(frame: number): Img {
  return cached(`prompt|${frame}`, () =>
    paint(16, 16, (p) => {
      const glow = [0, 1, 2, 1][frame % 4];
      p.rect(0, 0, 16, 16, '#6b2f1f');
      p.rect(1, 1, 14, 14, '#d97757');
      p.rect(1, 1, 14, 1, '#f0a485');
      p.rect(1, 1, 1, 14, '#f0a485');
      p.rect(14, 2, 1, 13, '#b35a3e');
      p.rect(2, 14, 13, 1, '#b35a3e');
      p.px(2, 2, '#6b2f1f');
      p.px(13, 2, '#6b2f1f');
      p.px(2, 13, '#6b2f1f');
      p.px(13, 13, '#6b2f1f');
      const c = glow === 2 ? '#ffffff' : glow === 1 ? '#fff4e8' : '#ffe2cf';
      // ">" glyph.
      p.px(4, 5, c);
      p.px(5, 6, c);
      p.px(6, 7, c);
      p.px(5, 8, c);
      p.px(4, 9, c);
      p.px(5, 5, '#8a3d27');
      p.px(6, 6, '#8a3d27');
      p.px(7, 7, '#8a3d27');
      p.px(6, 8, '#8a3d27');
      p.px(5, 9, '#8a3d27');
      // Blinking "_" cursor.
      if (frame % 4 !== 3) {
        p.rect(8, 9, 4, 1, c);
        p.rect(9, 10, 4, 1, '#8a3d27');
      }
    }),
  );
}

function usedTile(theme: Theme): Img {
  return cached(`used|${theme}`, () =>
    paint(16, 16, (p) => {
      const u = TILE_THEMES[theme].used;
      p.rect(0, 0, 16, 16, u.border);
      p.rect(1, 1, 14, 14, u.base);
      p.rect(1, 1, 14, 1, u.light);
      p.px(2, 2, u.border);
      p.px(13, 2, u.border);
      p.px(2, 13, u.border);
      p.px(13, 13, u.border);
      p.rect(8, 9, 4, 1, u.light);
    }),
  );
}

function hardTile(theme: Theme, led: number): Img {
  return cached(`hard|${theme}|${led}`, () =>
    paint(16, 16, (p) => {
      const h = TILE_THEMES[theme].hard;
      p.rect(0, 0, 16, 16, h.border);
      p.rect(1, 1, 14, 14, h.base);
      p.rect(1, 1, 14, 1, h.light);
      p.rect(1, 1, 1, 14, h.light);
      p.rect(14, 2, 1, 13, h.dark);
      p.rect(2, 14, 13, 1, h.dark);
      p.rect(3, 9, 8, 1, h.dark);
      p.rect(3, 11, 8, 1, h.dark);
      p.rect(11, 3, 2, 1, led === 0 ? '#5fd47a' : led === 1 ? '#f2b84b' : '#3a3f48');
    }),
  );
}

const PIPE_X = (x: number, w: number, c: ThemeTiles['pipe']): string => {
  if (x === 0 || x === w - 1) return c.out;
  if (x <= 3) return c.light;
  if (x >= w - 5) return c.dark;
  if (x === 5) return c.light;
  return c.base;
};

function pipeTile(theme: Theme, kind: number): Img {
  return cached(`pipe|${theme}|${kind}`, () =>
    paint(16, 16, (p) => {
      const c = TILE_THEMES[theme].pipe;
      const isTop = kind === T.PIPE_TL || kind === T.PIPE_TR;
      const isLeft = kind === T.PIPE_TL || kind === T.PIPE_L;
      if (isTop) {
        for (let x = 0; x < 16; x++) {
          const gx = isLeft ? x : x + 16;
          p.rect(x, 0, 1, 14, PIPE_X(gx, 32, c));
        }
        p.rect(0, 0, 16, 1, c.out);
        p.rect(0, 13, 16, 1, c.out);
        for (let x = 0; x < 16; x++) {
          const gx = (isLeft ? x : x + 16) - 2;
          if (gx < 0 || gx > 27) continue;
          p.rect(x, 14, 1, 2, PIPE_X(gx, 28, c));
        }
        if (isLeft) p.rect(3, 4, 1, 6, '#ffffff');
      } else {
        for (let x = 0; x < 16; x++) {
          const gx = (isLeft ? x : x + 16) - 2;
          if (gx < 0 || gx > 27) continue;
          p.rect(x, 0, 1, 16, PIPE_X(gx, 28, c));
        }
      }
    }),
  );
}

function onewayTile(theme: Theme, part: 'l' | 'm' | 'r' | 's'): Img {
  return cached(`oneway|${theme}|${part}`, () =>
    paint(16, 16, (p) => {
      const dark = theme !== 'terminal' && theme !== 'cloud';
      const bar = dark ? '#c9c3b8' : '#ede6dc';
      const edge = dark ? '#6c665e' : '#8c8279';
      p.rect(0, 0, 16, 6, bar);
      p.rect(0, 0, 16, 1, '#ffffff');
      p.rect(0, 5, 16, 1, edge);
      p.rect(0, 6, 16, 1, 'rgba(0,0,0,0.25)');
      if (part === 'l' || part === 's') {
        p.rect(0, 0, 1, 6, edge);
        p.rect(3, 2, 2, 2, '#e06c5a');
        p.rect(7, 2, 2, 2, '#e3b341');
        p.rect(11, 2, 2, 2, '#5fb868');
      }
      if (part === 'r' || part === 's') p.rect(15, 0, 1, 6, edge);
    }),
  );
}

function lavaTile(top: boolean, frame: number): Img {
  return cached(`lava|${top}|${frame}`, () =>
    paint(16, 16, (p) => {
      p.rect(0, 0, 16, 16, '#c42b33');
      for (let i = 0; i < 5; i++) {
        const x = (i * 7 + frame * 3) % 16;
        const y = ((i * 5 + frame * 2) % 14) + 2;
        p.rect(x, y, 2, 1, '#e5484d');
        p.px((x + 9) % 16, (y + 6) % 16, '#8f1d24');
      }
      if (top) {
        p.g.clearRect(0, 0, 16, 4);
        for (let x = 0; x < 16; x++) {
          const h = 2 + Math.round(Math.sin((x + frame * 2) * 0.8) * 1.4);
          p.rect(x, 4 - h, 1, h, '#ff6b4a');
          p.px(x, 4 - h, '#ffb36b');
        }
        p.rect(0, 4, 16, 1, '#ff6b4a');
      }
    }),
  );
}

export function drawTiles(g: CanvasRenderingContext2D, w: World, camX: number): void {
  const map = w.map;
  const theme = w.level.theme;
  const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const tx1 = Math.min(map.w - 1, Math.floor((camX + w.viewW) / TILE) + 1);
  const promptFrame = Math.floor(w.t * 4) % 4;
  const tokenFrame = Math.floor(w.t * 7) % 4;
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = map.tiles[ty * map.w + tx];
      if (t === T.EMPTY || t === T.HIDDEN || t === T.BARRIER || t === T.INVIS) continue;
      const x = tx * TILE - camX;
      let y = ty * TILE;
      const bump = w.bumps.get(ty * map.w + tx);
      if (bump !== undefined) y -= Math.round(Math.sin(Math.min(1, bump / 0.16) * Math.PI) * 5);
      let img: Img;
      switch (t) {
        case T.GROUND: {
          const above = map.get(tx, ty - 1);
          const top = ty === 0 ? false : above !== T.GROUND;
          const left = tx > 0 && map.get(tx - 1, ty) !== T.GROUND;
          const right = tx < map.w - 1 && map.get(tx + 1, ty) !== T.GROUND;
          img = groundTile(theme, top, left, right, Math.floor(hash2(tx, ty, 3) * 4));
          break;
        }
        case T.BRICK:
          img = brickTile(theme);
          break;
        case T.PROMPT:
          img = promptTile(promptFrame);
          break;
        case T.USED:
          img = usedTile(theme);
          break;
        case T.HARD: {
          const r = hash2(tx, ty, 9);
          const led = r < 0.5 ? 2 : Math.floor(w.t * 2 + r * 10) % 3;
          img = hardTile(theme, led);
          break;
        }
        case T.PIPE_TL:
        case T.PIPE_TR:
        case T.PIPE_L:
        case T.PIPE_R:
          img = pipeTile(theme, t);
          break;
        case T.ONEWAY: {
          const l = map.get(tx - 1, ty) === T.ONEWAY;
          const r = map.get(tx + 1, ty) === T.ONEWAY;
          img = onewayTile(theme, l && r ? 'm' : l ? 'r' : r ? 'l' : 's');
          break;
        }
        case T.LAVA:
          img = lavaTile(map.get(tx, ty - 1) !== T.LAVA, Math.floor(w.t * 6) % 4);
          break;
        case T.TOKEN:
          g.drawImage(Items.token(tokenFrame), Math.round(x + 2), y + 1);
          continue;
        default:
          continue;
      }
      g.drawImage(img, Math.round(x), y);
    }
  }
}

/** A scrolling strip of ground, used behind the title screen. */
export function drawGroundStrip(g: CanvasRenderingContext2D, theme: Theme, camX: number, viewW: number, topRow: number): void {
  const off = Math.floor(camX) % TILE;
  const first = Math.floor(camX / TILE);
  for (let ty = topRow; ty < 14; ty++) {
    for (let i = -1; i <= Math.ceil(viewW / TILE); i++) {
      const tx = first + i;
      g.drawImage(groundTile(theme, ty === topRow, false, false, Math.floor(hash2(tx, ty, 3) * 4)), i * TILE - off, ty * TILE);
    }
  }
}
