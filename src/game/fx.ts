import { drawText } from '../engine/font';
import { rainbow } from '../engine/color';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: number;
  size: number;
  color: string;
  char?: string;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  rainbow: boolean;
}

/** Particles and floating score text. Pure data + canvas drawing. */
export class Fx {
  parts: Particle[] = [];
  popups: Popup[] = [];
  private seed = 1;

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  add(p: Partial<Particle> & { x: number; y: number }): void {
    this.parts.push({ vx: 0, vy: 0, life: 0.5, g: 0, size: 1, color: '#ffffff', ...p, max: p.life ?? 0.5 });
  }

  /** Four brick chunks flying out. */
  debris(x: number, y: number, color: string): void {
    const v: [number, number][] = [
      [-70, -330],
      [70, -330],
      [-60, -220],
      [60, -220],
    ];
    v.forEach(([vx, vy], i) => this.add({ x: x + (i % 2) * 8, y: y + (i < 2 ? 0 : 8), vx, vy, g: 1100, life: 1.2, size: 4, color }));
  }

  dust(x: number, y: number, n = 3, color = '#cfc6b8'): void {
    for (let i = 0; i < n; i++)
      this.add({ x: x + (this.rand() - 0.5) * 8, y, vx: (this.rand() - 0.5) * 60, vy: -20 - this.rand() * 30, life: 0.35, size: 2, color });
  }

  puff(x: number, y: number, color = '#ffffff'): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.add({ x, y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 0.3, size: 2, color });
    }
  }

  sparkle(x: number, y: number, n = 6, color = '#ffe29a'): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = 30 + this.rand() * 70;
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + this.rand() * 0.3, size: 1, color });
    }
  }

  glyphs(x: number, y: number, chars: string, color: string, n = 8): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = 40 + this.rand() * 90;
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 60,
        g: 300,
        life: 1 + this.rand(),
        color,
        char: chars[i % chars.length],
      });
    }
  }

  popup(text: string, x: number, y: number, color = '#ffffff', life = 0.8, rainbowText = false): void {
    this.popups.push({ x, y, text, color, t: 0, life, rainbow: rainbowText });
  }

  update(dt: number): void {
    for (const p of this.parts) {
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.popups) p.t += dt;
    this.popups = this.popups.filter((p) => p.t < p.life);
  }

  draw(g: CanvasRenderingContext2D, camX: number, time: number, popups = true): void {
    for (const p of this.parts) {
      const x = Math.round(p.x - camX);
      const y = Math.round(p.y);
      if (p.char) {
        drawText(g, p.char, x, y, p.color, { alpha: Math.min(1, p.life / 0.4) });
        continue;
      }
      g.globalAlpha = Math.min(1, (p.life / p.max) * 2);
      g.fillStyle = p.color;
      g.fillRect(x, y, p.size, p.size);
    }
    g.globalAlpha = 1;
    if (!popups) return;
    for (const p of this.popups) {
      const rise = Math.min(1, p.t / 0.5) * 18;
      const color = p.rainbow ? rainbow(time * 1.5) : p.color;
      drawText(g, p.text, Math.round(p.x - camX), Math.round(p.y - rise), color, {
        align: 'center',
        outline: '#1a1614',
        alpha: p.t > p.life - 0.2 ? (p.life - p.t) / 0.2 : 1,
      });
    }
  }
}
