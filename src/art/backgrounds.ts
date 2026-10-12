import { drawText, measure } from '../engine/font';
import { Rng } from '../engine/rng';
import { cached, paint, type Img, type Painter } from '../engine/sprite';
import type { Theme } from '../game/builder';

const H = 224;

const GRADIENTS: Record<Theme, [number, string][]> = {
  terminal: [
    [0, '#f1dcc5'],
    [0.55, '#f8ecdd'],
    [1, '#fbf5ec'],
  ],
  deps: [
    [0, '#090b16'],
    [1, '#161c33'],
  ],
  cloud: [
    [0, '#171b45'],
    [0.45, '#3f3778'],
    [0.8, '#8d5d97'],
    [1, '#d88b97'],
  ],
  hangar: [
    [0, '#120809'],
    [1, '#2a1215'],
  ],
};

function gradient(theme: Theme): Img {
  return cached(`grad|${theme}`, () =>
    paint(1, H, (_p, g) => {
      const lg = g.createLinearGradient(0, 0, 0, H);
      for (const [o, c] of GRADIENTS[theme]) lg.addColorStop(o, c);
      g.fillStyle = lg;
      g.fillRect(0, 0, 1, H);
    }),
  );
}

function roundRect(p: Painter, x: number, y: number, w: number, h: number, c: string): void {
  p.rect(x + 1, y, w - 2, h, c);
  p.rect(x, y + 1, w, h - 2, c);
}

// ---------------------------------------------------------------- terminal (1-1)

function terminalFar(): Img {
  return cached('far|terminal', () =>
    paint(512, H, (p) => {
      const rng = new Rng(42);
      let x = -20;
      while (x < 512) {
        const w = rng.int(72, 116);
        const h = rng.int(56, 118);
        const y = 204 - h;
        roundRect(p, x, y, w, h, '#e2d1bd');
        roundRect(p, x + 1, y + 1, w - 2, h - 2, '#ebdccb');
        p.rect(x + 1, y + 1, w - 2, 8, '#e0cdb7');
        p.rect(x + 4, y + 4, 2, 2, '#e3a596');
        p.rect(x + 8, y + 4, 2, 2, '#e8cf9a');
        p.rect(x + 12, y + 4, 2, 2, '#b9d3a6');
        for (let ly = y + 13; ly < y + h - 6; ly += 6) {
          let lx = x + 5 + rng.int(0, 2) * 4;
          while (lx < x + w - 8) {
            const len = rng.int(3, 14);
            const r = rng.next();
            const col = r < 0.12 ? '#e0ac95' : r < 0.2 ? '#c4d2b3' : r < 0.26 ? '#c3c7dc' : '#dccab4';
            p.rect(lx, ly, Math.min(len, x + w - 6 - lx), 2, col);
            lx += len + 3;
            if (rng.next() < 0.3) break;
          }
        }
        x += w - rng.int(4, 20);
      }
    }),
  );
}

const VERBS = [
  'Thinking…',
  'Pondering…',
  'Clauding…',
  'Noodling…',
  'Reticulating…',
  'Combobulating…',
  'Spelunking…',
  'Vibing…',
  'Puzzling…',
];
const SPIN = ['✻', '*', '+', '·', '+', '*'];

function cloudPill(w: number, dark: boolean): Img {
  return cached(`pill|${w}|${dark}`, () =>
    paint(w, 16, (p) => {
      const body = dark ? '#2a2f52' : '#ffffff';
      const shadow = dark ? '#20243f' : '#f0e2d2';
      roundRect(p, 0, 2, w, 13, shadow);
      roundRect(p, 0, 0, w, 13, body);
      p.rect(3, 0, w - 6, 1, dark ? '#353b66' : '#ffffff');
    }),
  );
}

function thinkingClouds(g: CanvasRenderingContext2D, camX: number, viewW: number, t: number, dark: boolean): void {
  const span = 1400;
  const off = camX * 0.45;
  for (let i = 0; i < 7; i++) {
    const verb = VERBS[i % VERBS.length];
    const text = `${SPIN[Math.floor(t * 8 + i) % SPIN.length]} ${verb}`;
    const w = measure(text) + 14;
    const base = i * 200 + (i % 2) * 40;
    let x = ((((base - off) % span) + span) % span) - 120;
    x = Math.round(x);
    if (x > viewW || x + w < 0) continue;
    const y = 22 + ((i * 37) % 3) * 17 + Math.round(Math.sin(t * 0.7 + i) * 1.5);
    g.drawImage(cloudPill(w, dark), x, y);
    drawText(g, text, x + 7, y + 3, dark ? '#7f86b8' : '#c08a6e');
  }
}

// ---------------------------------------------------------------- node_modules (1-2)

function depsFar(): Img {
  return cached('far|deps', () =>
    paint(512, H, (p, g) => {
      const rng = new Rng(7);
      for (let i = 0; i < 9; i++) {
        const x = rng.int(0, 480);
        const y = rng.int(20, 170);
        if (rng.next() < 0.5) {
          // Folder.
          const w = rng.int(28, 48);
          const h = Math.round(w * 0.7);
          p.rect(x, y, Math.round(w * 0.4), 4, '#151c33');
          p.rect(x, y + 3, w, h, '#151c33');
          p.rect(x + 1, y + 5, w - 2, 1, '#1b2340');
        } else {
          // Package box.
          const s = rng.int(18, 30);
          p.rect(x, y, s, s, '#141a30');
          p.rect(x, y + 5, s, 1, '#1b2340');
          p.rect(x + Math.round(s / 2) - 2, y, 4, 6, '#1b2340');
        }
      }
      // Dependency tree lines.
      g.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const x = 30 + i * 125;
        const y = 40 + (i % 2) * 50;
        p.rect(x, y, 1, 60, '#1a2240');
        for (let k = 0; k < 4; k++) p.rect(x, y + 6 + k * 16, 10, 1, '#1a2240');
      }
      drawText(g, 'node_modules/', 40, 150, '#1b2342', { scale: 2 });
      drawText(g, '|-- .bin/', 300, 30, '#1a2240');
      drawText(g, '`-- .cache/', 300, 40, '#1a2240');
    }),
  );
}

const PKGS = ['lodash/', 'left-pad/', 'react/', 'is-odd/', 'is-even/', 'chalk/', 'debug/', 'ms/', 'semver/'];

function depsMid(g: CanvasRenderingContext2D, camX: number, viewW: number, t: number): void {
  const span = 1200;
  const off = camX * 0.4;
  PKGS.forEach((name, i) => {
    const x = Math.round(((((i * 140 - off) % span) + span) % span) - 100);
    if (x > viewW || x < -80) return;
    const y = 30 + ((i * 53) % 120) + Math.round(Math.sin(t * 0.5 + i) * 2);
    drawText(g, name, x, y, '#2a3558');
  });
}

// ---------------------------------------------------------------- the cloud (1-3)

function cloudFar(): Img {
  return cached('far|cloud', () =>
    paint(512, H, (p) => {
      const rng = new Rng(3);
      const blobs = (base: number, color: string, n: number, rMin: number, rMax: number) => {
        for (let i = 0; i < n; i++) {
          const cx = rng.int(-20, 532);
          const r = rng.int(rMin, rMax);
          p.disc(cx, base + rng.int(-6, 10), r, color);
        }
        p.rect(0, base + 6, 512, H - base, color);
      };
      blobs(160, '#4a3f80', 14, 18, 34);
      blobs(184, '#6a5294', 16, 14, 26);
      blobs(204, '#9a6aa0', 18, 10, 20);
    }),
  );
}

function stars(g: CanvasRenderingContext2D, camX: number, viewW: number, t: number): void {
  const span = 900;
  const off = camX * 0.08;
  for (let i = 0; i < 60; i++) {
    const x = Math.round((((i * 97) % span) - off + span * 4) % span);
    if (x > viewW) continue;
    const y = (i * 53) % 110;
    const tw = Math.sin(t * 2 + i * 1.7);
    g.fillStyle = tw > 0.6 ? '#ffffff' : '#b8b4e0';
    g.fillRect(x, y, 1, 1);
  }
}

function puff(w: number): Img {
  return cached(`puff|${w}`, () =>
    paint(w, Math.round(w * 0.45), (p) => {
      const h = Math.round(w * 0.45);
      const rng = new Rng(w);
      const n = 3 + (w % 3);
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) / n) * w;
        const r = Math.min(h * 0.55, w / (n * 0.9)) * (0.75 + rng.next() * 0.35);
        p.disc(cx, h - r, r, '#e9dcf3');
      }
      p.rect(Math.round(w * 0.1), h - 3, Math.round(w * 0.8), 3, '#e9dcf3');
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) / n) * w;
        p.rect(Math.round(cx - 2), h - 2, 5, 1, '#cbb6dd');
      }
    }),
  );
}

function cloudMid(g: CanvasRenderingContext2D, camX: number, viewW: number, t: number): void {
  const span = 1300;
  const off = camX * 0.5 + t * 4;
  for (let i = 0; i < 6; i++) {
    const w = 40 + ((i * 29) % 40);
    const x = Math.round(((((i * 230 - off) % span) + span) % span) - 100);
    if (x > viewW || x + w < 0) continue;
    const y = 30 + ((i * 41) % 80);
    g.globalAlpha = 0.5;
    g.drawImage(puff(w), x, y);
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- hangar (1-4)

function hangarFar(): Img {
  return cached('far|hangar', () =>
    paint(512, H, (p, g) => {
      for (let x = 0; x < 512; x += 64) {
        p.rect(x + 10, 0, 6, H, '#1d0d10');
        p.rect(x + 11, 0, 1, H, '#26121a');
      }
      p.rect(0, 70, 512, 2, '#2e1418');
      const stages = ['build', 'lint', 'test', 'deploy'];
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 84;
        const st = i % 4;
        const color = st === 2 ? '#7a2328' : st === 3 ? '#6b5320' : '#2f5a35';
        p.disc(x, 71, 7, '#1a0c0f');
        p.disc(x, 71, 6, color);
        drawText(g, stages[st], x - 14, 82, '#4a2a2e');
        drawText(g, st === 2 ? '✗' : st === 3 ? '·' : '✓', x - 2, 67, '#1a0c0f');
      }
      for (let x = 0; x < 512; x += 8) {
        p.rect(x, 172, 4, 6, '#3a2810');
        p.rect(x + 4, 172, 4, 6, '#1a1008');
      }
    }),
  );
}

function hangarMid(g: CanvasRenderingContext2D, camX: number, viewW: number, t: number): void {
  const span = 1000;
  const off = camX * 0.5;
  for (let i = 0; i < 6; i++) {
    const x = Math.round(((((i * 170 - off) % span) + span) % span) - 50);
    if (x > viewW || x < -20) continue;
    const on = Math.floor(t * 2 + i * 0.7) % 2 === 0;
    g.fillStyle = '#3a1a1e';
    g.fillRect(x + 3, 0, 1, 18);
    g.fillStyle = on ? '#ff4d4d' : '#6b1f24';
    g.fillRect(x, 18, 7, 5);
    if (on) {
      g.globalAlpha = 0.18;
      g.fillRect(x - 6, 14, 19, 14);
      g.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------- entry

export function drawBackground(g: CanvasRenderingContext2D, theme: Theme, camX: number, viewW: number, t: number, mid = true): void {
  g.drawImage(gradient(theme), 0, 0, viewW, H);
  const far = theme === 'terminal' ? terminalFar() : theme === 'deps' ? depsFar() : theme === 'cloud' ? cloudFar() : hangarFar();
  if (theme === 'cloud') stars(g, camX, viewW, t);
  const fx = -Math.round((camX * 0.2) % 512);
  for (let x = fx - 512; x < viewW; x += 512) if (x + 512 > 0) g.drawImage(far, x, 0);
  if (!mid) return;
  if (theme === 'terminal') thinkingClouds(g, camX, viewW, t, false);
  else if (theme === 'deps') depsMid(g, camX, viewW, t);
  else if (theme === 'cloud') cloudMid(g, camX, viewW, t);
  else hangarMid(g, camX, viewW, t);
}

/** Title-screen backdrop: the 1-1 sky with drifting thinking clouds. */
export function drawTitleBackground(g: CanvasRenderingContext2D, viewW: number, t: number): void {
  drawBackground(g, 'terminal', t * 20, viewW, t, false);
}
