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
