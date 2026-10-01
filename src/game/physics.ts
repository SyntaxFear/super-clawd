import { TILE, T } from './tiles';
import type { TileMap } from './tilemap';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
}

export interface MoveResult {
  hitLeft: boolean;
  hitRight: boolean;
  hitTop: boolean;
  hitBottom: boolean;
  /** Tiles the head touched when moving up (for block bumps). */
  ceiling: { tx: number; ty: number }[];
}

export interface MoveOpts {
  /** Land on one-way platforms (default true). */
  oneWay?: boolean;
  /** Treat hidden blocks as solid when rising into them from below (player only). */
  hidden?: boolean;
  /** Slide around ceiling corners clipped by at most this many pixels. */
  corner?: number;
}

const EPS = 0.001;

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function solidRow(map: TileMap, x: number, w: number, ty: number): boolean {
  const l = Math.floor(x / TILE);
  const r = Math.floor((x + w - EPS) / TILE);
  for (let tx = l; tx <= r; tx++) if (map.solid(tx, ty)) return true;
  return false;
}

/** True when the box overlaps any solid tile. */
export function boxBlocked(map: TileMap, x: number, y: number, w: number, h: number): boolean {
  const t = Math.floor(y / TILE);
  const b = Math.floor((y + h - EPS) / TILE);
  for (let ty = t; ty <= b; ty++) if (solidRow(map, x, w, ty)) return true;
  return false;
}

/** Axis-separated tile collision. Moves the body by its velocity and resolves against the map. */
export function moveBody(b: Body, map: TileMap, dt: number, opts: MoveOpts = {}): MoveResult {
  const res: MoveResult = { hitLeft: false, hitRight: false, hitTop: false, hitBottom: false, ceiling: [] };

  const dx = b.vx * dt;
  if (dx !== 0) {
    b.x += dx;
    const top = Math.floor(b.y / TILE);
    const bot = Math.floor((b.y + b.h - EPS) / TILE);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - EPS) / TILE);
      for (let ty = top; ty <= bot; ty++) {
        if (map.solid(tx, ty)) {
          b.x = tx * TILE - b.w;
          b.vx = 0;
          res.hitRight = true;
          break;
        }
      }
    } else {
      const tx = Math.floor(b.x / TILE);
      for (let ty = top; ty <= bot; ty++) {
        if (map.solid(tx, ty)) {
          b.x = (tx + 1) * TILE;
          b.vx = 0;
          res.hitLeft = true;
          break;
        }
      }
    }
  }

  const dy = b.vy * dt;
  if (dy !== 0) {
    const prevTop = b.y;
    const prevBottom = b.y + b.h;
    b.y += dy;
    const l = Math.floor(b.x / TILE);
    const r = Math.floor((b.x + b.w - EPS) / TILE);
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h - EPS) / TILE);
      const surface = ty * TILE;
      for (let tx = l; tx <= r; tx++) {
        const t = map.get(tx, ty);
        const land = map.solid(tx, ty) || (opts.oneWay !== false && t === T.ONEWAY && prevBottom <= surface + EPS);
        if (land) {
          b.y = surface - b.h;
          b.vy = 0;
          res.hitBottom = true;
          break;
        }
      }
    } else {
      const ty = Math.floor(b.y / TILE);
      const hits: number[] = [];
      for (let tx = l; tx <= r; tx++) {
        const t = map.get(tx, ty);
        const fromBelow = prevTop >= (ty + 1) * TILE - EPS;
        if (map.solid(tx, ty) || (opts.hidden && t === T.HIDDEN && fromBelow)) hits.push(tx);
      }
      if (hits.length) {
        let corrected = false;
        const c = opts.corner ?? 0;
        if (c > 0 && hits.length === 1 && l !== r) {
          // Head clipped one corner: nudge sideways instead of stopping.
          const tx = hits[0];
          if (tx === l) {
            const push = (l + 1) * TILE - b.x;
            if (push <= c && !boxBlocked(map, b.x + push, b.y, b.w, b.h)) {
              b.x += push;
              corrected = true;
            }
          } else if (tx === r) {
            const push = b.x + b.w - r * TILE;
            if (push <= c && !boxBlocked(map, b.x - push, b.y, b.w, b.h)) {
              b.x -= push;
              corrected = true;
            }
          }
        }
        if (!corrected) {
          b.y = (ty + 1) * TILE;
          b.vy = 0;
          res.hitTop = true;
          for (const tx of hits) res.ceiling.push({ tx, ty });
        }
      }
    }
  }
  return res;
}

/** Is there floor directly under the given x at the body's feet? Used by ledge-aware walkers. */
export function floorAt(map: TileMap, x: number, feetY: number): boolean {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor((feetY + 1) / TILE);
  return map.solid(tx, ty) || map.oneWay(tx, ty);
}
