import type { LevelData } from '../src/game/builder';
import { NO_CONTROLS, Player, type Controls, type PlatformLike, type PlayerHost } from '../src/game/player';
import { T, TILE } from '../src/game/tiles';
import type { TileMap } from '../src/game/tilemap';

/**
 * Brute-force reachability check: from the start, try runs and jumps of many lengths using the
 * real player physics, and see if the goal can be reached. Enemies are ignored, gates are open,
 * moving platforms are sampled at several frozen positions.
 */
class SolverHost implements PlayerHost {
  dead = false;
  constructor(
    public map: TileMap,
    private plats: PlatformLike[],
  ) {}
  sfx(): void {}
  bump(): void {}
  platformList(): readonly PlatformLike[] {
    return this.plats;
  }
  fireAgent(): void {}
  tryWarp(): boolean {
    return false;
  }
  killPlayer(): void {
    this.dead = true;
  }
  landed(): void {}
}

export interface SolveResult {
  reached: boolean;
  states: number;
  maxX: number;
  /** Furthest standing positions, useful when a level is unsolvable. */
  frontier: { x: number; y: number }[];
}

function samplePlatforms(level: LevelData): PlatformLike[] {
  const out: PlatformLike[] = [];
  for (const s of level.spawns) {
    if (s.kind !== 'platform') continue;
    const o = s.opts as { mode: string; tiles: number; range: number };
    const w = o.tiles * TILE;
    const n = o.mode === 'fall' ? 1 : 5;
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (o.range * k) / (n - 1);
      out.push({ x: s.x + (o.mode === 'move-h' ? off : 0), y: s.y + (o.mode === 'move-v' ? off : 0), w, dx: 0, dy: 0 });
    }
  }
  return out;
}

function lavaTouch(map: TileMap, p: Player): boolean {
  const l = Math.floor(p.x / TILE);
  const r = Math.floor((p.x + p.w - 0.01) / TILE);
  const t = Math.floor(p.y / TILE);
  const b = Math.floor((p.y + p.h - 0.01) / TILE);
  for (let tx = l; tx <= r; tx++) for (let ty = t; ty <= b; ty++) if (map.get(tx, ty) === T.LAVA && p.y + p.h > ty * TILE + 5) return true;
  return false;
}

const DT = 1 / 60;

export function solveLevel(level: LevelData, opts: { maxStates?: number; goalX?: number } = {}): SolveResult {
  const map = level.map.clone();
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === T.BARRIER) map.tiles[i] = T.EMPTY;
  const plats = samplePlatforms(level);
  const host = new SolverHost(map, plats);
  const goalX = opts.goalX ?? (level.goalX !== null ? level.goalX - 8 : level.boss ? level.boss.trigger + 32 : map.w * TILE - 32);
  const maxStates = opts.maxStates ?? 6000;

  const start = new Player(level.startX + 2, 0);
  start.placeFeet(level.startX + 2, level.startY + TILE);
  const queue: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
  const seen = new Set<string>();
  const key = (x: number, y: number) => `${Math.round(x / 6)},${Math.round(y)}`;
  seen.add(key(start.x, start.y));
  let maxX = start.x;
  let reached = false;

  const runups = [0, 6, 14, 26];
  const holds = [2, 6, 11, 18, 40];

  const simulate = (
    sx: number,
    sy: number,
    dir: number,
    runup: number,
    hold: number,
    steerOff: number,
  ): { x: number; y: number } | null => {
    const p = new Player(sx, sy);
    p.onGround = true;
    host.dead = false;
    const ctl = (jump: boolean, jumpPressed: boolean, steer: boolean): Controls => ({
      ...NO_CONTROLS,
      left: steer && dir < 0,
      right: steer && dir > 0,
      run: true,
      jump,
      jumpPressed,
    });
    let f = 0;
    for (; f < runup; f++) {
      p.update(host, DT, ctl(false, false, true));
      if (host.dead || lavaTouch(map, p)) return null;
      if (!p.onGround) break;
    }
    const jumped = hold > 0 && p.onGround;
    if (jumped) p.update(host, DT, ctl(true, true, true));
    let air = 0;
    for (let k = 0; k < 240; k++) {
      const steer = steerOff <= 0 || k < steerOff;
      p.update(host, DT, ctl(jumped && k < hold, false, steer));
      if (host.dead || lavaTouch(map, p)) return null;
      if (p.x >= goalX) return { x: p.x, y: p.y };
      if (p.onGround && (air > 2 || !jumped)) {
        // Let it come to a stop so the next action starts from rest.
        for (let s = 0; s < 30 && Math.abs(p.vx) > 1; s++) {
          p.update(host, DT, NO_CONTROLS);
          if (host.dead) return null;
        }
        if (!p.onGround) continue;
        return { x: p.x, y: p.y };
      }
      if (!p.onGround) air++;
    }
    return null;
  };

  let states = 0;
  while (queue.length && states < maxStates) {
    const s = queue.shift()!;
    states++;
    for (const dir of [1, -1]) {
      for (const runup of runups) {
        const holdsFor = runup === 0 ? holds : holds.slice(1);
        for (const hold of [0, ...holdsFor]) {
          if (hold === 0 && runup === 0) continue;
          for (const steerOff of hold > 0 ? [0, 14] : [0]) {
            const r = simulate(s.x, s.y, dir, runup, hold, steerOff);
            if (!r) continue;
            if (r.x >= goalX) {
              reached = true;
              maxX = Math.max(maxX, r.x);
              return { reached, states, maxX, frontier: [] };
            }
            const k = key(r.x, r.y);
            if (seen.has(k)) continue;
            seen.add(k);
            maxX = Math.max(maxX, r.x);
            queue.push(r);
          }
        }
      }
    }
  }
  const frontier = [...seen]
    .map((k) => k.split(',').map(Number))
    .map(([x, y]) => ({ x: x * 6, y }))
    .sort((a, b) => b.x - a.x)
    .slice(0, 5);
  return { reached, states, maxX, frontier };
}
