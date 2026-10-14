import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setCanvasFactory } from '../engine/sprite';
import { loadSave, writeSave } from '../save';
import { computeLayout, TerminalApp } from './app';
import { KeyState, parseKeys } from './keys';
import { CellBuffer, copyCells, diffToAnsi, type ColorMode } from './screen';
import { SoftCanvas } from './softcanvas';

const STEP = 1 / 60;
const RENDER_MS = 1000 / 30;

const out = process.stdout;
const inp = process.stdin;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  out.write(`Super Clawd — terminal edition

Usage: super-clawd [--level 1-3]

Controls: ← → move · ↑/space jump · shift/x run · x subagents · ↓ pipes · esc pause · ctrl+c quit
Best in a big window (160×58 shows full detail). Ghostty, kitty, WezTerm and iTerm2 report key
releases, which makes the controls feel exactly like the web version.
`);
  process.exit(0);
}

if (!out.isTTY || !inp.isTTY) {
  console.error('Super Clawd needs an interactive terminal.');
  process.exit(1);
}

setCanvasFactory((w, h) => new SoftCanvas(w, h) as unknown as HTMLCanvasElement);

const env = process.env;
const colorMode: ColorMode =
  /truecolor|24bit/i.test(env.COLORTERM ?? '') || ['iTerm.app', 'WezTerm', 'ghostty', 'vscode'].includes(env.TERM_PROGRAM ?? '')
    ? 'truecolor'
    : '256';

const saveDir = path.join(os.homedir(), '.super-clawd');
const saveFile = path.join(saveDir, 'save.json');
const storage = {
  getItem: () => (fs.existsSync(saveFile) ? fs.readFileSync(saveFile, 'utf8') : null),
  setItem: (_key: string, value: string) => {
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(saveFile, value);
  },
};
const save = loadSave(storage);

const levelArg = args.indexOf('--level');
const keys = new KeyState();
let layout = computeLayout(out.columns || 80, out.rows || 24);
const app = new TerminalApp(keys, save, () => writeSave(save, storage), layout, {
  legacyInput: true,
  level: levelArg >= 0 ? args[levelArg + 1] : undefined,
});

let kitty = false;
let probing = true;
let finished = false;

function restore(): void {
  if (finished) return;
  finished = true;
  if (kitty) out.write('\x1b[<u');
  out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  if (inp.isTTY) inp.setRawMode(false);
  inp.pause();
}

function exit(code = 0): void {
  restore();
  process.exit(code);
}

process.on('SIGTERM', () => exit(0));
process.on('SIGHUP', () => exit(0));
process.on('uncaughtException', (err) => {
  restore();
  console.error(err);
  process.exit(1);
});

// Alternate screen, hidden cursor, then ask whether the terminal speaks the kitty keyboard protocol.
out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
inp.setRawMode(true);
inp.setEncoding('utf8');
inp.resume();
out.write('\x1b[?u\x1b[c');

inp.on('data', (data: string) => {
  if (probing) {
    if (/\x1b\[\?\d+u/.test(data) && !kitty) {
      kitty = true;
      keys.exact = true;
      app.setLegacyInput(false);
      out.write('\x1b[>11u');
    }
    if (/\x1b\[\?[\d;]*c/.test(data)) probing = false;
  }
  const events = parseKeys(data);
  if (events.some((e) => e.key === 'ctrl-c' && e.type !== 'release')) exit(0);
  keys.feed(events, performance.now() / 1000);
});

let buf = new CellBuffer(layout.cols, layout.rows);
let prev: CellBuffer | null = null;

out.on('resize', () => {
  layout = computeLayout(out.columns || 80, out.rows || 24);
  app.resize(layout);
  buf = new CellBuffer(layout.cols, layout.rows);
  prev = null;
  out.write('\x1b[0m\x1b[2J');
});

let last = performance.now();
let acc = 0;
let lastRender = 0;

function loop(): void {
  const now = performance.now();
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    keys.tick(now / 1000);
    app.update(STEP);
    keys.endStep();
    acc -= STEP;
    steps++;
  }
  if (steps >= 5) acc = 0;
  if (app.quit) return exit(0);
  if (now - lastRender >= RENDER_MS) {
    lastRender = now;
    app.render(buf);
    const ansi = diffToAnsi(prev, buf, colorMode);
    if (ansi) out.write(`\x1b[?2026h${ansi}\x1b[?2026l`);
    prev = copyCells(buf);
  }
  setTimeout(loop, 4);
}

loop();
