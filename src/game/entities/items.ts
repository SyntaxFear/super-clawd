import * as Items from '../../art/items';
import { moveBody } from '../physics';
import type { World } from '../world';
import { Entity } from './base';

export type ItemKind = 'opus' | 'agent' | 'oneup' | 'bypass' | 'compact' | 'ultrathink';

/** A power-up that rises out of a block, then behaves according to its kind. */
export class Item extends Entity {
  kind: ItemKind;
  emerging = true;
  emergeT = 0;
  blockTop: number;
  t = 0;
  baseY = 0;

  constructor(tileX: number, tileY: number, kind: ItemKind) {
    super(tileX, tileY);
    this.kind = kind;
    this.w = 14;
    this.h = 14;
    this.x = tileX + 1;
    this.blockTop = tileY;
    this.y = tileY + 16 - this.h;
    this.layer = 0;
    this.facing = 1;
    this.slowable = false;
  }

  get collectable(): boolean {
    return !this.dead && (!this.emerging || this.emergeT > 0.3);
  }

  update(w: World, dt: number): void {
    this.t += dt;
    if (this.emerging) {
      this.emergeT += dt;
      const k = Math.min(1, this.emergeT / 0.6);
      this.y = this.blockTop + 16 - this.h - 16 * k;
      if (k >= 1) {
        this.emerging = false;
        this.layer = 1;
        this.baseY = this.y;
        if (this.kind === 'bypass') this.vy = -260;
      }
      return;
    }
    switch (this.kind) {
      case 'agent':
        return;
      case 'ultrathink':
        this.x += 34 * dt * this.facing;
        this.y = this.baseY - 6 + Math.sin(this.t * 3) * 6;
        break;
      case 'bypass': {
        this.vx = this.facing * 76;
        this.vy = Math.min(this.vy + 900 * dt, 420);
        const r = moveBody(this, w.map, dt);
        if (r.hitBottom) this.vy = -300;
        if (r.hitLeft) this.facing = 1;
        if (r.hitRight) this.facing = -1;
        break;
      }
      default: {
        this.vx = this.facing * 62;
        this.vy = Math.min(this.vy + 1300 * dt, 420);
        const r = moveBody(this, w.map, dt);
        if (r.hitLeft) this.facing = 1;
        if (r.hitRight) this.facing = -1;
      }
    }
    if (this.y > w.map.h * 16 + 32) this.dead = true;
  }

  /** Knocked upward when the block under it is bumped. */
  hop(dir: number): void {
    this.vy = -220;
    this.facing = dir > 0 ? 1 : -1;
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const img = Items.item(this.kind, this.t);
    g.drawImage(img, Math.round(this.x - 1 - camX), Math.round(this.y - (img.height - this.h)));
  }
}

/** A token that pops out of a block, spins, and vanishes. */
export class TokenPop extends Entity {
  t = 0;

  constructor(x: number, y: number) {
    super(x, y);
    this.vy = -330;
    this.w = 12;
    this.h = 14;
    this.alwaysActive = true;
    this.slowable = false;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    this.vy += 1100 * dt;
    this.y += this.vy * dt;
    if (this.t > 0.42) {
      this.dead = true;
      w.popup('+1K', this.x + 6, this.y, '#ffe29a');
    }
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    g.drawImage(Items.token(Math.floor(this.t * 20) % 4), Math.round(this.x - camX), Math.round(this.y));
  }
}

/** Subagent: a mini Clawd that bounces ahead and takes out the first enemy it reaches. */
export class MiniAgent extends Entity {
  life = 2.6;
  t = 0;

  constructor(x: number, y: number, dir: 1 | -1) {
    super(x, y);
    this.w = 8;
    this.h = 7;
    this.facing = dir;
    this.vx = dir * 215;
    this.vy = 80;
    this.alwaysActive = true;
    this.slowable = false;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    this.life -= dt;
    this.vx = this.facing * 215;
    this.vy = Math.min(this.vy + 1150 * dt, 400);
    const r = moveBody(this, w.map, dt);
    if (r.hitBottom) this.vy = -200;
    if (r.hitLeft || r.hitRight || this.life <= 0 || !w.onScreen(this, 24)) this.vanish(w);
  }

  vanish(w: World): void {
    if (this.dead) return;
    this.dead = true;
    w.fx.puff(this.cx, this.cy, '#f3ede4');
  }

  draw(g: CanvasRenderingContext2D, camX: number): void {
    const img = Items.mini(Math.floor(this.t * 14) % 2, 'agent', this.facing);
    g.drawImage(img, Math.round(this.x - camX), Math.round(this.y));
  }
}
