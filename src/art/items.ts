import { rainbow } from '../engine/color';
import { cached, paint, type Img } from '../engine/sprite';
import type { ItemKind } from '../game/entities/items';
import * as Hero from './hero';

/** Token coin with an engraved spark, 4 spin frames. */
export function token(frame: number): Img {
  return cached(`token|${frame}`, () =>
    paint(12, 14, (p) => {
      const widths = [10, 7, 2, 7];
      const w = widths[frame % 4];
      const rim = '#9a6216';
      const face = '#f2b84b';
      const light = '#ffe29a';
      const glyph = '#c98a2b';
      const cx = 6;
      for (let y = 0; y < 14; y++) {
        for (let x = 0; x < 12; x++) {
          const nx = (x + 0.5 - cx) / (w / 2 + 0.01);
          const ny = (y + 0.5 - 7) / 7;
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          p.px(x, y, d > 0.62 || w <= 2 ? rim : nx < -0.2 && ny < 0 ? light : face);
        }
      }
      if (w >= 7) {
        p.px(6, 4, glyph);
        p.rect(5, 5, 3, 1, glyph);
        p.rect(4, 6, 5, 2, glyph);
        p.rect(5, 8, 3, 1, glyph);
        p.px(6, 9, glyph);
        p.px(6, 6, light);
      }
    }),
  );
}

function opusChip(t: number): Img {
  const glow = Math.floor(t * 6) % 2;
  return cached(`opus|${glow}`, () =>
    paint(16, 16, (p) => {
      const pin = '#e8c26a';
      for (let i = 0; i < 3; i++) {
        p.rect(0, 4 + i * 3, 2, 1, pin);
        p.rect(14, 4 + i * 3, 2, 1, pin);
        p.rect(4 + i * 3, 1, 1, 2, pin);
        p.rect(4 + i * 3, 13, 1, 2, pin);
      }
      p.rect(2, 3, 12, 10, '#2f2050');
      p.rect(3, 3, 10, 10, '#5a3f8f');
      p.rect(3, 3, 10, 1, '#7c5fb8');
      p.rect(3, 3, 1, 10, '#7c5fb8');
      p.rect(5, 6, 6, 5, glow ? '#ffb38f' : '#d97757');
      p.rect(6, 7, 4, 3, glow ? '#ffffff' : '#f6c3ad');
      // Little eyes so it reads as a friendly power-up.
      p.px(6, 4, '#ffffff');
      p.px(9, 4, '#ffffff');
      p.px(6, 5, '#1a1030');
      p.px(9, 5, '#1a1030');
    }),
  );
}

function agentPack(t: number): Img {
  const f = Math.floor(t * 4) % 2;
  return cached(`agentpack|${f}`, () =>
    paint(16, 16, (p, g) => {
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
          if (r <= 7.5 && r > 6.5) p.px(x, y, '#9be7f0');
          else if (r <= 6.5) p.px(x, y, 'rgba(155,231,240,0.18)');
        }
      p.px(4, 4, '#ffffff');
      p.px(5, 3, '#ffffff');
      g.drawImage(Hero.mini(Hero.PALS.claude, f, 1), 4, 5 + f);
    }),
  );
}

function bypassKey(t: number): Img {
  const f = Math.floor(t * 10) % 6;
  return cached(`key|${f}`, () =>
    paint(16, 16, (p) => {
      const c = rainbow(f / 6);
      const gold = '#f2c14b';
      const dark = '#9a6216';
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const r = Math.hypot(x + 0.5 - 5, y + 0.5 - 8);
          if (r <= 4.6 && r >= 2.2) p.px(x, y, r > 3.9 ? dark : gold);
        }
      p.rect(9, 7, 7, 3, dark);
      p.rect(9, 8, 6, 1, gold);
      p.rect(12, 10, 2, 3, dark);
      p.rect(14, 10, 1, 2, dark);
      p.px(3, 6, '#ffffff');
      p.px(1, 1, c);
      p.px(14, 2, c);
      p.px(13, 14, c);
      p.px(2, 13, c);
    }),
  );
}

function compactScroll(): Img {
  return cached('compact', () =>
    paint(16, 16, (p) => {
      p.rect(2, 2, 12, 12, '#9c8b6e');
      p.rect(3, 3, 10, 10, '#f3ead7');
      p.rect(2, 1, 12, 2, '#d8c8a8');
      p.rect(2, 13, 12, 2, '#d8c8a8');
      p.rect(4, 6, 1, 1, '#d97757');
      p.rect(5, 7, 1, 1, '#d97757');
      p.rect(4, 8, 1, 1, '#d97757');
      p.rect(11, 6, 1, 1, '#d97757');
      p.rect(10, 7, 1, 1, '#d97757');
      p.rect(11, 8, 1, 1, '#d97757');
      p.rect(7, 7, 2, 1, '#6b5a44');
      p.rect(4, 11, 8, 1, '#c9b896');
    }),
  );
}

function ultrathinkOrb(t: number): Img {
  const f = Math.floor(t * 8) % 8;
  return cached(`ultra|${f}`, () =>
    paint(16, 16, (p) => {
      const blobs: [number, number, number][] = [
        [6, 8, 4.5],
        [10, 7, 4.2],
        [8, 5, 3.6],
      ];
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          let inside = false;
          let edge = false;
          for (const [bx, by, r] of blobs) {
            const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by);
            if (d <= r) inside = true;
            if (d <= r && d > r - 1.2) edge = true;
          }
          if (!inside) continue;
          p.px(x, y, edge ? rainbow(f / 8 + x / 16) : '#ffffff');
        }
      p.px(3, 13, rainbow(f / 8));
      p.px(1, 15, rainbow(f / 8 + 0.3));
      p.rect(7, 6, 2, 3, '#d97757');
      p.rect(6, 7, 4, 1, '#d97757');
    }),
  );
}

export function item(kind: ItemKind, t: number): Img {
  switch (kind) {
    case 'opus':
      return opusChip(t);
    case 'agent':
      return agentPack(t);
    case 'oneup':
      return Hero.clawd('small', 'idle', Hero.PALS.green, 1);
    case 'bypass':
      return bypassKey(t);
    case 'compact':
      return compactScroll();
    case 'ultrathink':
      return ultrathinkOrb(t);
  }
}

export function mini(frame: number, pal: 'agent' | 'green' | 'claude', dir: number): Img {
  const c = pal === 'agent' ? Hero.PALS.claude : pal === 'green' ? Hero.PALS.green : Hero.PALS.claude;
  return Hero.mini(c, frame, dir);
}
