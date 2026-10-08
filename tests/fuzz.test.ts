import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { buildLevel } from '../src/game/builder';
import { LEVELS } from '../src/game/levels';
import { NO_CONTROLS, type Controls } from '../src/game/player';
import { newSession, World } from '../src/game/world';

const DT = 1 / 60;

/** Mash buttons for a few minutes of game time on every level; nothing may throw or go NaN. */
describe('fuzz', () => {
  for (const def of LEVELS) {
    it(`${def.id} survives random play`, () => {
      const level = buildLevel(def);
      let total = 0;
      let best = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const rng = new Rng(seed * 7919);
        let checkpoint: number | null = null;
        let frames = 0;
        while (frames < 60 * 60) {
          const session = newSession();
          session.form = seed % 3 === 0 ? 'agent' : seed % 3 === 1 ? 'big' : 'small';
          const w = new World(level, session, { sfx() {}, music() {} }, { viewW: 256 + (seed % 3) * 96, checkpointX: checkpoint });
          if (seed % 4 === 0) w.player.star = 9999;
          let c: Controls = { ...NO_CONTROLS };
          let over = false;
          for (let f = 0; f < 60 * 120 && !over; f++, frames++) {
            if (f % 8 === 0) {
              const r = rng.next();
              c = {
                left: r < 0.15,
                right: r >= 0.15 && r < 0.9,
                down: rng.next() < 0.05,
                jump: rng.next() < 0.5,
                jumpPressed: rng.next() < 0.3,
                run: rng.next() < 0.6,
                runPressed: rng.next() < 0.2,
              };
            } else c = { ...c, jumpPressed: false, runPressed: false };
            w.update(DT, c);
            for (const ev of w.events.splice(0)) {
              if (ev.type === 'gate') w.answerGate(ev.gate, rng.next() < 0.7);
              if (ev.type === 'checkpoint') checkpoint = ev.x;
              if (ev.type === 'died' || ev.type === 'cleared' || ev.type === 'bossDefeated') over = true;
            }
            const p = w.player;
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            best = Math.max(best, w.progress());
          }
          for (const e of w.entities) expect(Number.isFinite(e.x) && Number.isFinite(e.y), e.name).toBe(true);
        }
        total += frames;
      }
      expect(total).toBeGreaterThan(60 * 60 * 12 - 1);
      console.log(`${def.id}: fuzzed ${(total / 3600).toFixed(0)} min, furthest ${(best * 100).toFixed(0)}%`);
    }, 120000);
  }
});
