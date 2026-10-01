import { describe, expect, it } from 'vitest';
import { PHYS, Player } from '../src/game/player';
import { T, TILE } from '../src/game/tiles';
import { ctl, DT, flatMap, settle, StubHost } from './helpers';

function jumpApex(runFrames: number, run: boolean, holdFrames: number): { rise: number; distance: number } {
  const map = flatMap(200);
  const host = new StubHost(map);
  const p = new Player(2 * TILE, 11 * TILE);
  settle(p, host);
  for (let i = 0; i < runFrames; i++) p.update(host, DT, ctl({ right: true, run }));
  const groundY = p.y;
  const startX = p.x;
  let minY = p.y;
  p.update(host, DT, ctl({ right: true, run, jump: true, jumpPressed: true }));
  let f = 0;
  while (!p.onGround && f < 300) {
    p.update(host, DT, ctl({ right: true, run, jump: f < holdFrames }));
    minY = Math.min(minY, p.y);
    f++;
  }
  return { rise: groundY - minY, distance: p.x - startX };
}

describe('player movement', () => {
  it('stands on flat ground', () => {
    const host = new StubHost(flatMap());
    const p = new Player(32, 100);
    settle(p, host, 60);
    expect(p.onGround).toBe(true);
    expect(p.y + p.h).toBe(12 * TILE);
  });

  it('reaches walk and run top speeds', () => {
    const host = new StubHost(flatMap(200));
    const p = new Player(32, 11 * TILE);
    settle(p, host);
    for (let i = 0; i < 90; i++) p.update(host, DT, ctl({ right: true }));
    expect(p.vx).toBeCloseTo(PHYS.WALK, 0);
    for (let i = 0; i < 90; i++) p.update(host, DT, ctl({ right: true, run: true }));
    expect(p.vx).toBeCloseTo(PHYS.RUN, 0);
  });

  it('jump heights fit the level grid', () => {
    const walk = jumpApex(60, false, 999);
    const run = jumpApex(90, true, 999);
    const tap = jumpApex(0, false, 1);
    // A walking jump must clear 4 tiles (stand on blocks 4 rows above ground).
    expect(walk.rise).toBeGreaterThan(4 * TILE + 2);
    expect(walk.rise).toBeLessThan(5 * TILE);
    expect(run.rise).toBeGreaterThan(walk.rise);
    expect(run.rise).toBeLessThan(6 * TILE);
    expect(tap.rise).toBeLessThan(2 * TILE);
    expect(run.distance).toBeGreaterThan(6 * TILE);
    console.log({ walk, run, tap });
  });

  it('bumps a block overhead and stops', () => {
    const map = flatMap();
    map.set(4, 8, T.BRICK);
    const host = new StubHost(map);
    const p = new Player(4 * TILE + 2, 11 * TILE);
    settle(p, host);
    p.update(host, DT, ctl({ jump: true, jumpPressed: true }));
    for (let i = 0; i < 40; i++) p.update(host, DT, ctl({ jump: true }));
    expect(host.bumps).toContainEqual({ tx: 4, ty: 8 });
  });

  it('slides around a ceiling corner it barely clips', () => {
    const map = flatMap();
    map.set(5, 8, T.BRICK);
    const host = new StubHost(map);
    // Player overlaps column 5 by 3 px only.
    const p = new Player(5 * TILE - 12 + 3, 11 * TILE);
    settle(p, host);
    p.update(host, DT, ctl({ jump: true, jumpPressed: true }));
    let minY = p.y;
    for (let i = 0; i < 30; i++) {
      p.update(host, DT, ctl({ jump: true }));
      minY = Math.min(minY, p.y);
    }
    expect(host.bumps.length).toBe(0);
    expect(minY).toBeLessThan(8 * TILE);
  });

  it('dies in a pit', () => {
    const map = flatMap(20);
    for (let y = 12; y < 14; y++) (map.set(5, y, T.EMPTY), map.set(6, y, T.EMPTY));
    const host = new StubHost(map);
    const p = new Player(5 * TILE + 8, 9 * TILE);
    for (let i = 0; i < 120 && !host.killed; i++) p.update(host, DT, ctl({}));
    expect(host.killed).toBe('pit');
  });

  it('big form crouches under a one-tile gap', () => {
    const map = flatMap();
    const host = new StubHost(map);
    const p = new Player(3 * TILE, 10 * TILE);
    settle(p, host);
    p.setForm('big', map);
    settle(p, host);
    expect(p.h).toBe(18);
    p.update(host, DT, ctl({ down: true }));
    expect(p.crouch).toBe(true);
    expect(p.h).toBe(12);
    expect(p.y + p.h).toBe(12 * TILE);
  });
});
