import { drawText } from '../../engine/font';
import * as Props from '../../art/props';
import { T, TILE } from '../tiles';
import type { World } from '../world';
import { Entity } from './base';

/** Floating platform. Moves sideways, up and down, or crumbles ("broken build") after you land on it. */
export class Platform extends Entity {
  isPlatform = true;
  mode: 'move-h' | 'move-v' | 'fall';
  ox: number;
  oy: number;
  range: number;
  speed: number;
  t: number;
  dx = 0;
  dy = 0;
  tiles: number;
  standT = -1;
  falling = false;
  respawn = 0;

  constructor(x: number, y: number, o: { mode: Platform['mode']; tiles: number; range: number; speed: number; phase: number }) {
    super(x, y);
    this.mode = o.mode;
    this.tiles = o.tiles;
    this.w = o.tiles * TILE;
    this.h = 8;
    this.ox = x;
    this.oy = y;
    this.range = o.range;
    this.speed = o.speed;
    this.t = o.phase;
    this.slowable = false;
  }

  update(_w: World, dt: number): void {
    const px = this.x;
    const py = this.y;
    let teleported = false;
    if (this.mode === 'move-h' || this.mode === 'move-v') {
      this.t += dt;
      const omega = (Math.PI * this.speed) / Math.max(this.range, 1);
      const off = (this.range / 2) * (1 - Math.cos(this.t * omega));
      if (this.mode === 'move-h') this.x = this.ox + off;
      else this.y = this.oy + off;
    } else if (this.respawn > 0) {
      this.respawn -= dt;
      if (this.respawn <= 0) {
        this.x = this.ox;
        this.y = this.oy;
        this.falling = false;
        this.standT = -1;
        this.vy = 0;
        teleported = true;
      }
    } else if (this.falling) {
      this.vy = Math.min(this.vy + 900 * dt, 420);
      this.y += this.vy * dt;
      if (this.y > 14 * TILE + 32) this.respawn = 2.5;
    } else if (this.standT >= 0) {
      this.standT += dt;
      if (this.standT > 0.4) this.falling = true;
    }
    this.dx = teleported ? 0 : this.x - px;
    this.dy = teleported ? 0 : this.y - py;
  }

  onStand(): void {
    if (this.mode === 'fall' && this.standT < 0) this.standT = 0;
  }

  get solid(): boolean {
    return !(this.mode === 'fall' && this.respawn > 0);
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    if (!this.solid) return;
    const crumble = this.mode === 'fall';
    const shake = crumble && this.standT >= 0 && !this.falling ? (Math.floor(this.standT * 30) % 2 ? 1 : 0) : 0;
    g.drawImage(Props.platform(this.tiles, w.level.theme, crumble), Math.round(this.x - camX + shake), Math.round(this.y));
  }
}

/** git commit checkpoint: respawn here after dying. */
export class Checkpoint extends Entity {
  reached = false;
  hash: string;
  t = 0;

  constructor(x: number, y: number, seed: number) {
    super(x, y);
    this.w = 8;
    this.h = 32;
    this.x = x + 4;
    this.y = y + 16 - this.h;
    this.hash = ((seed * 2654435761) >>> 0).toString(16).padStart(8, '0').slice(0, 7);
    this.slowable = false;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    if (!this.reached && w.player.state === 'play' && w.player.x + w.player.w > this.x) {
      this.reached = true;
      w.reachCheckpoint(this);
    }
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    g.drawImage(Props.checkpoint(this.reached, Math.floor(this.t * 6) % 2), Math.round(this.x - 2 - camX), Math.round(this.y));
    if (this.reached && this.t < 99) {
      drawText(g, this.hash, Math.round(this.cx - camX), Math.round(this.y - 10), w.dark ? '#8fcb79' : '#3d8c3a', {
        align: 'center',
        alpha: 0.9,
      });
    }
  }
}

/** Goal: a test-runner flagpole. The flag flips from ✗ to ✓ when Clawd slides down. */
export class Flagpole extends Entity {
  poleX: number;
  topY: number;
  bottomY: number;
  flagY: number;
  passed = false;
  t = 0;

  constructor(x: number, y: number) {
    super(x, y);
    this.poleX = x + 7;
    this.bottomY = y;
    this.topY = y - 9 * TILE;
    this.flagY = this.topY + 8;
    this.x = this.poleX - 2;
    this.y = this.topY;
    this.w = 6;
    this.h = this.bottomY - this.topY;
    this.slowable = false;
  }

  update(_w: World, dt: number): void {
    this.t += dt;
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const px = Math.round(this.poleX - camX);
    g.fillStyle = '#d6d0c6';
    g.fillRect(px, this.topY + 6, 2, this.bottomY - this.topY - 6);
    g.fillStyle = '#9c968c';
    g.fillRect(px + 1, this.topY + 6, 1, this.bottomY - this.topY - 6);
    g.drawImage(Props.poleTop(Math.floor(this.t * 6) % 4), px - 3, this.topY - 2);
    g.drawImage(Props.flag(this.passed, Math.floor(this.t * 5) % 2), px - 18, Math.round(this.flagY));
  }
}

/** "Allow this command?" — a permission gate. Answer the prompt to pass. */
export class Gate extends Entity {
  cmd: string;
  safe: boolean;
  tx: number;
  base: number;
  state: 'closed' | 'prompt' | 'open' | 'trapped' = 'closed';
  openT = 0;
  cooldown = 0;
  t = 0;

  constructor(x: number, y: number, o: { cmd: string; safe: boolean; base: number }) {
    super(x, y);
    this.cmd = o.cmd;
    this.safe = o.safe;
    this.tx = Math.round(x / TILE);
    this.base = o.base;
    this.w = 16;
    this.h = (o.base - 2) * TILE;
    this.slowable = false;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.state === 'open') this.openT += dt;
    const p = w.player;
    if (this.state === 'closed' && this.cooldown <= 0 && p.state === 'play' && p.x + p.w > this.x - 18 && p.x < this.x) {
      this.state = 'prompt';
      w.requestGate(this);
    }
  }

  /** Called by the game once the player answers. */
  resolve(w: World, accepted: boolean): void {
    if (accepted === this.safe) {
      this.state = 'open';
      this.openT = 0;
      for (let y = 0; y < this.base; y++) if (w.map.get(this.tx, y) === T.BARRIER) w.map.set(this.tx, y, T.EMPTY);
      w.sfx(this.safe ? 'gate' : 'checkpoint');
      w.popup(this.safe ? '✓ ALLOWED' : 'GOOD CALL', this.x + 8, this.y + 24, '#8fcb79', 1.4);
      return;
    }
    if (!accepted) {
      // Said no to a safe command: nothing happens, ask again later.
      this.state = 'closed';
      this.cooldown = 3;
      w.popup('DENIED', this.x - 8, this.y + 40, '#e5736e', 1.2);
      return;
    }
    // Approved a dangerous command: the floor under you is deleted.
    this.state = 'trapped';
    w.rmrf(this);
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    const lift = this.state === 'open' ? Math.min(1, this.openT / 0.6) * this.h : 0;
    if (lift >= this.h) return;
    const img = Props.gate(this.h, this.safe, Math.floor(this.t * 3) % 2, w.dark);
    g.drawImage(
      img,
      0,
      lift,
      img.width,
      img.height - lift,
      Math.round(this.x - 2 - camX),
      Math.round(this.y),
      img.width,
      img.height - lift,
    );
  }
}

/** 429 Too Many Requests: a wall that opens after a countdown. */
export class RateLimit extends Entity {
  seconds: number;
  remaining: number;
  tx: number;
  base: number;
  state: 'idle' | 'counting' | 'open' = 'idle';
  openT = 0;
  t = 0;

  constructor(x: number, y: number, o: { seconds: number; base: number }) {
    super(x, y);
    this.seconds = o.seconds;
    this.remaining = o.seconds;
    this.tx = Math.round(x / TILE);
    this.base = o.base;
    this.w = 16;
    this.h = (o.base - 2) * TILE;
    this.slowable = false;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    const p = w.player;
    if (this.state === 'idle' && p.state === 'play' && p.x + p.w > this.x - 40 && p.x < this.x) {
      this.state = 'counting';
      w.sfx('beep');
      w.popup('429 TOO MANY REQUESTS', this.x + 8, this.y + 10, '#e5736e', 1.6);
    } else if (this.state === 'counting') {
      const before = Math.ceil(this.remaining);
      this.remaining -= dt;
      if (Math.ceil(this.remaining) !== before && this.remaining > 0) w.sfx('tick');
      if (this.remaining <= 0) {
        this.state = 'open';
        for (let y = 0; y < this.base; y++) if (w.map.get(this.tx, y) === T.BARRIER) w.map.set(this.tx, y, T.EMPTY);
        w.sfx('gate');
        w.popup('200 OK', this.x + 8, this.y + 60, '#8fcb79', 1.2);
      }
    }
    if (this.state === 'open') this.openT += dt;
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    const lift = this.state === 'open' ? Math.min(1, this.openT / 0.6) * this.h : 0;
    if (lift >= this.h) return;
    const img = Props.rateWall(this.h, w.dark);
    const x = Math.round(this.x - 2 - camX);
    g.drawImage(img, 0, lift, img.width, img.height - lift, x, Math.round(this.y), img.width, img.height - lift);
    if (lift === 0) {
      const label = this.state === 'counting' ? String(Math.max(0, Math.ceil(this.remaining))) : '429';
      const cy = Math.round(this.y + this.h / 2 - 4);
      drawText(g, label, x + 10, cy, '#ffd4cc', { align: 'center' });
    }
  }
}

/** Invisible trigger used for one-time tutorial popups. */
export class Hint extends Entity {
  text: string;
  shown = false;

  constructor(x: number, y: number, text: string) {
    super(x, y);
    this.text = text;
  }

  update(w: World): void {
    if (!this.shown && w.player.x > this.x) {
      this.shown = true;
      w.popup(this.text, this.x + 40, this.y, '#ffffff', 2.2);
    }
  }

  draw(): void {}
}
