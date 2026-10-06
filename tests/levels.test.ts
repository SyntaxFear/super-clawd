import { describe, expect, it } from 'vitest';
import { buildLevel } from '../src/game/builder';
import { LEVELS } from '../src/game/levels';
import { T, TILE } from '../src/game/tiles';
import { solveLevel } from './solver';

describe('world 1 levels', () => {
  for (const def of LEVELS) {
    const level = buildLevel(def);

    it(`${def.id} has a start on solid ground and an ending`, () => {
      const tx = Math.floor((level.startX + 8) / TILE);
      const ty = Math.floor(level.startY / TILE) + 1;
      expect(level.map.solid(tx, ty)).toBe(true);
      expect(level.goalX !== null || level.boss !== null).toBe(true);
    });

    it(`${def.id} warps lead somewhere`, () => {
      for (const w of level.warps) expect(level.exits[w.to], `exit ${w.to}`).toBeDefined();
      for (const w of level.warps) expect(level.map.get(w.tx, w.ty)).toBe(T.PIPE_TL);
    });

    it(`${def.id} can be finished`, () => {
      const r = solveLevel(level);
      if (!r.reached)
        console.log(def.id, 'stuck near', r.frontier.map((f) => `${(f.x / TILE).toFixed(1)},${(f.y / TILE).toFixed(1)}`).join(' | '));
      expect(r.reached).toBe(true);
    }, 120000);
  }
});

describe('solver sanity', () => {
  it('rejects a level with a pit too wide to jump', () => {
    const level = buildLevel({
      id: 'x',
      name: 'impossible',
      theme: 'terminal',
      music: 'overworld',
      time: 100,
      width: 60,
      build(b) {
        b.start(2);
        b.ground(0, 10);
        b.ground(20, 59);
        b.goal(40);
      },
    });
    expect(solveLevel(level).reached).toBe(false);
  });

  it('rejects a wall taller than a jump', () => {
    const level = buildLevel({
      id: 'y',
      name: 'wall',
      theme: 'terminal',
      music: 'overworld',
      time: 100,
      width: 60,
      build(b) {
        b.start(2);
        b.ground(0, 59);
        b.hard(15, 6, 1, 6);
        b.goal(40);
      },
    });
    expect(solveLevel(level).reached).toBe(false);
  });

  it('accepts a 4-tile pit', () => {
    const level = buildLevel({
      id: 'z',
      name: 'gap',
      theme: 'terminal',
      music: 'overworld',
      time: 100,
      width: 60,
      build(b) {
        b.start(2);
        b.ground(0, 10);
        b.ground(15, 59);
        b.goal(40);
      },
    });
    expect(solveLevel(level).reached).toBe(true);
  });
});
