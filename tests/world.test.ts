import { describe, expect, it } from 'vitest';
import { buildLevel, type Builder } from '../src/game/builder';
import { Bug, Loop } from '../src/game/entities/enemies';
import { Item } from '../src/game/entities/items';
import { Gate } from '../src/game/entities/props';
import { NO_CONTROLS, type Controls } from '../src/game/player';
import { T, TILE } from '../src/game/tiles';
import { newSession, World, type WorldEvent } from '../src/game/world';

const DT = 1 / 60;

function mk(build: (b: Builder) => void, width = 60): World {
  const level = buildLevel({ id: 't', name: 'test', theme: 'terminal', music: 'overworld', time: 300, width, build });
  const hooks = { sfx() {}, music() {} };
  return new World(level, newSession(), hooks, { viewW: 320 });
}

function run(w: World, frames: number, c: Partial<Controls> = {}): WorldEvent[] {
  const evs: WorldEvent[] = [];
  for (let i = 0; i < frames; i++) {
    w.update(DT, { ...NO_CONTROLS, ...c });
    evs.push(...w.events.splice(0));
  }
  return evs;
}

describe('world interactions', () => {
  it('stomping a bug fixes it and bounces Clawd', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.enemy('bug', 6);
    });
    const bug = w.entities.find((e) => e instanceof Bug)!;
    run(w, 2);
    // Drop Clawd onto the bug from above.
    w.player.x = bug.x;
    w.player.y = bug.y - 40;
    w.player.prevY = w.player.y;
    w.player.onGround = false;
    w.player.vy = 200;
    let bounced = false;
    for (let i = 0; i < 30 && !bounced; i++) {
      run(w, 1);
      if (w.player.vy < 0) bounced = true;
    }
    expect(bounced).toBe(true);
    expect(bug.dying).toBe(true);
    expect(w.session.score).toBeGreaterThanOrEqual(100);
    expect(w.session.bugsFixed).toBe(1);
    expect(w.player.context).toBe(0);
  });

  it('walking into a bug fills the context window', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.enemy('bug', 8);
    });
    run(w, 120, { right: true });
    expect(w.player.context).toBe(1);
    expect(w.player.invuln).toBeGreaterThan(0);
  });

  it('three hits as Sonnet end the run with a context death', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
    });
    run(w, 2);
    w.hurtPlayer('a Bug');
    w.player.invuln = 0;
    w.hurtPlayer('a Bug');
    w.player.invuln = 0;
    w.hurtPlayer('a Flaky Test');
    const evs = run(w, 240);
    const died = evs.find((e) => e.type === 'died');
    expect(died).toMatchObject({ type: 'died', cause: 'context', killer: 'a Flaky Test' });
  });

  it('a power block gives Opus to small Clawd, and Opus breaks bricks', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(4);
      b.prompt(4, 8, 'power');
      b.brick(10, 8);
    });
    run(w, 5);
    run(w, 1, { jump: true, jumpPressed: true });
    run(w, 25, { jump: true });
    run(w, 30);
    const item = w.entities.find((e) => e instanceof Item) as Item;
    expect(item?.kind).toBe('opus');
    // Walk into the mushroom-like chip.
    for (let i = 0; i < 200 && w.player.form === 'small'; i++) run(w, 1, { right: item.cx > w.player.cx, left: item.cx < w.player.cx });
    expect(w.player.form).toBe('big');
    run(w, 60);
    // Stand under the brick and jump.
    w.player.x = 10 * TILE;
    w.player.prevX = w.player.x;
    run(w, 5);
    run(w, 1, { jump: true, jumpPressed: true });
    run(w, 25, { jump: true });
    expect(w.map.get(10, 8)).toBe(T.EMPTY);
  });

  it('collects floating tokens', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.tokens(6, 11, 3);
    });
    run(w, 90, { right: true });
    expect(w.session.tokens).toBe(3);
    expect(w.map.get(6, 11)).toBe(T.EMPTY);
  });

  it('falling into a pit reports /dev/null', () => {
    const w = mk((b) => {
      b.ground(0, 6);
      b.ground(12, 59);
      b.start(3);
    });
    const evs = run(w, 300, { right: true });
    expect(evs.find((e) => e.type === 'died')).toMatchObject({ cause: 'pit' });
  });

  it('kicked Infinite Loop shells take out bugs', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.enemy('loop', 8);
      b.enemy('bug', 16);
    });
    const loop = w.entities.find((e) => e instanceof Loop) as Loop;
    const bug = w.entities.find((e) => e instanceof Bug)!;
    run(w, 2);
    loop.onStomp(w, w.player);
    expect(loop.mode).toBe('shell');
    loop.onTouch(w, { ...w.player, cx: loop.cx - 10 } as never);
    expect(loop.mode).toBe('spin');
    run(w, 120);
    expect(bug.dying).toBe(true);
  });

  it('reaching the flag finishes the level', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.goal(14);
    });
    const evs = run(w, 60 * 20, { right: true });
    expect(evs.some((e) => e.type === 'cleared')).toBe(true);
    expect(w.flag?.passed).toBe(true);
  });

  it('a permission gate pauses the world until answered', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.gate(10, 'npm test', true);
    });
    const evs = run(w, 120, { right: true });
    const ev = evs.find((e) => e.type === 'gate') as { gate: Gate } | undefined;
    expect(ev).toBeDefined();
    expect(w.paused).toBe(true);
    w.answerGate(ev!.gate, true);
    expect(w.paused).toBe(false);
    expect(w.map.get(10, 11)).toBe(T.EMPTY);
    run(w, 120, { right: true });
    expect(w.player.x).toBeGreaterThan(11 * TILE);
  });

  it('approving rm -rf ~/ deletes the floor', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.gate(10, 'rm -rf ~/', false);
    });
    const evs = run(w, 120, { right: true });
    const ev = evs.find((e) => e.type === 'gate') as { gate: Gate };
    w.answerGate(ev.gate, true);
    const after = run(w, 240);
    expect(after.find((e) => e.type === 'died')).toMatchObject({ cause: 'rmrf' });
  });

  it('git commit checkpoints are reported', () => {
    const w = mk((b) => {
      b.ground(0, 59);
      b.start(3);
      b.checkpoint(8);
    });
    const evs = run(w, 120, { right: true });
    expect(evs.some((e) => e.type === 'checkpoint')).toBe(true);
    expect(w.checkpointX).not.toBeNull();
  });
});
