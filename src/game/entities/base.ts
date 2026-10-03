import { floorAt, moveBody } from '../physics';
import type { Player } from '../player';
import type { World } from '../world';

export abstract class Entity {
  x: number;
  y: number;
  w = 16;
  h = 16;
  vx = 0;
  vy = 0;
  prevX: number;
  prevY: number;
  dead = false;
  activated = false;
  alwaysActive = false;
  /** 0 = drawn behind tiles (emerging items), 1 = normal. */
  layer = 1;
  facing: 1 | -1 = -1;
  onGround = false;
  /** Participates in player/enemy interactions. */
  enemy = false;
  stompable = false;
  harmful = false;
  /** Can be destroyed by shells, subagents, block bumps and Bypass Permissions. */
  killable = true;
  dying = false;
  isPlatform = false;
  /** Used in death messages: "killed by a Bug". */
  name = 'something';
  /** Slowed down by ultrathink. */
  slowable = true;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  get cx(): number {
    return this.x + this.w / 2;
  }

  get cy(): number {
    return this.y + this.h / 2;
  }

  abstract update(w: World, dt: number): void;
  abstract draw(g: CanvasRenderingContext2D, camX: number, w: World): void;

  onStomp(_w: World, _p: Player): void {}
  onTouch(_w: World, _p: Player): void {}
  knock(_w: World, _dir: number): void {}
  /** Optional custom hit shape (spinner bars). */
  hitsPlayer?(p: Player): boolean;
}

/** Shared behavior for walking enemies: gravity, wall turns, optional ledge turns, knock-off death. */
export abstract class Enemy extends Entity {
  enemy = true;
  stompable = true;
  harmful = true;
  knocked = false;
  squashT = 0;
  animT = 0;
  gravity = 1500;

  /** Spawn helper: center horizontally in the tile, feet on the tile's bottom edge. */
  protected placeOn(tileX: number, tileY: number): void {
    this.x = tileX + (16 - this.w) / 2;
    this.y = tileY + 16 - this.h;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  knock(w: World, dir: number): void {
    if (this.dying || !this.killable) return;
    this.dying = true;
    this.knocked = true;
    this.harmful = false;
    this.stompable = false;
    this.vy = -260;
    this.vx = dir * 50;
    w.sfx('kick');
  }

  protected updateKnocked(w: World, dt: number): void {
    this.vy = Math.min(this.vy + 900 * dt, 500);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > w.map.h * 16 + 40) this.dead = true;
  }

  protected squash(w: World): void {
    this.squashT = 0.45;
    this.dying = true;
    this.harmful = false;
    this.stompable = false;
    w.sfx('stomp');
  }

  /** Returns true while the squash timer is running (caller should stop updating). */
  protected updateSquash(dt: number): boolean {
    if (this.squashT <= 0) return false;
    this.squashT -= dt;
    if (this.squashT <= 0) this.dead = true;
    return true;
  }

  protected walk(w: World, dt: number, speed: number, ledgeTurn: boolean): void {
    this.vx = this.facing * speed;
    this.vy = Math.min(this.vy + this.gravity * dt, 420);
    const r = moveBody(this, w.map, dt);
    this.onGround = r.hitBottom;
    if (r.hitLeft) this.facing = 1;
    else if (r.hitRight) this.facing = -1;
    if (ledgeTurn && this.onGround) {
      const front = this.facing > 0 ? this.x + this.w + 1 : this.x - 1;
      if (!floorAt(w.map, front, this.y + this.h)) this.facing = this.facing > 0 ? -1 : 1;
    }
    if (this.y > w.map.h * 16 + 40) this.dead = true;
  }

  /** Draw with optional vertical flip for knocked-out enemies. */
  protected blit(g: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!this.knocked) {
      g.drawImage(img, rx, ry);
      return;
    }
    g.save();
    g.translate(rx, ry + img.height);
    g.scale(1, -1);
    g.drawImage(img, 0, 0);
    g.restore();
  }
}
