import { TileMap } from './tilemap';
import { ROWS, T, TILE, type Content } from './tiles';

export type Theme = 'terminal' | 'deps' | 'cloud' | 'hangar';
export type MusicId = 'overworld' | 'underground' | 'sky' | 'castle' | 'boss';
export type EnemyKind = 'bug' | 'loop' | 'flaky' | 'nullptr' | 'leak' | 'deprecated' | 'thwomp' | 'bubble';

export interface Spawn {
  kind: string;
  /** Pixel position of the top-left corner. */
  x: number;
  y: number;
  opts?: Record<string, unknown>;
}

export interface Deco {
  kind: string;
  x: number;
  y: number;
  text?: string[];
  w?: number;
  h?: number;
}

export interface Area {
  x0: number;
  x1: number;
}

export interface Warp {
  /** Left tile column of the pipe the player stands on. */
  tx: number;
  /** Row of the pipe's top tile. */
  ty: number;
  to: string;
}

export interface WarpExit {
  tx: number;
  ty: number;
  /** 'up' = rise out of a pipe top, 'drop' = fall in from the ceiling. */
  mode: 'up' | 'drop';
}

export interface LevelData {
  id: string;
  name: string;
  theme: Theme;
  music: MusicId;
  time: number;
  map: TileMap;
  spawns: Spawn[];
  decos: Deco[];
  startX: number;
  startY: number;
  /** Pixel x of the goal flagpole (null for boss levels). */
  goalX: number | null;
  areas: Area[];
  warps: Warp[];
  exits: Record<string, WarpExit>;
  boss: { x0: number; x1: number; trigger: number } | null;
}

export interface LevelDef {
  id: string;
  name: string;
  theme: Theme;
  music: MusicId;
  time: number;
  width: number;
  build(b: Builder): void;
}

/** Fluent level authoring in tile coordinates. Row 0 is the top, row 13 the bottom. */
export class Builder {
  readonly map: TileMap;
  readonly spawns: Spawn[] = [];
  readonly decos: Deco[] = [];
  readonly areas: Area[] = [];
  readonly warps: Warp[] = [];
  readonly exits: Record<string, WarpExit> = {};
  startX = 2 * TILE;
  startY = 11 * TILE;
  goalX: number | null = null;
  boss: LevelData['boss'] = null;

  constructor(readonly width: number) {
    this.map = new TileMap(width, ROWS);
  }

  private fill(x0: number, y0: number, x1: number, y1: number, t: number): this {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.map.set(x, y, t);
    return this;
  }

  /** Solid ground from column x0 to x1 (inclusive), top surface at row `top`. */
  ground(x0: number, x1: number, top = 12): this {
    return this.fill(x0, top, x1, ROWS - 1, T.GROUND);
  }

  /** Clear everything in a column range (pits, doorways). */
  clear(x0: number, x1: number, y0 = 0, y1 = ROWS - 1): this {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        this.map.set(x, y, T.EMPTY);
        this.map.contents.delete(this.map.idx(x, y));
      }
    return this;
  }

  /** Rectangle of ground-style terrain (floating islands, ceilings, walls). */
  block(x: number, y: number, w: number, h: number): this {
    return this.fill(x, y, x + w - 1, y + h - 1, T.GROUND);
  }

  hard(x: number, y: number, w = 1, h = 1): this {
    return this.fill(x, y, x + w - 1, y + h - 1, T.HARD);
  }

  brick(x: number, y: number, n = 1, content?: Content): this {
    for (let i = 0; i < n; i++) {
      this.map.set(x + i, y, T.BRICK);
      if (content) this.map.contents.set(this.map.idx(x + i, y), content);
    }
    return this;
  }

  prompt(x: number, y: number, content: Content = 'token'): this {
    this.map.set(x, y, T.PROMPT);
    this.map.contents.set(this.map.idx(x, y), content);
    return this;
  }

  hidden(x: number, y: number, content: Content = 'oneup'): this {
    this.map.set(x, y, T.HIDDEN);
    this.map.contents.set(this.map.idx(x, y), content);
    return this;
  }

  used(x: number, y: number): this {
    this.map.set(x, y, T.USED);
    return this;
  }

  oneway(x: number, y: number, w: number): this {
    return this.fill(x, y, x + w - 1, y, T.ONEWAY);
  }

  tokens(x: number, y: number, n = 1, dx = 1, dy = 0): this {
    for (let i = 0; i < n; i++) this.map.set(x + i * dx, y + i * dy, T.TOKEN);
    return this;
  }

  /** Token arc over a gap: n tokens in a gentle curve. */
  arc(x: number, y: number, n: number): this {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const lift = Math.round(Math.sin(t * Math.PI) * 2);
      this.map.set(x + i, y - lift, T.TOKEN);
    }
    return this;
  }

  lava(x0: number, x1: number, top = 12): this {
    return this.fill(x0, top, x1, ROWS - 1, T.LAVA);
  }

  /** Two-wide pipe standing on the ground (or on `base`), `height` tiles tall. */
  pipe(x: number, height: number, opts: { base?: number; warp?: string; exit?: string } = {}): this {
    const base = opts.base ?? 12;
    const top = base - height;
    this.map.set(x, top, T.PIPE_TL);
    this.map.set(x + 1, top, T.PIPE_TR);
    for (let y = top + 1; y < base; y++) {
      this.map.set(x, y, T.PIPE_L);
      this.map.set(x + 1, y, T.PIPE_R);
    }
    if (opts.warp) this.warps.push({ tx: x, ty: top, to: opts.warp });
    if (opts.exit) this.exits[opts.exit] = { tx: x, ty: top, mode: 'up' };
    return this;
  }

  /** Pipe hanging from the ceiling (decorative or a drop-in entry). */
  ceilingPipe(x: number, length: number, top = 0): this {
    for (let y = top; y < top + length - 1; y++) {
      this.map.set(x, y, T.PIPE_L);
      this.map.set(x + 1, y, T.PIPE_R);
    }
    this.map.set(x, top + length - 1, T.PIPE_TL);
    this.map.set(x + 1, top + length - 1, T.PIPE_TR);
    return this;
  }

  dropExit(id: string, tx: number, ty: number): this {
    this.exits[id] = { tx, ty, mode: 'drop' };
    return this;
  }

  /** Staircase of hard blocks. dir 'up' rises to the right, 'down' falls to the right. */
  stairs(x: number, height: number, dir: 'up' | 'down' = 'up', base = 12, width = height): this {
    for (let i = 0; i < width; i++) {
      const hgt = dir === 'up' ? Math.min(i + 1, height) : Math.max(height - i, 1);
      this.hard(x + i, base - hgt, 1, hgt);
    }
    return this;
  }

  enemy(kind: EnemyKind, x: number, y = 11, opts?: Record<string, unknown>): this {
    this.spawns.push({ kind, x: x * TILE, y: y * TILE, opts });
    return this;
  }

  spawn(kind: string, x: number, y: number, opts?: Record<string, unknown>): this {
    this.spawns.push({ kind, x: x * TILE, y: y * TILE, opts });
    return this;
  }

  /** Floating platform `w` tiles wide. kind: 'move-h' | 'move-v' | 'fall'. */
  platform(kind: 'move-h' | 'move-v' | 'fall', x: number, y: number, w: number, range = 0, speed = 40, phase = 0): this {
    return this.spawn('platform', x, y, { mode: kind, tiles: w, range: range * TILE, speed, phase });
  }

  spinner(x: number, y: number, len: number, speed = 1.6): this {
    this.map.set(x, y, T.USED);
    return this.spawn('spinner', x, y, { len, speed });
  }

  checkpoint(x: number, y = 11): this {
    return this.spawn('checkpoint', x, y);
  }

  /** "Allow this command?" gate standing on the ground at column x. */
  gate(x: number, cmd: string, safe: boolean, base = 12): this {
    for (let y = 2; y < base; y++) this.map.set(x, y, T.BARRIER);
    return this.spawn('gate', x, 2, { cmd, safe, base });
  }

  rateLimit(x: number, seconds: number, base = 12): this {
    for (let y = 2; y < base; y++) this.map.set(x, y, T.BARRIER);
    return this.spawn('ratelimit', x, 2, { seconds, base });
  }

  /** Flagpole at column x with the PROD building a few tiles to the right. */
  goal(x: number, base = 12): this {
    this.goalX = x * TILE;
    this.hard(x, base - 1);
    this.spawn('flagpole', x, base - 1);
    this.decos.push({ kind: 'prod', x: (x + 5) * TILE, y: (base - 5) * TILE });
    return this;
  }

  start(x: number, y = 11): this {
    this.startX = x * TILE;
    this.startY = y * TILE;
    return this;
  }

  deco(kind: string, x: number, y: number, extra: Partial<Deco> = {}): this {
    this.decos.push({ kind, x: x * TILE, y: y * TILE, ...extra });
    return this;
  }

  sign(x: number, y: number, lines: string[]): this {
    return this.deco('sign', x, y, { text: lines });
  }

  area(x0: number, x1: number): this {
    this.areas.push({ x0: x0 * TILE, x1: (x1 + 1) * TILE });
    return this;
  }

  bossArena(x0: number, x1: number, trigger: number): this {
    this.boss = { x0: x0 * TILE, x1: (x1 + 1) * TILE, trigger: trigger * TILE };
    return this;
  }
}

export function buildLevel(def: LevelDef): LevelData {
  const b = new Builder(def.width);
  def.build(b);
  if (b.areas.length === 0) b.area(0, def.width - 1);
  return {
    id: def.id,
    name: def.name,
    theme: def.theme,
    music: def.music,
    time: def.time,
    map: b.map,
    spawns: b.spawns,
    decos: b.decos,
    startX: b.startX,
    startY: b.startY,
    goalX: b.goalX,
    areas: b.areas,
    warps: b.warps,
    exits: b.exits,
    boss: b.boss,
  };
}
