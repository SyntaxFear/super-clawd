import { Rng } from '../engine/rng';
import * as TileArt from '../art/tiles';
import * as Bg from '../art/backgrounds';
import * as Hero from '../art/hero';
import * as Props from '../art/props';
import type { LevelData, MusicId, Warp } from './builder';
import { Entity } from './entities/base';
import { Copilot, GhostText } from './entities/boss';
import { Bubble, Bug, Deprecated, Flaky, Leak, Loop, NullPtr, Spinner, Thwomp } from './entities/enemies';
import { Item, MiniAgent, TokenPop, type ItemKind } from './entities/items';
import { Checkpoint, Flagpole, Gate, Hint, Platform, RateLimit } from './entities/props';
import { Fx } from './fx';
import { overlaps, moveBody } from './physics';
import { Player, type Controls, type Form, type PlatformLike, type PlayerHost } from './player';
import { T, TILE } from './tiles';
import type { TileMap } from './tilemap';

export interface Session {
  lives: number;
  score: number;
  tokens: number;
  deaths: number;
  bugsFixed: number;
  playTime: number;
  form: Form;
  context: number;
}

export function newSession(): Session {
  return { lives: 3, score: 0, tokens: 0, deaths: 0, bugsFixed: 0, playTime: 0, form: 'small', context: 0 };
}

export type WorldEvent =
  | { type: 'died'; cause: string; killer: string; progress: number }
  | { type: 'cleared'; timeBonus: number }
  | { type: 'bossDefeated' }
  | { type: 'gate'; gate: Gate }
  | { type: 'oneup' }
  | { type: 'checkpoint'; x: number };

export interface WorldHooks {
  sfx(name: string): void;
  music(track: MusicId | 'bypass' | 'clear' | 'death' | 'boss' | null, opts?: { fast?: boolean }): void;
}

const CHAIN = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];

type Phase = 'play' | 'dead' | 'flag' | 'walkout' | 'tally' | 'done' | 'boss-win';

export class World implements PlayerHost {
  readonly level: LevelData;
  readonly map: TileMap;
  readonly player: Player;
  readonly session: Session;
  readonly hooks: WorldHooks;
  readonly fx = new Fx();
  readonly rng: Rng;
  entities: Entity[] = [];
  private spawnQueue: Entity[] = [];
  camX = 0;
  viewW: number;
  time: number;
  timerOn = true;
  hurried = false;
  t = 0;
  hitstop = 0;
  freeze = 0;
  freezeFrom: Form | null = null;
  slowmo = 0;
  shakeT = 0;
  shakeAmp = 0;
  paused = false;
  phase: Phase = 'play';
  phaseT = 0;
  events: WorldEvent[] = [];
  checkpointX: number | null = null;
  bumps = new Map<number, number>();
  bossLock: { x0: number; x1: number } | null = null;
  boss: Copilot | null = null;
  bossStarted = false;
  lastKiller = '';
  flag: Flagpole | null = null;
  doorX = 0;
  tallyLeft = 0;
  tallyBonus = 0;
  private multiStart = new Map<number, number>();
  private pendingWarp: Warp | null = null;
  private prevStar = 0;
  private deathSent = false;
  readonly dark: boolean;
  /** Subagents thrown in this level. */
  agentCount = 0;

  constructor(level: LevelData, session: Session, hooks: WorldHooks, opts: { viewW: number; checkpointX?: number | null }) {
    this.level = level;
    this.map = level.map.clone();
    this.session = session;
    this.hooks = hooks;
    this.viewW = opts.viewW;
    this.time = level.time;
    this.rng = new Rng(level.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    this.dark = level.theme !== 'terminal';

    let sx = level.startX;
    let sy = level.startY + TILE;
    if (opts.checkpointX != null) {
      this.checkpointX = opts.checkpointX;
      sx = opts.checkpointX;
      sy = this.groundBelow(sx + 6, 2 * TILE) ?? sy;
    }
    this.player = new Player(sx, 0);
    this.player.setForm(session.form, this.map);
    this.player.context = session.context;
    this.player.placeFeet(sx + 2, sy);
    this.player.onGround = true;

    let seed = 1;
    for (const s of level.spawns) {
      const e = this.makeSpawn(s.kind, s.x, s.y, s.opts ?? {}, seed++);
      if (e && s.opts?.dir) e.facing = (s.opts.dir as number) > 0 ? 1 : -1;
      if (e) this.entities.push(e);
      if (e instanceof Checkpoint && opts.checkpointX != null && e.x <= opts.checkpointX + 8) e.reached = true;
    }
    for (const d of level.decos) if (d.kind === 'prod') this.doorX = d.x + 40;
    this.updateCamera(true);
  }

  private makeSpawn(kind: string, x: number, y: number, o: Record<string, unknown>, seed: number): Entity | null {
    switch (kind) {
      case 'bug':
        return new Bug(x, y);
      case 'loop':
        return new Loop(x, y);
      case 'flaky':
        return new Flaky(x, y, seed);
      case 'nullptr':
        return new NullPtr(x, y);
      case 'leak':
        return new Leak(x, y, (o.stage as number) ?? 0);
      case 'deprecated':
        return new Deprecated(x, y, seed);
      case 'thwomp':
        return new Thwomp(x, y);
      case 'bubble':
        return new Bubble(x, y, seed);
      case 'spinner':
        return new Spinner(x, y, o.len as number, o.speed as number);
      case 'platform':
        return new Platform(x, y, o as never);
      case 'checkpoint':
        return new Checkpoint(x, y, seed * 7919 + x);
      case 'flagpole': {
        const f = new Flagpole(x, y);
        this.flag = f;
        return f;
      }
      case 'gate':
        return new Gate(x, y, o as never);
      case 'ratelimit':
        return new RateLimit(x, y, o as never);
      case 'hint':
        return new Hint(x, y, o.text as string);
      default:
        return null;
    }
  }

  /** Surface y of the first solid tile at or below `fromY` in column x. */
  private groundBelow(x: number, fromY: number): number | null {
    const tx = Math.floor(x / TILE);
    for (let ty = Math.floor(fromY / TILE); ty < this.map.h; ty++) {
      if (this.map.solid(tx, ty) && !this.map.solid(tx, ty - 1)) return ty * TILE;
    }
    return null;
  }

  // ---------------------------------------------------------------- host API

  sfx(name: string): void {
    this.hooks.sfx(name);
  }

  platformList(): readonly PlatformLike[] {
    return this.entities.filter((e): e is Platform => e instanceof Platform && e.solid && e.activated);
  }

  spawn(e: Entity): void {
    this.spawnQueue.push(e);
  }

  popup(text: string, x: number, y: number, color = '#ffffff', life = 0.8, rainbow = false): void {
    this.fx.popup(text, x, y, color, life, rainbow);
  }

  addScore(points: number, x?: number, y?: number): void {
    this.session.score += points;
    if (x !== undefined && y !== undefined) this.popup(String(points), x, y, '#ffffff');
  }

  shake(amp: number, time: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, time);
  }

  onScreen(e: { x: number; w: number }, margin = 0): boolean {
    return e.x + e.w > this.camX - margin && e.x < this.camX + this.viewW + margin;
  }

  gainLife(x: number, y: number): void {
    this.session.lives += 1;
    this.popup('1UP', x, y, '#8fcb79', 1.2);
    this.sfx('oneUp');
    this.events.push({ type: 'oneup' });
  }

  collectToken(x: number, y: number): void {
    this.session.tokens += 1;
    this.session.score += 200;
    this.sfx('token');
    this.fx.sparkle(x, y, 4);
    if (this.session.tokens >= 100) {
      this.session.tokens -= 100;
      this.gainLife(x, y - 10);
    }
  }

  /** An enemy was stomped: chain scoring, bounce and a tiny hit-stop for punch. */
  stomped(e: Entity, p: Player, label = ''): void {
    const i = p.stompChain++;
    if (i >= CHAIN.length) this.gainLife(e.cx, e.y);
    else this.addScore(CHAIN[i], e.cx, e.y - 2);
    if (label) this.popup(label, e.cx, e.y - 12, '#8fcb79', 0.7);
    this.session.bugsFixed += 1;
    this.bounceOff(p);
    this.hitstop = 3;
  }

  bounceOff(p: Player, big = false): void {
    p.bounce(this.jumpHeld || big);
    if (big && !this.jumpHeld) p.vy = -330;
  }

  knockEnemy(e: Entity, dir: number, points: number): void {
    if (!e.killable || e.dying) return;
    if (e instanceof GhostText) {
      e.knock(this);
      return;
    }
    e.knock(this, dir);
    this.session.bugsFixed += 1;
    this.addScore(points, e.cx, e.y);
  }

  slam(x: number, y: number): void {
    this.shake(3, 0.3);
    this.sfx('thud');
    this.fx.dust(x - 10, y - 2, 4, '#9c8b6e');
    this.fx.dust(x + 10, y - 2, 4, '#9c8b6e');
    if (this.onScreen({ x: x - 16, w: 32 })) this.popup('847MB', x, y - 40, '#c49a6c', 0.9);
  }

  reachCheckpoint(c: Checkpoint): void {
    this.checkpointX = c.x - 6;
    this.sfx('checkpoint');
    this.popup('GIT COMMIT', c.cx, c.y - 20, '#ffffff', 1.4);
    this.events.push({ type: 'checkpoint', x: this.checkpointX });
  }

  requestGate(g: Gate): void {
    this.paused = true;
    this.player.vx = 0;
    this.sfx('beep');
    this.events.push({ type: 'gate', gate: g });
  }

  answerGate(g: Gate, accepted: boolean): void {
    this.paused = false;
    g.resolve(this, accepted);
  }

  /** You approved rm -rf ~/. The floor under you is gone. */
  rmrf(g: Gate): void {
    const p = this.player;
    const l = Math.floor((p.x - 24) / TILE);
    const r = g.tx - 1;
    for (let tx = l; tx <= r; tx++)
      for (let ty = 0; ty < this.map.h; ty++) if (this.map.get(tx, ty) === T.GROUND) this.map.set(tx, ty, T.EMPTY);
    this.lastKiller = 'rm -rf ~/';
    this.shake(4, 0.5);
    this.sfx('break');
    this.popup('rm -rf ~/', p.cx, p.y - 16, '#e5484d', 2);
    p.onGround = false;
  }

  bossDying(_b: Copilot): void {
    this.hooks.music(null);
    this.slowmo = 0;
    for (const e of this.entities) if (e instanceof GhostText) e.knock(this);
  }

  bossDefeated(): void {
    if (this.phase === 'boss-win') return;
    this.phase = 'boss-win';
    this.phaseT = 0;
    this.timerOn = false;
    this.player.state = 'victory';
    this.hooks.music('clear');
  }

  // ---------------------------------------------------------------- blocks

  bump(p: Player, ceiling: { tx: number; ty: number }[]): void {
    if (!ceiling.length) return;
    let best = ceiling[0];
    for (const c of ceiling) if (Math.abs(c.tx * TILE + 8 - p.cx) < Math.abs(best.tx * TILE + 8 - p.cx)) best = c;
    const { tx, ty } = best;
    const t = this.map.get(tx, ty);
    const idx = this.map.idx(tx, ty);
    const content = this.map.contents.get(idx);
    if (t === T.PROMPT || t === T.HIDDEN) {
      this.map.set(tx, ty, T.USED);
      this.release(tx, ty, content ?? 'token', p);
      this.bumps.set(idx, 0);
      this.sfx('bump');
    } else if (t === T.BRICK) {
      if (content === 'multi') {
        const start = this.multiStart.get(idx) ?? this.t;
        this.multiStart.set(idx, start);
        const hits = (this.map.multiHits.get(idx) ?? 0) + 1;
        this.map.multiHits.set(idx, hits);
        this.release(tx, ty, 'token', p);
        if (hits >= 10 || this.t - start > 4.5) this.map.set(tx, ty, T.USED);
        this.bumps.set(idx, 0);
        this.sfx('bump');
      } else if (content) {
        this.map.set(tx, ty, T.USED);
        this.release(tx, ty, content, p);
        this.bumps.set(idx, 0);
        this.sfx('bump');
      } else if (p.big) {
        this.map.set(tx, ty, T.EMPTY);
        this.fx.debris(tx * TILE, ty * TILE, TileArt.brickColor(this.level.theme));
        this.addScore(50);
        this.sfx('break');
      } else {
        this.bumps.set(idx, 0);
        this.sfx('bump');
      }
    } else {
      this.sfx('bump');
      return;
    }
    this.bumpTop(tx, ty, p);
  }

  private bumpTop(tx: number, ty: number, p: Player): void {
    const top = ty * TILE;
    const box = { x: tx * TILE, y: top - 4, w: TILE, h: 6 };
    for (const e of this.entities) {
      if (!e.activated || e.dead) continue;
      if (e instanceof Item && !e.emerging && overlaps(e, box)) e.hop(e.cx < p.cx ? -1 : 1);
      else if (e.enemy && !e.dying && overlaps(e, box)) this.knockEnemy(e, e.cx < tx * TILE + 8 ? -1 : 1, 100);
    }
    if (this.map.get(tx, ty - 1) === T.TOKEN) {
      this.map.set(tx, ty - 1, T.EMPTY);
      this.spawn(new TokenPop(tx * TILE + 2, (ty - 1) * TILE));
      this.collectToken(tx * TILE + 8, (ty - 1) * TILE);
    }
  }

  private release(tx: number, ty: number, content: string, p: Player): void {
    if (content === 'token' || content === 'multi') {
      this.spawn(new TokenPop(tx * TILE + 2, ty * TILE - 14));
      this.collectToken(tx * TILE + 8, ty * TILE - 8);
      return;
    }
    let kind = content as ItemKind;
    if (content === 'power') kind = p.form === 'small' ? 'opus' : 'agent';
    const item = new Item(tx * TILE, ty * TILE, kind);
    item.activated = true;
    this.spawn(item);
    this.sfx('powerAppear');
  }

  // ---------------------------------------------------------------- player helpers

  private jumpHeld = false;

  fireAgent(p: Player): void {
    const live =
      this.entities.filter((e) => e instanceof MiniAgent && !e.dead).length + this.spawnQueue.filter((e) => e instanceof MiniAgent).length;
    if (live >= 2) return;
    const x = p.facing > 0 ? p.x + p.w - 2 : p.x - 6;
    const m = new MiniAgent(x, p.y + 4, p.facing);
    m.activated = true;
    this.spawn(m);
    this.agentCount++;
    this.sfx('agent');
  }

  tryWarp(p: Player): boolean {
    if (this.phase !== 'play') return false;
    for (const w of this.level.warps) {
      const left = w.tx * TILE;
      if (Math.abs(p.y + p.h - w.ty * TILE) > 0.5) continue;
      if (p.x >= left + 1 && p.x + p.w <= left + 2 * TILE - 1) {
        p.state = 'pipe-in';
        p.stateT = 0;
        p.vx = 0;
        p.vy = 0;
        this.pendingWarp = w;
        this.sfx('pipe');
        return true;
      }
    }
    return false;
  }

  landed(p: Player, impact: number): void {
    if (impact > 260) this.fx.dust(p.cx, p.y + p.h - 1, 3, this.dark ? '#5a5f78' : '#b8a898');
  }

  hurtPlayer(by: string): void {
    const p = this.player;
    const prevForm = p.form;
    const r = p.hurt();
    if (r === 'none') return;
    this.lastKiller = by;
    if (r === 'shrink') {
      this.freeze = 0.55;
      this.freezeFrom = prevForm;
      this.sfx('shrink');
      this.popup('DOWNGRADED TO SONNET', p.cx, p.y - 8, '#e5736e', 1.2);
    } else if (r === 'context') {
      this.sfx('hurt');
      this.shake(2, 0.2);
      this.popup(`CONTEXT ${p.context === 1 ? 34 : 67}%`, p.cx, p.y - 8, p.context === 1 ? '#f2b84b' : '#e5736e', 1.2);
    } else {
      this.killPlayer('context');
    }
  }

  killPlayer(cause: string): void {
    const p = this.player;
    if (p.state === 'dying' || this.phase === 'dead') return;
    if (cause === 'pit' && this.lastKiller === 'rm -rf ~/') cause = 'rmrf';
    p.die(cause);
    this.phase = 'dead';
    this.phaseT = 0;
    this.timerOn = false;
    this.hooks.music('death');
    if (cause !== 'pit' && cause !== 'rmrf') this.shake(2, 0.2);
  }

  private grow(form: Form): void {
    const p = this.player;
    this.freezeFrom = p.form;
    p.setForm(form, this.map);
    this.freeze = 0.7;
    this.sfx('powerUp');
  }

  private collectItem(item: Item): void {
    const p = this.player;
    item.dead = true;
    switch (item.kind) {
      case 'opus':
        if (p.form === 'small') {
          this.grow('big');
          this.popup('UPGRADED TO OPUS', p.cx, p.y - 10, '#f2b84b', 1.4);
        } else this.sfx('powerUp');
        this.addScore(1000, item.cx, item.y);
        break;
      case 'agent':
        if (p.form !== 'agent') {
          this.grow('agent');
          this.popup('SUBAGENTS UNLOCKED', p.cx, p.y - 10, '#f3ede4', 1.4);
        } else this.sfx('powerUp');
        this.addScore(1000, item.cx, item.y);
        break;
      case 'oneup':
        this.gainLife(item.cx, item.y);
        break;
      case 'bypass':
        p.star = 10;
        this.sfx('powerUp');
        this.hooks.music('bypass');
        this.popup('--dangerously-skip-permissions', p.cx, p.y - 10, '#ffffff', 1.6, true);
        this.addScore(1000);
        break;
      case 'compact':
        p.context = 0;
        this.sfx('powerUp');
        this.popup('/COMPACT: CONTEXT 0%', p.cx, p.y - 10, '#8fcb79', 1.4);
        this.addScore(1000);
        break;
      case 'ultrathink':
        this.slowmo = 8;
        this.sfx('powerUp');
        this.popup('ULTRATHINK', p.cx, p.y - 10, '#ffffff', 1.6, true);
        this.addScore(1000);
        break;
    }
  }

  // ---------------------------------------------------------------- update

  update(dt: number, c: Controls): void {
    if (this.paused) return;
    this.jumpHeld = c.jump;
    if (this.hitstop > 0) {
      this.hitstop--;
      return;
    }
    if (this.freeze > 0) {
      this.freeze -= dt;
      if (this.freeze <= 0) this.freezeFrom = null;
      this.fx.update(dt);
      return;
    }
    this.t += dt;
    this.phaseT += dt;
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.slowmo > 0) this.slowmo = Math.max(0, this.slowmo - dt);
    if (this.phase === 'play' && this.timerOn) this.tickTimer(dt);

    const p = this.player;
    if (this.phase === 'dead') {
      p.update(this, dt, c);
      this.fx.update(dt);
      const done = p.deathCause === 'pit' || p.deathCause === 'rmrf' ? this.phaseT > 1.4 : this.phaseT > 2.6;
      if (done && !this.deathSent) {
        this.deathSent = true;
        this.events.push({ type: 'died', cause: p.deathCause, killer: this.lastKiller, progress: this.progress() });
      }
      return;
    }

    this.flushSpawns();
    this.activate();
    const edt = this.slowmo > 0 ? dt * 0.45 : dt;
    for (const e of this.entities) if (e.isPlatform && e.activated && !e.dead) this.step(e, edt);

    if (this.phase === 'play') {
      if (p.state === 'play') p.update(this, dt, c);
      else this.scriptPlayer(dt);
      if (p.state === 'play') {
        this.tileContacts();
        this.checkFlag();
      }
    } else this.scriptPlayer(dt);

    for (const e of this.entities) {
      if (e.isPlatform || !e.activated || e.dead) continue;
      this.step(e, e.slowable ? edt : dt);
    }
    if (p.state === 'play' && this.phase === 'play') this.interactions();
    this.flushSpawns();

    this.checkBoss();
    this.starMusic();
    for (const [k, v] of this.bumps) {
      const nv = v + dt;
      if (nv > 0.16) this.bumps.delete(k);
      else this.bumps.set(k, nv);
    }
    this.fx.update(dt);
    this.updateCamera(false);
    this.cleanup();
    this.updatePhase(dt);
  }

  private step(e: Entity, dt: number): void {
    e.prevX = e.x;
    e.prevY = e.y;
    e.update(this, dt);
  }

  private tickTimer(dt: number): void {
    const before = this.time;
    this.time = Math.max(0, this.time - dt);
    if (!this.hurried && this.time < 100 && before >= 100) {
      this.hurried = true;
      this.sfx('warning');
      this.hooks.music(this.player.star > 0 ? 'bypass' : this.bossStarted ? 'boss' : this.level.music, { fast: true });
    }
    if (this.time <= 0) this.killPlayer('time');
  }

  private starMusic(): void {
    const s = this.player.star;
    if (this.prevStar > 0 && s <= 0 && this.phase === 'play') {
      this.hooks.music(this.bossStarted ? 'boss' : this.level.music, { fast: this.hurried });
    }
    this.prevStar = s;
  }

  private flushSpawns(): void {
    if (!this.spawnQueue.length) return;
    for (const e of this.spawnQueue) {
      e.prevX = e.x;
      e.prevY = e.y;
      this.entities.push(e);
    }
    this.spawnQueue = [];
  }

  private activate(): void {
    const right = this.camX + this.viewW + 32;
    const left = this.camX - 64;
    for (const e of this.entities) {
      if (e.activated) continue;
      if (e.alwaysActive || (e.x < right && e.x + e.w > left)) e.activated = true;
    }
  }

  private cleanup(): void {
    const left = this.camX - 200;
    const bottom = this.map.h * TILE + 80;
    for (const e of this.entities) {
      if (!e.activated || e.alwaysActive || e.isPlatform) continue;
      if (e instanceof Flagpole || e instanceof Checkpoint || e instanceof Gate || e instanceof RateLimit || e instanceof Spinner) continue;
      if (e.x + e.w < left && e.enemy) e.dead = true;
      if (e.y > bottom) e.dead = true;
    }
    if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);
  }

  private tileContacts(): void {
    const p = this.player;
    const l = Math.floor(p.x / TILE);
    const r = Math.floor((p.x + p.w - 0.01) / TILE);
    const t = Math.floor(p.y / TILE);
    const b = Math.floor((p.y + p.h - 0.01) / TILE);
    for (let tx = l; tx <= r; tx++) {
      for (let ty = t; ty <= b; ty++) {
        const tile = this.map.get(tx, ty);
        if (tile === T.TOKEN) {
          this.map.set(tx, ty, T.EMPTY);
          this.collectToken(tx * TILE + 8, ty * TILE + 8);
        } else if (tile === T.LAVA && p.y + p.h > ty * TILE + 5) {
          this.lastKiller = 'the red CI pipeline';
          this.killPlayer('lava');
          return;
        }
      }
    }
  }

  private interactions(): void {
    const p = this.player;
    for (const e of this.entities) {
      if (!e.activated || e.dead) continue;
      if (e instanceof Item) {
        if (e.collectable && overlaps(p, e)) this.collectItem(e);
        continue;
      }
      if (!e.enemy || e.dying) continue;
      const hit = e.hitsPlayer ? e.hitsPlayer(p) : overlaps(p, e);
      if (!hit) continue;
      if (p.star > 0 && e.killable) {
        this.knockEnemy(e, p.cx < e.cx ? 1 : -1, CHAIN[Math.min(p.stompChain++, CHAIN.length - 1)]);
        continue;
      }
      const tolerance = Math.max(6, e.h * 0.4);
      const stomp = e.stompable && p.vy > 0 && p.prevY + p.h <= e.prevY + tolerance;
      if (stomp) {
        e.onStomp(this, p);
        continue;
      }
      if (e.harmful) {
        if (p.invuln <= 0 && p.star <= 0) this.hurtPlayer(e.name);
        if (p.state !== 'play') return;
        continue;
      }
      e.onTouch(this, p);
    }

    // Subagents and spinning loops take out enemies.
    for (const a of this.entities) {
      if (a.dead || !a.activated) continue;
      if (a instanceof MiniAgent) {
        for (const e of this.entities) {
          if (e === a || e.dead || e.dying || !e.enemy || !e.activated || !overlaps(a, e)) continue;
          if (e instanceof Copilot) {
            if (e.vulnerable) e.hit(this, 'agent');
            a.vanish(this);
            break;
          }
          if (!e.killable) continue;
          this.knockEnemy(e, a.facing, 200);
          a.vanish(this);
          break;
        }
      } else if (a instanceof Loop && a.spinning) {
        for (const e of this.entities) {
          if (e === a || e.dead || e.dying || !e.enemy || !e.activated || !e.killable || !overlaps(a, e)) continue;
          if (e instanceof Loop && e.spinning) {
            this.knockEnemy(a, -a.facing, 500);
            this.knockEnemy(e, a.facing, 500);
            break;
          }
          this.knockEnemy(e, a.facing, CHAIN[Math.min(a.kills++, CHAIN.length - 1)]);
        }
      }
    }

    // Walkers bump into each other and turn around.
    const walkers = this.entities.filter(
      (e) =>
        e.activated &&
        !e.dead &&
        !e.dying &&
        (e instanceof Bug || e instanceof Flaky || e instanceof Leak || (e instanceof Loop && e.mode === 'walk')),
    );
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i];
        const b = walkers[j];
        if (!overlaps(a, b)) continue;
        if (a.cx < b.cx) {
          a.facing = -1;
          b.facing = 1;
        } else {
          a.facing = 1;
          b.facing = -1;
        }
      }
    }
  }

  private checkFlag(): void {
    const f = this.flag;
    const p = this.player;
    if (!f || f.passed || this.phase !== 'play') return;
    // Touching the pole, or walking into its base block, both count.
    if (p.x + p.w >= f.poleX - 9 && p.x < f.poleX + 8 && p.y + p.h > f.topY) {
      const height = f.bottomY - (p.y + p.h);
      const pts = height > 120 ? 5000 : height > 90 ? 2000 : height > 60 ? 800 : height > 30 ? 400 : 100;
      this.addScore(pts, f.poleX + 14, Math.max(f.topY + 10, p.y));
      p.state = 'flag';
      p.stateT = 0;
      p.vx = 0;
      p.vy = 0;
      p.x = f.poleX - p.w + 2;
      if (p.y + p.h > f.bottomY) p.y = f.bottomY - p.h;
      p.facing = 1;
      p.pose = 'pole';
      p.star = 0;
      this.phase = 'flag';
      this.phaseT = 0;
      this.timerOn = false;
      this.hooks.music(null);
      this.sfx('flag');
    }
  }

  private checkBoss(): void {
    const b = this.level.boss;
    if (!b || this.bossStarted || this.phase !== 'play') return;
    if (this.player.x > b.trigger) {
      this.bossStarted = true;
      this.bossLock = { x0: b.x0, x1: b.x1 };
      // Seal the entrance behind the player.
      const tx = Math.floor(b.x0 / TILE);
      for (let ty = 0; ty < 12; ty++) this.map.set(tx, ty, T.HARD);
      const floorY = this.groundBelow((b.x0 + b.x1) / 2, 4 * TILE) ?? 12 * TILE;
      this.boss = new Copilot(b.x0, b.x1, floorY);
      this.spawn(this.boss);
      this.hooks.music('boss', { fast: this.hurried });
      this.sfx('warning');
    }
  }

  /** Drives the player during cutscenes: flagpole, walk to PROD, pipes, victory. */
  private scriptPlayer(dt: number): void {
    const p = this.player;
    p.stateT += dt;
    switch (p.state) {
      case 'flag': {
        const f = this.flag!;
        p.pose = 'pole';
        const bottom = f.bottomY;
        if (p.y + p.h < bottom) p.y = Math.min(bottom - p.h, p.y + 150 * dt);
        if (f.flagY < bottom - 14) f.flagY = Math.min(bottom - 14, f.flagY + 150 * dt);
        if (p.y + p.h >= bottom && f.flagY >= bottom - 14 && !f.passed) {
          f.passed = true;
          p.stateT = 0;
          this.sfx('checkpoint');
          this.popup('✓ ALL TESTS PASSED', f.poleX, f.topY + 30, '#8fcb79', 2.6);
        }
        if (f.passed && p.stateT > 0.45) {
          p.x = f.poleX + 4;
          p.facing = -1;
          if (p.stateT > 0.7) {
            p.state = 'walkout';
            p.stateT = 0;
            p.facing = 1;
            this.phase = 'walkout';
            this.phaseT = 0;
            this.hooks.music('clear');
          }
        }
        break;
      }
      case 'walkout': {
        p.vx = 70;
        p.vy = Math.min(p.vy + 1500 * dt, 400);
        p.onGround = moveBody(p, this.map, dt).hitBottom;
        p.facing = 1;
        p.animate(dt);
        if (p.cx >= this.doorX && this.phase === 'walkout') {
          p.visible = false;
          p.state = 'gone';
          this.phase = 'tally';
          this.phaseT = 0;
          this.tallyLeft = Math.ceil(this.time);
        }
        break;
      }
      case 'pipe-in': {
        p.y += 34 * dt;
        p.pose = 'idle';
        if (p.stateT > 0.85 && this.pendingWarp) this.finishWarp(this.pendingWarp);
        break;
      }
      case 'pipe-out': {
        p.y -= 34 * dt;
        const exit = this.pipeExitTop;
        if (p.y + p.h <= exit) {
          p.y = exit - p.h;
          p.state = 'play';
          p.onGround = true;
        }
        break;
      }
      case 'victory':
        p.pose = 'victory';
        p.vx = 0;
        p.vy = Math.min(p.vy + 1500 * dt, 400);
        p.onGround = moveBody(p, this.map, dt).hitBottom;
        break;
      default:
        break;
    }
  }

  private pipeExitTop = 0;

  private finishWarp(w: Warp): void {
    const exit = this.level.exits[w.to];
    const p = this.player;
    this.pendingWarp = null;
    if (!exit) {
      p.state = 'play';
      return;
    }
    p.x = exit.tx * TILE + TILE - p.w / 2;
    if (exit.mode === 'up') {
      this.pipeExitTop = exit.ty * TILE;
      p.y = this.pipeExitTop + 2;
      p.state = 'pipe-out';
      p.stateT = 0;
    } else {
      p.y = exit.ty * TILE;
      p.vy = 0;
      p.state = 'play';
      p.onGround = false;
    }
    p.prevX = p.x;
    p.prevY = p.y;
    this.sfx('pipe');
    this.updateCamera(true);
  }

  private updatePhase(dt: number): void {
    switch (this.phase) {
      case 'tally': {
        if (this.tallyLeft > 0) {
          const n = Math.min(this.tallyLeft, Math.max(1, Math.ceil(this.tallyLeft * dt * 1.2)), Math.ceil(dt * 160));
          this.tallyLeft -= n;
          this.tallyBonus += n * 50;
          this.session.score += n * 50;
          this.time = Math.max(0, this.time - n);
          if (Math.floor(this.phaseT * 30) !== Math.floor((this.phaseT - dt) * 30)) this.sfx('tick');
          this.phaseT = 0;
        } else if (this.phaseT > 1.2) {
          this.phase = 'done';
          this.events.push({ type: 'cleared', timeBonus: this.tallyBonus });
        }
        break;
      }
      case 'boss-win':
        if (this.phaseT > 3.5) {
          this.phase = 'done';
          this.events.push({ type: 'bossDefeated' });
        }
        break;
      default:
        break;
    }
  }

  progress(): number {
    const start = this.level.startX;
    const end = this.level.goalX ?? this.level.boss?.x1 ?? this.map.w * TILE;
    return Math.max(0, Math.min(1, (this.player.x - start) / Math.max(1, end - start)));
  }

  // ---------------------------------------------------------------- camera

  private areaFor(x: number): { x0: number; x1: number } {
    for (const a of this.level.areas) if (x >= a.x0 && x < a.x1) return a;
    return this.level.areas[0];
  }

  updateCamera(snap: boolean): void {
    const p = this.player;
    const area = this.bossLock ?? this.areaFor(p.cx);
    let min = area.x0;
    let max = area.x1 - this.viewW;
    if (max < min) min = max = (area.x0 + area.x1) / 2 - this.viewW / 2;
    let desired = snap ? p.cx - this.viewW * 0.4 : this.camX;
    const lead = p.cx - desired;
    if (lead > this.viewW * 0.46) desired = p.cx - this.viewW * 0.46;
    else if (lead < this.viewW * 0.3) desired = p.cx - this.viewW * 0.3;
    desired = Math.max(min, Math.min(max, desired));
    if (this.bossLock && !snap) {
      // Pan smoothly into the arena, then stay inside it.
      this.camX += (desired - this.camX) * 0.08;
      if (Math.abs(desired - this.camX) < 0.5) this.camX = desired;
      return;
    }
    this.camX = desired;
  }

  setViewW(w: number): void {
    this.viewW = w;
    this.updateCamera(false);
  }

  // ---------------------------------------------------------------- drawing

  draw(g: CanvasRenderingContext2D): void {
    const shake = this.shakeT > 0 ? Math.round((Math.random() * 2 - 1) * this.shakeAmp) : 0;
    const shakeY = this.shakeT > 0 ? Math.round((Math.random() * 2 - 1) * this.shakeAmp * 0.6) : 0;
    if (this.shakeT <= 0) this.shakeAmp = 0;
    const camX = Math.round(this.camX) + shake;
    g.save();
    g.translate(0, shakeY);
    Bg.drawBackground(g, this.level.theme, camX, this.viewW, this.t);
    for (const d of this.level.decos) {
      if (d.x + 200 < camX || d.x - 40 > camX + this.viewW) continue;
      Props.drawDeco(g, d, camX, this.level.theme, this.t, this.player.state === 'gone');
    }
    for (const e of this.entities) if (e.activated && e.layer === 0 && !e.dead) e.draw(g, camX, this);
    const piping = this.player.state === 'pipe-in' || this.player.state === 'pipe-out';
    if (piping) this.drawPlayer(g, camX);
    TileArt.drawTiles(g, this, camX);
    for (const e of this.entities) if (e.activated && e.layer === 1 && !e.dead && !e.enemy) e.draw(g, camX, this);
    for (const e of this.entities) if (e.activated && e.layer === 1 && !e.dead && e.enemy) e.draw(g, camX, this);
    if (!piping) this.drawPlayer(g, camX);
    this.fx.draw(g, camX, this.t);
    g.restore();
    if (this.slowmo > 0) {
      g.fillStyle = 'rgba(120, 80, 220, 0.10)';
      g.fillRect(0, 0, this.viewW, 224);
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D, camX: number): void {
    const p = this.player;
    if (!p.visible) return;
    if (p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0 && p.state === 'play') return;
    let form: Form = p.form;
    if (this.freeze > 0 && this.freezeFrom) {
      // Flicker between the old and new form while transforming.
      const flip = Math.floor(this.freeze * 14) % 2 === 0;
      if (flip) form = this.freezeFrom;
    }
    Hero.drawPlayer(g, p, form, camX, this.t);
  }
}
