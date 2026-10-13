import { describe, expect, it } from 'vitest';
import type { LevelData } from '../src/game/builder';
import { buildLevel } from '../src/game/builder';
import { Platform } from '../src/game/entities/props';
import { LEVELS } from '../src/game/levels';
import { NO_CONTROLS, type Controls, type Player } from '../src/game/player';
import { TILE } from '../src/game/tiles';
import { newSession, World } from '../src/game/world';

/**
 * Timing-aware route bot for the moving-platform sections. Unlike the static solver it uses the real
 * world simulation (platforms really move, broken builds really crumble) and searches for a wait + jump
 * combination for each hop, like a player waiting for the right moment.
 */

const DT = 1 / 60;

interface Hop {
  wait: number;
  runup: number;
  hold: number;
}

type Target = (p: Player, w: World) => boolean;

function noEnemies(level: LevelData): LevelData {
  const keep = new Set(['platform', 'checkpoint', 'flagpole', 'gate', 'ratelimit', 'hint']);
  return { ...level, spawns: level.spawns.filter((s) => keep.has(s.kind)) };
}

function tick(w: World, c: Partial<Controls>): void {
  w.update(DT, { ...NO_CONTROLS, ...c });
  for (const ev of w.events.splice(0)) if (ev.type === 'gate') w.answerGate(ev.gate, ev.gate.safe);
}

function fresh(level: LevelData, startTile: number, surfaceRow: number): World {
  const w = new World(level, newSession(), { sfx() {}, music() {} }, { viewW: 320 });
  w.player.placeFeet(startTile * TILE + 2, surfaceRow * TILE);
  w.player.onGround = true;
  w.updateCamera(true);
  for (let i = 0; i < 3; i++) tick(w, {});
  return w;
}

/** Run one hop. Returns false if Clawd died. */
function exec(w: World, h: Hop): boolean {
  for (let i = 0; i < h.wait; i++) tick(w, {});
  for (let i = 0; i < h.runup; i++) tick(w, { right: true, run: true });
  tick(w, { right: true, run: true, jump: true, jumpPressed: true });
  let air = 0;
  for (let k = 0; k < 300; k++) {
    tick(w, { right: true, run: true, jump: k < h.hold });
    if (w.phase === 'dead') return false;
    if (!w.player.onGround) air++;
    else if (air > 2) break;
  }
  // Stop on the landing spot.
  for (let k = 0; k < 4; k++) tick(w, { left: w.player.vx > 20 });
  return w.phase !== 'dead';
}

function findRoute(level: LevelData, start: [number, number], targets: Target[]): { ok: boolean; reached: number; plan?: Hop[] } {
  const plan: Hop[] = [];
  const replay = () => {
    const w = fresh(level, start[0], start[1]);
    for (const h of plan) if (!exec(w, h)) return null;
    return w;
  };
  for (let i = 0; i < targets.length; i++) {
    let found: Hop | null = null;
    search: for (let wait = 0; wait <= 300; wait += 5) {
      for (const runup of [0, 8]) {
        for (const hold of [6, 12, 20, 40]) {
          const w = replay();
          if (!w) return { ok: false, reached: i };
          const hop = { wait, runup, hold };
          if (exec(w, hop) && w.player.onGround && targets[i](w.player, w)) {
            found = hop;
            break search;
          }
        }
      }
    }
    if (!found) return { ok: false, reached: i };
    plan.push(found);
  }
  return { ok: true, reached: targets.length, plan };
}

const onPlatformAt =
  (tileX: number): Target =>
  (p) =>
    p.standingOn instanceof Platform && Math.abs(p.standingOn.ox - tileX * TILE) < 2;
const onGroundPast =
  (tileX: number): Target =>
  (p) =>
    !p.standingOn && p.x >= tileX * TILE;

function expectRoute(r: { ok: boolean; reached: number; plan?: Hop[] }, hops: number, label: string): void {
  if (r.plan) console.log(label, r.plan.map((h) => `wait ${h.wait}f run ${h.runup}f hold ${h.hold}f`).join(' → '));
  expect({ ok: r.ok, reached: r.reached }).toEqual({ ok: true, reached: hops });
}

const L = (id: string) => noEnemies(buildLevel(LEVELS.find((l) => l.id === id)!));

describe('moving-platform routes (real timing)', () => {
  it('1-2: ride both lifts over the long pit', () => {
    const r = findRoute(L('1-2'), [102, 12], [onPlatformAt(106), onPlatformAt(112), onGroundPast(117)]);
    expectRoute(r, 3, expect.getState().currentTestName ?? '');
  });

  it('1-3: first moving platform', () => {
    const r = findRoute(L('1-3'), [18, 10], [onPlatformAt(22), onGroundPast(33)]);
    expectRoute(r, 2, expect.getState().currentTestName ?? '');
  });

  it('1-3: three broken builds in a row', () => {
    const r = findRoute(L('1-3'), [36, 11], [onPlatformAt(41), onPlatformAt(45), onPlatformAt(49), onGroundPast(53)]);
    expectRoute(r, 4, expect.getState().currentTestName ?? '');
  });

  it('1-3: the two elevators', () => {
    const r = findRoute(L('1-3'), [60, 10], [onPlatformAt(64), onPlatformAt(69), onGroundPast(74)]);
    expectRoute(r, 3, expect.getState().currentTestName ?? '');
  });

  it('1-3: long mover and a broken build', () => {
    const r = findRoute(L('1-3'), [112, 10], [onPlatformAt(116), onPlatformAt(129), onGroundPast(132)]);
    expectRoute(r, 3, expect.getState().currentTestName ?? '');
  });

  it('1-3: last two broken builds after the rm -rf gate', () => {
    const r = findRoute(L('1-3'), [147, 11], [onPlatformAt(152), onPlatformAt(156), onGroundPast(160)]);
    expectRoute(r, 3, expect.getState().currentTestName ?? '');
  });

  it('1-4: the platform over the red pipeline', () => {
    const r = findRoute(L('1-4'), [71, 12], [onPlatformAt(74), onGroundPast(83)]);
    expectRoute(r, 2, expect.getState().currentTestName ?? '');
  });
});

describe('route bot sanity', () => {
  it('cannot cross the 1-2 pit without the lifts', () => {
    const level = L('1-2');
    const noLifts = { ...level, spawns: level.spawns.filter((sp) => sp.kind !== 'platform') };
    const r = findRoute(noLifts, [102, 12], [onGroundPast(117)]);
    expect(r.ok).toBe(false);
  });
});
