import { rainbow } from '../engine/color';
import { drawText, measure } from '../engine/font';
import * as Hero from '../art/hero';
import type { World } from './world';

const SHADOW = '#14110f';

/** Claude Code-style status line across the top of the screen. */
export function drawHud(g: CanvasRenderingContext2D, w: World, viewW: number): void {
  const s = w.session;
  const p = w.player;
  g.fillStyle = 'rgba(20, 17, 15, 0.62)';
  g.fillRect(0, 0, viewW, 15);
  g.fillStyle = 'rgba(217, 119, 87, 0.9)';
  g.fillRect(0, 15, viewW, 1);

  const y = 4;
  const parts: { w: number; draw: (x: number) => void }[] = [];

  const lives = `×${s.lives}`;
  parts.push({
    w: 10 + measure(lives),
    draw: (x) => {
      g.drawImage(Hero.mini(Hero.PALS.claude, 0, 1), x, y + 1);
      drawText(g, lives, x + 10, y, '#ffffff', { shadow: SHADOW });
    },
  });

  const score = String(Math.min(999999, s.score)).padStart(6, '0');
  parts.push({ w: measure(score), draw: (x) => drawText(g, score, x, y, '#ffffff', { shadow: SHADOW }) });

  const tok = `${s.tokens}K`;
  parts.push({
    w: 8 + measure(tok),
    draw: (x) => {
      drawText(g, '✻', x, y, '#f2b84b', { shadow: SHADOW });
      drawText(g, tok, x + 8, y, '#ffffff', { shadow: SHADOW });
    },
  });

  const ctxColor = p.context === 0 ? '#8fcb79' : p.context === 1 ? '#f2b84b' : '#e5736e';
  parts.push({
    w: measure('ctx') + 3 + 21,
    draw: (x) => {
      drawText(g, 'ctx', x, y, '#b9b0a4', { shadow: SHADOW });
      const bx = x + measure('ctx') + 3;
      for (let i = 0; i < 3; i++) {
        const filled = i < p.context;
        g.fillStyle = filled ? ctxColor : 'rgba(255,255,255,0.18)';
        g.fillRect(bx + i * 7, y + 1, 6, 6);
      }
      if (p.context === 2 && Math.floor(w.t * 4) % 2 === 0) {
        g.fillStyle = '#e5736e';
        g.fillRect(bx + 14, y + 1, 6, 6);
      }
    },
  });

  const lvl = w.level.id;
  parts.push({ w: measure(lvl), draw: (x) => drawText(g, lvl, x, y, '#d97757', { shadow: SHADOW }) });

  const t = String(Math.ceil(w.time));
  const low = w.time < 100;
  parts.push({
    w: 8 + measure(t),
    draw: (x) => {
      drawText(g, '⏱', x, y, low ? '#e5736e' : '#b9b0a4', { shadow: SHADOW });
      drawText(g, t, x + 8, y, low && Math.floor(w.t * 3) % 2 ? '#e5736e' : '#ffffff', { shadow: SHADOW });
    },
  });

  const total = parts.reduce((a, b) => a + b.w, 0);
  const gap = Math.max(6, Math.min(26, (viewW - 12 - total) / (parts.length - 1)));
  let x = Math.round((viewW - (total + gap * (parts.length - 1))) / 2);
  for (const part of parts) {
    part.draw(Math.round(x));
    x += part.w + gap;
  }

  // Bottom status line, like Claude Code's mode indicator.
  if (p.star > 0) {
    const text = '⏵⏵ bypass permissions on';
    let cx = 6;
    for (const ch of Array.from(text)) {
      drawText(g, ch, cx, 212, rainbow(w.t * 0.8 + cx / 120), { shadow: SHADOW });
      cx += 6;
    }
  } else if (w.slowmo > 0) {
    const text = 'ultrathink';
    let cx = 6;
    for (const ch of Array.from(text)) {
      drawText(g, ch, cx, 212, rainbow(w.t * 0.8 + cx / 60), { shadow: SHADOW });
      cx += 6;
    }
  } else if (p.form === 'agent') {
    drawText(g, '⏵ subagents ready (B / shift)', 6, 212, '#f3ede4', { shadow: SHADOW, alpha: 0.75 });
  }
}
