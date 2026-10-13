# Super Clawd — Design Notes

A retro platformer starring Clawd, the Claude Code mascot. Everything in the game comes from the world of
Claude Code and everyday engineering: no generic fantasy, no off-theme filler.

## Pillars

1. **Feels like a classic.** Tight 60 Hz fixed-step physics: acceleration, skidding, variable jump height,
   coyote time, jump buffering, corner nudges.
2. **Every joke is an engineering joke.** Enemies are bugs and bad patterns; power-ups are Claude Code features;
   the HUD is a status line.
3. **Easy to start, hard to master.** World 1 forgives mistakes (three hits before your context window is full),
   later levels demand timing.
4. **Shareable.** Every death can become a GIF replay with a caption.

## Core loop

Run → stomp bugs → bump prompt blocks → grab tokens and power-ups → reach the flag (**✓ All tests passed**) →
walk into **PROD** → time bonus → next level.

## Systems

| Concept    | In the game                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| Coins      | Tokens. 100K tokens = extra life                                             |
| Health     | Context window. Each hit as Sonnet fills a third; full = session over        |
| Super form | Opus: bigger, breaks bricks, survives a hit                                  |
| Fire form  | Subagents: throw bouncing mini Clawds                                        |
| Star       | Bypass Permissions: 10 s of invincibility (`--dangerously-skip-permissions`) |
| Heal       | `/compact` clears the context window                                         |
| Slow-mo    | ultrathink                                                                   |
| Checkpoint | `git commit` flag with a short hash                                          |
| Goal       | Test-runner flagpole, then the PROD building                                 |
| 1-up       | A green Clawd                                                                |

## Enemies and hazards

| Name               | Behavior                                                                                |
| ------------------ | --------------------------------------------------------------------------------------- |
| Bug                | Walks. Stomp to fix                                                                     |
| Infinite Loop      | Stomp to curl it up, kick it, and it loops between walls forever, flattening everything |
| Flaky Test         | Randomly phases between FAIL (solid, dangerous) and PASS (harmless ghost)               |
| Null Pointer       | Hides in the floor (`0x0` tell) and springs up when you get close                       |
| Memory Leak        | Grows over time; stomping a big one only garbage-collects part of it                    |
| Deprecated Warning | Flies in a wave; harmless but shoves you around                                         |
| node_modules       | A giant box that drops on you                                                           |
| Spinner bar        | A rotating bar of Claude Code spinner glyphs                                            |
| Red CI pipeline    | Lava                                                                                    |

## Obstacles

- **Permission prompts** — a gate that asks "Do you want to proceed?". `npm test` in 1-1 is safe; `rm -rf ~/`
  in 1-3 deletes the floor if you approve it. Choosing "don't ask again" auto-approves the next one.
- **429 rate limit** — a wall that opens after a countdown while bugs catch up from behind.

## World 1 — Terminal

| Level                | Theme                             | Focus                                                              |
| -------------------- | --------------------------------- | ------------------------------------------------------------------ |
| 1-1 Hello, World     | Cream daylight, code-panel ground | Tutorial, Opus, shells, first permission prompt, secret `~/.cache` |
| 1-2 node_modules     | Dark underground                  | Flaky Tests, rate limit, lifts, shell corridor                     |
| 1-3 The Cloud        | Dusk sky                          | Moving and crumbling platforms, warnings, leaks, the `rm -rf` trap |
| 1-4 Copilot's Hangar | Red CI hangar                     | Lava, crushers, spinner bars, boss                                 |

### Boss: Copilot

A cartoon pilot helmet with goggles (a parody, not any real logo). It rains gray "ghost text" autocomplete,
telegraphs a **⇥ Tab** dash across the arena, then gets stunned against the wall — stomp it then. At half health
it switches to "a bigger model": red goggles, faster drops, double dashes.

## Tech

- Vite + TypeScript, no game framework. Custom engine with a 60 Hz fixed step.
- Game rules (physics, player, entities, world, levels) never touch the DOM, so they run in tests and could power
  other front-ends.
- All art is drawn in code (`src/art`), including a 5×7 pixel font. Audio is a small WebAudio chiptune synth with
  an original soundtrack (`src/audio`).
- Death replays: the last ~3 s of frames live in a ring buffer and are encoded to GIF in a Web Worker.

## Testing

- Unit and mechanics tests for physics, enemies, power-ups, blocks, warps, camera and the boss fight.
- A brute-force level solver proves every level can be finished with the real physics.
- A timing-aware route bot rides every moving-platform section with real platform motion.
- A fuzzer mashes random inputs through every level for many simulated minutes.

## Roadmap

- Terminal edition (`npx super-clawd`)
- Online leaderboard ("Top Contributors"), Daily Bug, ghost races
- Worlds 2–6: Cursor, Gemini CLI, Devin and the final boss, Codex
- Level maker, achievements, co-op
