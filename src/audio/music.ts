/**
 * Original chiptune tracks for Super Clawd, written as note strings.
 * Format: "NOTE:steps" separated by spaces, steps are 16th notes. "r" is a rest.
 * Drums use k (kick), s (snare), h (hat).
 */

export type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'noise';

export interface NoteEvt {
  step: number;
  len: number;
  freq: number;
  drum?: 'k' | 's' | 'h';
}

export interface Channel {
  wave: Wave;
  vol: number;
  notes: NoteEvt[];
}

export interface Track {
  bpm: number;
  steps: number;
  loop: boolean;
  channels: Channel[];
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteFreq(n: string): number {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  let semi = NAMES[m[1]];
  if (m[2] === '#') semi += 1;
  if (m[2] === 'b') semi -= 1;
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function parse(src: string, transpose = 0): { notes: NoteEvt[]; steps: number } {
  const notes: NoteEvt[] = [];
  let step = 0;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    const [n, l] = tok.split(':');
    const len = parseInt(l ?? '1', 10);
    if (n === 'r') {
      step += len;
      continue;
    }
    if (n === 'k' || n === 's' || n === 'h') {
      notes.push({ step, len, freq: 0, drum: n });
    } else {
      notes.push({ step, len, freq: noteFreq(n) * Math.pow(2, transpose / 12) });
    }
    step += len;
  }
  return { notes, steps: step };
}

function ch(wave: Wave, vol: number, ...parts: (string | [string, number])[]): Channel {
  const all: NoteEvt[] = [];
  let offset = 0;
  for (const part of parts) {
    const [src, tr] = typeof part === 'string' ? [part, 0] : part;
    const { notes, steps } = parse(src, tr);
    for (const n of notes) all.push({ ...n, step: n.step + offset });
    offset += steps;
  }
  return { wave, vol, notes: all };
}

function repeat(s: string, n: number): string {
  return Array.from({ length: n }, () => s).join(' ');
}

/** Off-beat chord stabs from a chord list (one chord per bar). */
function stabs(chords: string[][]): string {
  return chords.map((c) => `r:2 ${c[0]}:2 r:2 ${c[1]}:2 r:2 ${c[0]}:2 r:2 ${c[1]}:2`).join(' ');
}

const BEAT = 'k:2 h:2 s:2 h:2 k:2 k:2 s:2 h:2';
const BEAT_LIGHT = 'k:4 h:4 s:4 h:4';

// ---------------------------------------------------------------- 1-1 overworld

const OVER_A = `G4:2 C5:2 E5:2 G5:4 E5:2 C5:2 D5:2
E5:3 D5:1 C5:2 A4:2 G4:4 r:4
F4:2 A4:2 C5:2 F5:4 E5:2 D5:2 C5:2
D5:3 C5:1 B4:2 G4:2 C5:4 r:4
G4:2 C5:2 E5:2 G5:4 A5:2 G5:2 E5:2
F5:3 E5:1 D5:2 C5:2 A4:4 r:2 A4:2
B4:2 D5:2 F5:2 A5:4 G5:2 F5:2 D5:2
C5:4 G5:2 E5:2 C5:4 r:4`;

const OVER_B = `A4:2 r:1 A4:1 C5:2 E5:2 A5:3 G5:1 E5:2 C5:2
F5:2 r:1 F5:1 E5:2 D5:2 C5:4 r:4
G4:2 r:1 G4:1 B4:2 D5:2 G5:3 F5:1 D5:2 B4:2
C5:2 r:1 C5:1 D5:2 E5:2 G5:4 r:4
A4:2 r:1 A4:1 C5:2 E5:2 A5:3 B5:1 C6:2 A5:2
G5:2 r:1 G5:1 F5:2 E5:2 D5:4 r:4
E5:2 F5:2 G5:2 A5:2 B5:2 C6:2 D6:2 B5:2
C6:6 r:2 G5:2 E5:2 C5:4`;

const OVER_BASS_A = `C3:2 G3:2 C4:2 G3:2 C3:2 G3:2 C4:2 G3:2
A2:2 E3:2 A3:2 E3:2 A2:2 E3:2 A3:2 E3:2
F2:2 C3:2 F3:2 C3:2 F2:2 C3:2 F3:2 C3:2
G2:2 D3:2 G3:2 D3:2 G2:2 D3:2 G3:2 B2:2
C3:2 G3:2 C4:2 G3:2 C3:2 G3:2 C4:2 G3:2
F2:2 C3:2 F3:2 C3:2 F2:2 C3:2 F3:2 C3:2
G2:2 D3:2 G3:2 D3:2 G2:2 D3:2 G3:2 B2:2
C3:2 G3:2 C4:2 G3:2 C3:4 r:4`;

const OVER_BASS_B = `A2:2 E3:2 A3:2 E3:2 A2:2 E3:2 A3:2 E3:2
F2:2 C3:2 F3:2 C3:2 F2:2 C3:2 F3:2 C3:2
G2:2 D3:2 G3:2 D3:2 G2:2 D3:2 G3:2 D3:2
C3:2 G3:2 C4:2 G3:2 C3:2 G3:2 C4:2 G3:2
A2:2 E3:2 A3:2 E3:2 A2:2 E3:2 A3:2 E3:2
G2:2 D3:2 G3:2 D3:2 G2:2 D3:2 G3:2 D3:2
C3:2 D3:2 E3:2 F3:2 G3:2 A3:2 B3:2 G3:2
C3:4 r:2 G2:2 C3:4 r:4`;

const OVER_HARM_A = stabs([
  ['E4', 'G4'],
  ['C4', 'E4'],
  ['A3', 'C4'],
  ['B3', 'D4'],
  ['E4', 'G4'],
  ['A3', 'C4'],
  ['B3', 'F4'],
  ['E4', 'G4'],
]);
const OVER_HARM_B = stabs([
  ['C4', 'E4'],
  ['A3', 'C4'],
  ['B3', 'D4'],
  ['E4', 'G4'],
  ['C4', 'E4'],
  ['B3', 'D4'],
  ['E4', 'G4'],
  ['E4', 'G4'],
]);

// ---------------------------------------------------------------- 1-2 underground

const UNDER_MEL = `A4:1 r:1 A4:1 r:1 C5:1 r:1 A4:1 r:1 E5:2 r:2 D5:2 C5:2
B4:1 r:1 B4:1 r:1 D5:1 r:1 B4:1 r:1 G4:4 r:4
A4:1 r:1 A4:1 r:1 C5:1 r:1 A4:1 r:1 E5:2 r:2 D5:2 C5:2
E5:1 r:1 D5:1 r:1 C5:1 r:1 B4:1 r:1 A4:4 r:4
F4:2 A4:2 C5:2 F5:2 E5:4 C5:4
D4:2 G4:2 B4:2 D5:2 C5:4 B4:4
A4:2 C5:2 E5:2 A5:2 G#5:4 E5:4
A5:2 r:2 E5:2 r:2 A4:4 r:4`;

const UNDER_BASS = `${repeat('A2:1 r:1 A3:1 r:1', 4)}
${repeat('G2:1 r:1 G3:1 r:1', 4)}
${repeat('A2:1 r:1 A3:1 r:1', 4)}
${repeat('E2:1 r:1 E3:1 r:1', 2)} ${repeat('A2:1 r:1 A3:1 r:1', 2)}
${repeat('F2:1 r:1 F3:1 r:1', 4)}
${repeat('G2:1 r:1 G3:1 r:1', 4)}
${repeat('E2:1 r:1 E3:1 r:1', 4)}
${repeat('A2:1 r:1 A3:1 r:1', 4)}`;

// ---------------------------------------------------------------- 1-3 sky

const SKY_MEL = `D5:4 F#5:2 A5:2 D6:4 C#6:2 B5:2
A5:6 F#5:2 E5:4 D5:4
G5:4 B5:2 D6:2 G6:4 F#6:2 E6:2
F#6:6 E6:2 D6:4 A5:4
B5:4 A5:2 G5:2 F#5:4 E5:2 D5:2
E5:4 F#5:2 G5:2 A5:8
G5:2 F#5:2 E5:2 D5:2 C#5:2 D5:2 E5:2 A4:2
D5:8 r:8`;

const SKY_BASS = `D3:4 A3:4 F#3:4 A3:4
D3:4 A3:4 F#3:4 A3:4
G2:4 D3:4 B2:4 D3:4
D3:4 A3:4 F#3:4 A3:4
B2:4 F#3:4 D3:4 F#3:4
A2:4 E3:4 C#3:4 E3:4
G2:4 D3:4 A2:4 E3:4
D3:4 A2:4 D3:8`;

const SKY_ARP = `${repeat('D4:1 F#4:1 A4:1 F#4:1', 4)}
${repeat('D4:1 F#4:1 A4:1 F#4:1', 4)}
${repeat('D4:1 G4:1 B4:1 G4:1', 4)}
${repeat('D4:1 F#4:1 A4:1 F#4:1', 4)}
${repeat('D4:1 F#4:1 B4:1 F#4:1', 4)}
${repeat('C#4:1 E4:1 A4:1 E4:1', 4)}
${repeat('B3:1 D4:1 G4:1 D4:1', 2)} ${repeat('C#4:1 E4:1 A4:1 E4:1', 2)}
${repeat('D4:1 F#4:1 A4:1 F#4:1', 4)}`;

// ---------------------------------------------------------------- 1-4 castle

const CASTLE_A = `E4:1 F4:1 E4:1 D#4:1 E4:2 B4:2 C5:2 B4:2 G4:2 E4:2
D4:1 E4:1 D4:1 C#4:1 D4:2 A4:2 B4:2 A4:2 F#4:2 D4:2
C4:1 D4:1 C4:1 B3:1 C4:2 G4:2 A4:2 G4:2 E4:2 C4:2
B3:2 D#4:2 F#4:2 B4:2 A4:2 F#4:2 D#4:2 B3:2`;

const CASTLE_BASS = `${repeat('E2:2', 8)} ${repeat('D2:2', 8)} ${repeat('C2:2', 8)} ${repeat('B1:2', 8)}`;

// ---------------------------------------------------------------- boss

const BOSS_MEL = `E5:1 r:1 E5:1 G5:1 r:1 E5:1 A5:2 G5:1 F#5:1 E5:2 D5:2 B4:2
C5:1 r:1 C5:1 E5:1 r:1 C5:1 G5:2 F#5:1 E5:1 D5:2 B4:2 G4:2
A4:1 r:1 A4:1 C5:1 r:1 A4:1 E5:2 D5:1 C5:1 B4:2 A4:2 F#4:2
B4:2 B4:1 r:1 D#5:2 D#5:1 r:1 F#5:2 F#5:1 r:1 B5:4`;

const BOSS_BASS = `${repeat('E2:1 E3:1', 8)} ${repeat('C2:1 C3:1', 8)} ${repeat('A1:1 A2:1', 8)} ${repeat('B1:1 B2:1', 8)}`;

// ---------------------------------------------------------------- bypass permissions (star)

const BYPASS_MEL = `C5:1 E5:1 G5:1 C6:1 G5:1 E5:1 C5:1 E5:1 D5:1 F5:1 A5:1 D6:1 A5:1 F5:1 D5:1 F5:1
B4:1 D5:1 G5:1 B5:1 G5:1 D5:1 B4:1 D5:1 C5:1 E5:1 G5:1 C6:1 G5:1 E5:1 C5:1 C5:1`;
const BYPASS_BASS = 'C3:2 C4:2 C3:2 C4:2 D3:2 D4:2 D3:2 D4:2 G2:2 G3:2 G2:2 G3:2 C3:2 C4:2 C3:2 C4:2';

// ---------------------------------------------------------------- jingles

const CLEAR_MEL = 'G4:2 C5:2 E5:2 G5:2 C6:4 E6:2 G6:6 r:2 E6:2 G6:8';
const CLEAR_BASS = 'C3:4 E3:4 G3:4 C4:4 G3:4 C3:12';
const DEATH_MEL = 'C5:2 B4:2 A#4:2 A4:6 r:2 E4:2 D#4:2 E4:2 r:2 C4:8';
const GAMEOVER_MEL = 'E5:3 C5:3 G4:4 E4:2 F4:2 E4:2 D#4:2 E4:8';
const GAMEOVER_BASS = 'C3:6 G2:4 C3:4 B2:4 C3:8';
const WORLD_MEL = 'C5:2 E5:2 G5:2 C6:4 B5:2 C6:2 D6:4 E6:2 D6:2 C6:2 G5:2 A5:2 B5:2 C6:8 r:2 G6:2 E6:2 C6:8';
const WORLD_BASS = 'C3:4 G3:4 C4:4 A2:4 E3:4 A3:4 F2:4 G2:4 C3:8 G2:4 C3:12';
const TITLE_MEL = 'C5:2 r:2 G4:2 C5:2 E5:4 D5:2 C5:2 G5:8 r:8';

export type TrackId =
  'overworld' | 'underground' | 'sky' | 'castle' | 'boss' | 'bypass' | 'clear' | 'death' | 'gameover' | 'world' | 'title';

function total(c: Channel[]): number {
  let max = 0;
  for (const x of c) for (const n of x.notes) max = Math.max(max, n.step + n.len);
  return max;
}

function track(bpm: number, loop: boolean, channels: Channel[], steps?: number): Track {
  return { bpm, loop, channels, steps: steps ?? total(channels) };
}

let built: Record<TrackId, Track> | null = null;

export function tracks(): Record<TrackId, Track> {
  if (built) return built;
  built = {
    overworld: track(144, true, [
      ch('p25', 0.18, OVER_A, OVER_B),
      ch('p12', 0.07, OVER_HARM_A, OVER_HARM_B),
      ch('tri', 0.3, OVER_BASS_A, OVER_BASS_B),
      ch('noise', 0.08, repeat(BEAT_LIGHT, 8), repeat(BEAT, 8)),
    ]),
    underground: track(124, true, [
      ch('p50', 0.15, UNDER_MEL),
      ch('tri', 0.32, UNDER_BASS),
      ch('noise', 0.06, repeat('k:4 r:4 h:2 h:2 r:4', 8)),
    ]),
    sky: track(132, true, [
      ch('p25', 0.16, SKY_MEL),
      ch('p12', 0.06, SKY_ARP),
      ch('tri', 0.28, SKY_BASS),
      ch('noise', 0.05, repeat(BEAT_LIGHT, 8)),
    ]),
    castle: track(150, true, [
      ch('p25', 0.15, CASTLE_A, [CASTLE_A, 12]),
      ch('tri', 0.3, CASTLE_BASS, CASTLE_BASS),
      ch('noise', 0.06, repeat('k:2 h:2 h:2 h:2', 16)),
    ]),
    boss: track(172, true, [
      ch('p25', 0.17, BOSS_MEL, BOSS_MEL),
      ch('p12', 0.06, repeat('E4:1 r:1', 32), repeat('C4:1 r:1', 16), repeat('B3:1 r:1', 16)),
      ch('tri', 0.32, BOSS_BASS, BOSS_BASS),
      ch('noise', 0.08, repeat(BEAT, 8)),
    ]),
    bypass: track(190, true, [ch('p25', 0.16, BYPASS_MEL), ch('tri', 0.3, BYPASS_BASS), ch('noise', 0.07, repeat(BEAT, 2))]),
    clear: track(150, false, [ch('p25', 0.2, CLEAR_MEL), ch('tri', 0.3, CLEAR_BASS)]),
    death: track(120, false, [ch('p25', 0.2, DEATH_MEL)]),
    gameover: track(110, false, [ch('p25', 0.18, GAMEOVER_MEL), ch('tri', 0.3, GAMEOVER_BASS)]),
    world: track(140, false, [ch('p25', 0.2, WORLD_MEL), ch('tri', 0.3, WORLD_BASS), ch('noise', 0.06, repeat(BEAT, 4))]),
    title: track(120, false, [ch('p25', 0.16, TITLE_MEL)]),
  };
  return built;
}
