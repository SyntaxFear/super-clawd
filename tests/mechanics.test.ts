import { describe, expect, it } from 'vitest';
import { buildLevel, type Builder } from '../src/game/builder';
import { Bug, Deprecated, Flaky, Leak, NullPtr, Thwomp } from '../src/game/entities/enemies';
import { Item, type ItemKind } from '../src/game/entities/items';
import { Platform, RateLimit } from '../src/game/entities/props';
import { NO_CONTROLS, type Controls } from '../src/game/player';
import { T, TILE } from '../src/game/tiles';
import { newSession, World, type WorldEvent } from '../src/game/world';

const DT = 1 / 60;

function mk(build: (b: Builder) => void, width = 60): World {
  const level = buildLevel({ id: 't', name: 'test', theme: 'terminal', music: 'overworld', time: 300, width, build });
  return new World(level, newSession(), { sfx() {}, music() {} }, { viewW: 320 });
}

function run(w: World, frames: number, c: Partial<Controls> = {}): WorldEvent[] {
  const evs: WorldEvent[] = [];
  for (let i = 0; i < frames; i++) {
    w.update(DT, { ...NO_CONTROLS, ...c });
    evs.push(...w.events.splice(0));
  }
  return evs;
}

function flat(extra: (b: Builder) => void = () => {}) {
  return mk((b) => {
    b.ground(0, 59);
    b.start(3);
    extra(b);
  });
}

function giveItem(w: World, kind: ItemKind): void {
  const p = w.player;
  const it = new Item(Math.floor(p.x / TILE) * TILE, p.y, kind);
  it.emerging = false;
  it.emergeT = 1;
  it.layer = 1;
  it.activated = true;
  it.x = p.x;
  it.y = p.y;
  it.baseY = p.y + 6;
  w.spawn(it);
  run(w, 2);
}

describe('enemy mechanics', () => {
  it('Bypass Permissions knocks enemies out on contact', () => {
    const w = flat((b) => b.enemy('bug', 8));
    w.player.star = 10;
    const bug = w.entities.find((e) => e instanceof Bug)!;
    run(w, 90, { right: true });
    expect(bug.dying).toBe(true);
    expect(w.player.context).toBe(0);
  });

  it('spinner bars hurt', () => {
    const w = flat((b) => b.spinner(8, 9, 5, 2));
    run(w, 2);
    w.player.x = 8 * TILE + 2;
    w.player.prevX = w.player.x;
    run(w, 60 * 4);
    expect(w.player.context).toBeGreaterThan(0);
  });

  it('node_modules drops when you walk under it', () => {
    const w = flat((b) => b.enemy('thwomp', 10, 2));
    const t = w.entities.find((e) => e instanceof Thwomp) as Thwomp;
    const startY = t.y;
    run(w, 60, { right: true });
    run(w, 60);
    expect(t.y).toBeGreaterThan(startY + 50);
  });

  it('null pointers spring up when you get close', () => {
    const w = flat((b) => b.enemy('nullptr', 9));
    const n = w.entities.find((e) => e instanceof NullPtr) as NullPtr;
    expect(n.harmful).toBe(false);
    let rose = false;
    for (let i = 0; i < 120 && !rose; i++) {
      run(w, 1, { right: true });
      if (n.rise >= 1) rose = true;
    }
    expect(rose).toBe(true);
  });

  it('deprecated warnings shove you but never hurt', () => {
    const w = flat((b) => b.enemy('deprecated', 8, 10));
    const d = w.entities.find((e) => e instanceof Deprecated) as Deprecated;
    run(w, 2);
    d.y = w.player.y;
    d.baseY = d.y;
    d.x = w.player.x + 4;
    run(w, 2);
    expect(w.player.context).toBe(0);
    expect(w.player.vy).toBeLessThan(0);
  });

  it('flaky tests are harmless while passing', () => {
    const w = flat((b) => b.enemy('flaky', 6));
    const f = w.entities.find((e) => e instanceof Flaky) as Flaky;
    run(w, 1);
    f.failing = false;
    f.phaseT = 99;
    f.x = w.player.x;
    run(w, 3);
    expect(w.player.context).toBe(0);
    expect(f.harmful).toBe(false);
  });

  it('memory leaks grow, and stomping garbage-collects them', () => {
    const w = flat((b) => b.enemy('leak', 14));
    const l = w.entities.find((e) => e instanceof Leak) as Leak;
    run(w, 60 * 6);
    expect(l.stage).toBeGreaterThan(0);
    const before = l.stage;
    l.onStomp(w, w.player);
    expect(l.stage).toBe(before - 1);
  });
});

describe('world objects', () => {
  it('rate limit walls open after the countdown', () => {
    const w = flat((b) => b.rateLimit(9, 2));
    const r = w.entities.find((e) => e instanceof RateLimit) as RateLimit;
    run(w, 60, { right: true });
    expect(r.state).toBe('counting');
    expect(w.map.get(9, 11)).toBe(T.BARRIER);
    run(w, 150);
    expect(r.state).toBe('open');
    expect(w.map.get(9, 11)).toBe(T.EMPTY);
  });

  it('moving platforms carry Clawd', () => {
    const w = mk((b) => {
      b.ground(0, 5);
      b.start(2);
      b.platform('move-h', 3, 8, 3, 6, 40, 0);
    });
    const plat = w.entities.find((e) => e instanceof Platform) as Platform;
    run(w, 2);
    const p = w.player;
    p.x = plat.x + 10;
    p.y = plat.y - p.h - 2;
    p.prevY = p.y;
    p.onGround = false;
    run(w, 10);
    expect(p.standingOn).toBe(plat);
    const x0 = p.x;
    run(w, 60);
    expect(Math.abs(p.x - x0)).toBeGreaterThan(20);
    expect(p.standingOn).toBe(plat);
  });

  it('broken builds crumble after you land on them', () => {
    const w = mk((b) => {
      b.ground(0, 5);
      b.start(2);
      b.platform('fall', 8, 8, 2);
    });
    const plat = w.entities.find((e) => e instanceof Platform) as Platform;
    run(w, 2);
    const p = w.player;
    p.x = plat.x + 6;
    p.y = plat.y - p.h - 1;
    p.prevY = p.y;
    p.onGround = false;
    run(w, 60);
    expect(plat.falling).toBe(true);
  });

  it('multi-token bricks pay out several times', () => {
    const w = flat((b) => b.brick(3, 8, 1, 'multi'));
    for (let i = 0; i < 4; i++) {
      run(w, 1, { jump: true, jumpPressed: true });
      run(w, 40, { jump: true });
      run(w, 10);
    }
    expect(w.session.tokens).toBeGreaterThanOrEqual(3);
  });

  it('hidden blocks appear when bumped from below', () => {
    const w = flat((b) => b.hidden(3, 8, 'oneup'));
    run(w, 3);
    run(w, 1, { jump: true, jumpPressed: true });
    run(w, 30, { jump: true });
    expect(w.map.get(3, 8)).toBe(T.USED);
    expect(w.entities.some((e) => e instanceof Item && e.kind === 'oneup')).toBe(true);
  });

  it('running out of time is a timeout death', () => {
    const w = flat();
    w.time = 0.5;
    const evs = run(w, 60 * 4);
    expect(evs.find((e) => e.type === 'died')).toMatchObject({ cause: 'time' });
  });

  it('100 tokens is an extra life', () => {
    const w = flat();
    w.session.tokens = 99;
    w.collectToken(0, 0);
    expect(w.session.lives).toBe(4);
    expect(w.session.tokens).toBe(0);
  });
});

describe('power-ups', () => {
  it('/compact clears the context window', () => {
    const w = flat();
    w.player.context = 2;
    giveItem(w, 'compact');
    expect(w.player.context).toBe(0);
  });

  it('ultrathink slows the world down', () => {
    const w = flat();
    giveItem(w, 'ultrathink');
    expect(w.slowmo).toBeGreaterThan(0);
  });

  it('a green Clawd is a 1-up', () => {
    const w = flat();
    giveItem(w, 'oneup');
    expect(w.session.lives).toBe(4);
  });

  it('a hit as Opus downgrades to Sonnet without filling context', () => {
    const w = flat();
    w.player.setForm('big', w.map);
    w.hurtPlayer('a Bug');
    expect(w.player.form).toBe('small');
    expect(w.player.context).toBe(0);
  });
});
