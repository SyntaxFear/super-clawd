import { boxBlocked, moveBody } from './physics';
import { TILE } from './tiles';
import type { TileMap } from './tilemap';

export type Form = 'small' | 'big' | 'agent';
export type PlayerState = 'play' | 'dying' | 'flag' | 'walkout' | 'pipe-in' | 'pipe-out' | 'gone' | 'victory' | 'frozen';
export type Pose = 'idle' | 'blink' | 'run1' | 'run2' | 'run3' | 'jump' | 'skid' | 'crouch' | 'dead' | 'pole' | 'victory';

export interface Controls {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
  run: boolean;
  runPressed: boolean;
}

export const NO_CONTROLS: Controls = {
  left: false,
  right: false,
  down: false,
  jump: false,
  jumpPressed: false,
  run: false,
  runPressed: false,
};

/** Movement tuning, in pixels and seconds. */
export const PHYS = {
  WALK: 90,
  RUN: 150,
  ACCEL: 430,
  AIR_ACCEL: 340,
  FRICTION: 540,
  SKID: 1150,
  AIR_DRAG: 40,
  JUMP_V: 350,
  JUMP_RUN_BONUS: 0.33,
  G_RISE: 1000,
  G_CUT: 2700,
  G_FALL: 1850,
  MAX_FALL: 440,
  COYOTE: 0.09,
  BUFFER: 0.12,
  BOUNCE: 270,
  BOUNCE_HELD: 400,
};

export const SIZES = {
  small: { w: 12, h: 12 },
  big: { w: 16, h: 18 },
  crouch: { w: 16, h: 12 },
};

export interface PlatformLike {
  x: number;
  y: number;
  w: number;
  dx: number;
  dy: number;
  onStand?(p: Player): void;
}

/** What the player needs from the world. Kept tiny so the solver and tests can provide stubs. */
export interface PlayerHost {
  readonly map: TileMap;
  sfx(name: string): void;
  bump(p: Player, ceiling: { tx: number; ty: number }[]): void;
  platformList(): readonly PlatformLike[];
  fireAgent(p: Player): void;
  tryWarp(p: Player): boolean;
  killPlayer(cause: string): void;
  landed(p: Player, impact: number): void;
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

export class Player {
  x: number;
  y: number;
  w = SIZES.small.w;
  h = SIZES.small.h;
  vx = 0;
  vy = 0;
  prevX: number;
  prevY: number;
  onGround = false;
  facing: 1 | -1 = 1;
  form: Form = 'small';
  /** Context window fill, 0..3. Three hits as Sonnet ends the session. */
  context = 0;
  invuln = 0;
  /** Bypass Permissions timer. */
  star = 0;
  state: PlayerState = 'play';
  stateT = 0;
  crouch = false;
  skidding = false;
  jumping = false;
  bouncing = false;
  coyote = 0;
  jumpBuf = 0;
  stompChain = 0;
  /** Touch play runs at full speed without holding a run button. */
  autoRun = false;
  standingOn: PlatformLike | null = null;
  pose: Pose = 'idle';
  animT = 0;
  blinkT = 2;
  deathCause = '';
  visible = true;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
  }

  get big(): boolean {
    return this.form !== 'small';
  }

  get cx(): number {
    return this.x + this.w / 2;
  }

  /** Place feet at `bottom` with the current size. */
  placeFeet(x: number, bottom: number): void {
    this.x = x;
    this.y = bottom - this.h;
    this.prevX = this.x;
    this.prevY = this.y;
  }

  private resize(w: number, h: number): void {
    const bottom = this.y + this.h;
    const cx = this.x + this.w / 2;
    this.w = w;
    this.h = h;
    this.x = cx - w / 2;
    this.y = bottom - h;
  }

  setForm(form: Form, map?: TileMap): void {
    this.form = form;
    this.crouch = false;
    const s = form === 'small' ? SIZES.small : SIZES.big;
    this.resize(s.w, s.h);
    if (form !== 'small' && map && boxBlocked(map, this.x, this.y, this.w, this.h)) {
      this.crouch = true;
      this.resize(SIZES.crouch.w, SIZES.crouch.h);
    }
  }

  private canStand(map: TileMap): boolean {
    const h = SIZES.big.h;
    return !boxBlocked(map, this.x, this.y + this.h - h, this.w, h);
  }

  private setCrouch(on: boolean): void {
    this.crouch = on;
    const s = on ? SIZES.crouch : SIZES.big;
    this.resize(s.w, s.h);
  }

  /** Called by the world when the player stomps an enemy. */
  bounce(holdingJump: boolean): void {
    this.vy = -(holdingJump ? PHYS.BOUNCE_HELD : PHYS.BOUNCE);
    this.jumping = holdingJump;
    this.bouncing = !holdingJump;
    this.onGround = false;
    this.standingOn = null;
  }

  /** Apply a hit. Returns what happened so the world can react. */
  hurt(): 'none' | 'shrink' | 'context' | 'die' {
    if (this.invuln > 0 || this.star > 0 || this.state !== 'play') return 'none';
    if (this.form !== 'small') {
      this.setForm('small');
      this.invuln = 2;
      return 'shrink';
    }
    this.context += 1;
    if (this.context >= 3) return 'die';
    this.invuln = 2;
    return 'context';
  }

  die(cause: string): void {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.stateT = 0;
    this.deathCause = cause;
    this.vx = 0;
    this.vy = 0;
    this.pose = 'dead';
    this.star = 0;
    this.invuln = 0;
  }

  update(host: PlayerHost, dt: number, c: Controls): void {
    this.stateT += dt;
    if (this.state === 'dying') {
      this.updateDying(dt);
      return;
    }
    if (this.state !== 'play') return;
    this.updatePlay(host, dt, c);
  }

  private updateDying(dt: number): void {
    if (this.stateT < 0.45) return;
    if (this.vy === 0 && this.stateT < 0.5) this.vy = -330;
    this.vy = Math.min(this.vy + 950 * dt, 500);
    this.y += this.vy * dt;
  }

  private updatePlay(host: PlayerHost, dt: number, c: Controls): void {
    const P = PHYS;
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.star > 0) this.star = Math.max(0, this.star - dt);

    const plat = this.standingOn;
    if (plat) {
      this.x += plat.dx;
      this.y += plat.dy;
    }

    let dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);

    if (this.big) {
      if (this.onGround && c.down && !this.crouch) this.setCrouch(true);
      else if (this.crouch && !c.down && this.canStand(host.map)) this.setCrouch(false);
    }
    if (this.crouch && this.onGround) dir = 0;

    const max = c.run || this.autoRun ? P.RUN : P.WALK;
    this.skidding = false;
    if (dir !== 0) {
      this.facing = dir > 0 ? 1 : -1;
      if (this.onGround) {
        if (this.vx !== 0 && Math.sign(this.vx) !== dir) {
          this.vx += dir * P.SKID * dt;
          this.skidding = Math.abs(this.vx) > 30;
        } else this.vx += dir * P.ACCEL * dt;
      } else this.vx += dir * P.AIR_ACCEL * dt;
      if (Math.sign(this.vx) === dir && Math.abs(this.vx) > max) {
        this.vx = dir * Math.max(max, Math.abs(this.vx) - P.FRICTION * dt);
      }
    } else if (this.onGround) {
      this.vx = approach(this.vx, 0, P.FRICTION * dt);
    } else {
      this.vx = approach(this.vx, 0, P.AIR_DRAG * dt);
    }

    this.jumpBuf = c.jumpPressed ? P.BUFFER : Math.max(0, this.jumpBuf - dt);
    this.coyote = this.onGround ? P.COYOTE : Math.max(0, this.coyote - dt);
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -(P.JUMP_V + P.JUMP_RUN_BONUS * Math.abs(this.vx));
      this.jumping = true;
      this.bouncing = false;
      this.onGround = false;
      this.standingOn = null;
      this.coyote = 0;
      this.jumpBuf = 0;
      host.sfx(this.big ? 'jumpBig' : 'jump');
    }

    let g = P.G_FALL;
    if (this.vy < 0) g = this.jumping && c.jump ? P.G_RISE : this.bouncing ? P.G_FALL : P.G_CUT;
    this.vy = Math.min(this.vy + g * dt, P.MAX_FALL);

    const wasGround = this.onGround;
    const impact = this.vy;
    const prevBottom = this.y + this.h;
    const res = moveBody(this, host.map, dt, { hidden: true, corner: 5 });
    this.onGround = res.hitBottom;
    this.standingOn = null;
    if (!this.onGround && this.vy >= 0) this.landOnPlatforms(host, prevBottom);
    if (res.hitTop) {
      this.jumping = false;
      host.bump(this, res.ceiling);
    }
    if (this.onGround) {
      if (!wasGround) host.landed(this, impact);
      this.jumping = false;
      this.bouncing = false;
      this.stompChain = 0;
    }

    if (c.runPressed && this.form === 'agent' && !this.crouch) host.fireAgent(this);
    if (this.onGround && c.down && host.tryWarp(this)) return;

    if (this.y > host.map.h * TILE + 8) {
      host.killPlayer('pit');
      return;
    }
    this.animate(dt);
  }

  private landOnPlatforms(host: PlayerHost, prevBottom: number): void {
    for (const p of host.platformList()) {
      if (this.x + this.w <= p.x + 1 || this.x >= p.x + p.w - 1) continue;
      const top = p.y;
      const before = top - p.dy;
      if (prevBottom <= before + 2 && this.y + this.h >= top) {
        this.y = top - this.h;
        this.vy = 0;
        this.onGround = true;
        this.standingOn = p;
        p.onStand?.(this);
        return;
      }
    }
  }

  animate(dt: number): void {
    if (!this.onGround) this.pose = 'jump';
    else if (this.crouch) this.pose = 'crouch';
    else if (this.skidding) this.pose = 'skid';
    else if (Math.abs(this.vx) > 4) {
      this.animT += dt * (5 + Math.abs(this.vx) / 9);
      this.pose = (['run1', 'run2', 'run3', 'run2'] as const)[Math.floor(this.animT) % 4];
    } else {
      this.blinkT -= dt;
      if (this.blinkT < 0) this.blinkT = 2.5 + ((this.x * 7) % 2);
      this.pose = this.blinkT < 0.12 ? 'blink' : 'idle';
    }
  }
}
