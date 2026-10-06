import { drawText } from '../../engine/font';
import * as Art from '../../art/enemies';
import { moveBody } from '../physics';
import type { Player } from '../player';
import type { World } from '../world';
import { Enemy } from './base';

/** Basic walker. Stomp it to fix it. */
export class Bug extends Enemy {
  name = 'a Bug';

  constructor(x: number, y: number) {
    super(x, y);
    this.w = 14;
    this.h = 12;
    this.placeOn(x, y);
  }

  update(w: World, dt: number): void {
    if (this.knocked) return this.updateKnocked(w, dt);
    if (this.updateSquash(dt)) return;
    this.walk(w, dt, 30, false);
    this.animT += dt;
  }

  onStomp(w: World, p: Player): void {
    this.squash(w);
    w.stomped(this, p, 'FIXED');
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    if (this.squashT > 0) {
      g.drawImage(Art.bugSquash(w.dark), Math.round(this.x - 1 - camX), Math.round(this.y + this.h - 6));
      return;
    }
    this.blit(g, Art.bug(Math.floor(this.animT * 6) % 2, w.dark), this.x - 1 - camX, this.y - 2);
  }
}

/** Infinite Loop: stomp to curl it up, kick it and it loops forever, flattening everything in its path. */
export class Loop extends Enemy {
  name = 'an Infinite Loop';
  mode: 'walk' | 'shell' | 'spin' = 'walk';
  shellT = 0;
  grace = 0;
  rot = 0;
  kills = 0;

  constructor(x: number, y: number) {
    super(x, y);
    this.w = 14;
    this.h = 14;
    this.placeOn(x, y);
  }

  get spinning(): boolean {
    return this.mode === 'spin' && !this.dying;
  }

  update(w: World, dt: number): void {
    if (this.knocked) return this.updateKnocked(w, dt);
    this.animT += dt;
    if (this.mode === 'walk') {
      this.walk(w, dt, 28, true);
      this.rot += dt * 3;
      return;
    }
    if (this.mode === 'shell') {
      this.vx = 0;
      this.vy = Math.min(this.vy + this.gravity * dt, 420);
      this.onGround = moveBody(this, w.map, dt).hitBottom;
      this.shellT += dt;
      if (this.shellT > 7) {
        this.mode = 'walk';
        this.harmful = true;
        this.facing = w.player.cx < this.cx ? -1 : 1;
      }
      return;
    }
    // Spinning: bounces between walls forever.
    this.grace -= dt;
    this.harmful = this.grace <= 0;
    this.vx = this.facing * 230;
    this.vy = Math.min(this.vy + this.gravity * dt, 420);
    const r = moveBody(this, w.map, dt);
    this.onGround = r.hitBottom;
    if (r.hitLeft || r.hitRight) {
      this.facing = r.hitLeft ? 1 : -1;
      if (w.onScreen(this)) w.sfx('bump');
    }
    this.rot += dt * 22 * this.facing;
    if (this.y > w.map.h * 16 + 40) this.dead = true;
  }

  private kick(w: World, dir: number): void {
    this.mode = 'spin';
    this.facing = dir > 0 ? 1 : -1;
    this.grace = 0.2;
    this.harmful = false;
    this.kills = 0;
    w.sfx('kick');
    w.addScore(100, this.cx, this.y);
  }

  onStomp(w: World, p: Player): void {
    if (this.mode === 'shell') {
      this.kick(w, p.cx < this.cx ? 1 : -1);
      w.bounceOff(p);
      return;
    }
    this.mode = 'shell';
    this.shellT = 0;
    this.harmful = false;
    this.vx = 0;
    w.sfx('stomp');
    w.stomped(this, p, 'BREAK');
  }

  onTouch(w: World, p: Player): void {
    if (this.mode === 'shell') this.kick(w, p.cx < this.cx ? 1 : -1);
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const walkFrame = Math.floor(this.animT * 5) % 2;
    let rot = Math.floor(this.rot * 1.3) % 8;
    if (rot < 0) rot += 8;
    const img = Art.loop(rot, walkFrame, this.mode !== 'walk');
    let ox = 0;
    if (this.mode === 'shell' && this.shellT > 5.5) ox = Math.floor(this.animT * 20) % 2 ? 1 : -1;
    this.blit(g, img, this.x - 1 - camX + ox, this.y - 2);
  }
}

/** Flaky Test: randomly phases between FAIL (solid, dangerous) and PASS (a harmless ghost). */
export class Flaky extends Enemy {
  name = 'a Flaky Test';
  failing = true;
  phaseT: number;

  constructor(x: number, y: number, seed: number) {
    super(x, y);
    this.w = 14;
    this.h = 14;
    this.placeOn(x, y);
    this.phaseT = 1 + (seed % 7) * 0.17;
  }

  update(w: World, dt: number): void {
    if (this.knocked) return this.updateKnocked(w, dt);
    if (this.updateSquash(dt)) return;
    this.animT += dt;
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      this.failing = !this.failing;
      this.phaseT = this.failing ? w.rng.range(1.3, 2.6) : w.rng.range(0.9, 1.7);
    }
    this.harmful = this.failing;
    this.stompable = this.failing;
    this.killable = this.failing;
    this.walk(w, dt, 24, false);
  }

  onStomp(w: World, p: Player): void {
    this.squash(w);
    w.stomped(this, p, 'FIXED');
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const frame = Math.floor(this.animT * 6) % 2;
    if (this.squashT > 0) {
      g.drawImage(Art.flakySquash(), Math.round(this.x - 1 - camX), Math.round(this.y + this.h - 6));
      return;
    }
    const warn = this.phaseT < 0.35 && Math.floor(this.animT * 16) % 2 === 0;
    const showFail = this.failing !== warn;
    g.globalAlpha = showFail ? 1 : 0.28 + 0.1 * Math.sin(this.animT * 20);
    this.blit(g, Art.flaky(showFail, frame), this.x - 1 - camX, this.y - 2);
    g.globalAlpha = 1;
  }
}

/** Null Pointer: hides in the floor and springs up when you get close. Can't be stomped. */
export class NullPtr extends Enemy {
  name = 'a Null Pointer';
  stompable = false;
  killable = false;
  harmful = false;
  state: 'hidden' | 'rise' | 'up' | 'down' | 'cool' = 'hidden';
  st = 0;
  rise = 0;
  baseY: number;

  constructor(x: number, y: number) {
    super(x, y);
    this.w = 10;
    this.h = 1;
    this.x = x + 3;
    this.baseY = y + 16;
    this.y = this.baseY - this.h;
  }

  update(w: World, dt: number): void {
    const p = w.player;
    this.animT += dt;
    this.st += dt;
    switch (this.state) {
      case 'hidden':
        if (Math.abs(p.cx - this.cx) < 30 && p.y + p.h > this.baseY - 48 && p.state === 'play') {
          this.state = 'rise';
          this.st = 0;
          w.sfx('beep');
        }
        break;
      case 'rise':
        this.rise = Math.min(1, this.rise + dt / 0.12);
        if (this.rise >= 1) ((this.state = 'up'), (this.st = 0));
        break;
      case 'up':
        if (this.st > 1.1) ((this.state = 'down'), (this.st = 0));
        break;
      case 'down':
        this.rise = Math.max(0, this.rise - dt / 0.25);
        if (this.rise <= 0) ((this.state = 'cool'), (this.st = 0));
        break;
      case 'cool':
        if (this.st > 1.2) ((this.state = 'hidden'), (this.st = 0));
        break;
    }
    this.h = Math.max(1, Math.round(15 * this.rise));
    this.y = this.baseY - this.h;
    this.harmful = this.rise > 0.4;
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    const x = Math.round(this.x - 2 - camX);
    if (this.rise <= 0) {
      // A faint tell on the floor: 0x0
      drawText(g, '0x0', x - 2, this.baseY - 7, w.dark ? '#5a5f78' : '#b8a898', { alpha: 0.6 });
      return;
    }
    const img = Art.nullptr();
    const visible = Math.round(img.height * this.rise);
    g.drawImage(img, 0, 0, img.width, visible, x, this.baseY - visible, img.width, visible);
    if (this.rise >= 1) drawText(g, 'null', x - 3, this.baseY - visible - 9, '#e5484d', { shadow: '#1a1614' });
  }
}

/** Memory Leak: slowly grows. Stomping a big one only garbage-collects part of it. */
export class Leak extends Enemy {
  name = 'a Memory Leak';
  stage = 0;
  growT = 0;
  static SIZES: [number, number][] = [
    [12, 10],
    [18, 15],
    [26, 21],
  ];

  constructor(x: number, y: number, stage = 0) {
    super(x, y);
    this.stage = stage;
    [this.w, this.h] = Leak.SIZES[stage];
    this.placeOn(x, y);
  }

  private resize(stage: number): void {
    const bottom = this.y + this.h;
    const cx = this.cx;
    this.stage = stage;
    [this.w, this.h] = Leak.SIZES[stage];
    this.x = cx - this.w / 2;
    this.y = bottom - this.h;
  }

  update(w: World, dt: number): void {
    if (this.knocked) return this.updateKnocked(w, dt);
    if (this.updateSquash(dt)) return;
    this.animT += dt;
    this.growT += dt;
    if (this.growT > 5 && this.stage < 2) {
      this.resize(this.stage + 1);
      this.growT = 0;
      w.popup('+512MB', this.cx, this.y - 4, '#c9a7ff');
    }
    const p = w.player;
    if (Math.abs(p.cx - this.cx) < 220 && this.onGround) this.facing = p.cx < this.cx ? -1 : 1;
    this.walk(w, dt, 16 + this.stage * 5, true);
  }

  onStomp(w: World, p: Player): void {
    if (this.stage > 0) {
      this.resize(this.stage - 1);
      this.growT = 0;
      w.sfx('stomp');
      w.bounceOff(p);
      w.addScore(200, this.cx, this.y);
      w.popup("GC'D", this.cx, this.y - 10, '#c9a7ff');
      return;
    }
    this.squash(w);
    w.stomped(this, p, 'FREED');
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const frame = Math.floor(this.animT * 4) % 2;
    if (this.squashT > 0) {
      g.drawImage(Art.leak(0, 1), Math.round(this.x - 1 - camX), Math.round(this.y + this.h - 6), 14, 6);
      return;
    }
    const img = Art.leak(this.stage, frame);
    this.blit(g, img, this.cx - img.width / 2 - camX, this.y + this.h - img.height);
  }
}

/** Deprecated Warning: flies in a wave. Harmless, but it shoves you around. */
export class Deprecated extends Enemy {
  name = 'a Deprecated Warning';
  harmful = false;
  baseY: number;
  t: number;
  cooldown = 0;

  constructor(x: number, y: number, seed: number) {
    super(x, y);
    this.w = 14;
    this.h = 12;
    this.x = x + 1;
    this.y = y + 2;
    this.baseY = this.y;
    this.t = (seed % 5) * 0.6;
  }

  update(w: World, dt: number): void {
    if (this.knocked) return this.updateKnocked(w, dt);
    this.t += dt;
    this.animT += dt;
    this.cooldown -= dt;
    this.x += -34 * dt;
    this.y = this.baseY + Math.sin(this.t * 2.6) * 12;
  }

  onTouch(w: World, p: Player): void {
    if (this.cooldown > 0) return;
    this.cooldown = 0.6;
    p.vx = (p.cx < this.cx ? -1 : 1) * 170;
    p.vy = -170;
    p.onGround = false;
    p.standingOn = null;
    w.sfx('bump');
    w.popup('DEPRECATED', this.cx, this.y - 6, '#f5c542');
  }

  onStomp(w: World, p: Player): void {
    this.knocked = true;
    this.dying = true;
    this.stompable = false;
    this.vy = 0;
    this.vx = 0;
    w.sfx('stomp');
    w.stomped(this, p, 'SUPPRESSED');
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    this.blit(g, Art.deprecated(Math.floor(this.animT * 8) % 2), this.x - 3 - camX, this.y - 1);
  }
}
