import * as Bg from '../art/backgrounds';
import * as Hero from '../art/hero';
import * as TileArt from '../art/tiles';
import { rainbow } from '../engine/color';
import { drawText } from '../engine/font';
import { Copilot } from '../game/entities/boss';
import type { Gate } from '../game/entities/props';
import { RateLimit } from '../game/entities/props';
import { deathLine, fmtTime, quipFor } from '../game/flavor';
import { getLevel, LEVELS, levelIndex } from '../game/levels';
import type { Controls } from '../game/player';
import { newSession, World, type Session, type WorldEvent } from '../game/world';
import { recordClear, type SaveData } from '../save';
import type { KeyState } from './keys';
import { CellBuffer, framesToCells, rgb } from './screen';
import { SoftCanvas } from './softcanvas';

const VIEW_H = 224;

export interface Layout {
  cols: number;
  rows: number;
  /** Game pixels per terminal pixel (each cell holds two terminal pixels, stacked). */
  s: number;
  viewW: number;
  cropTop: number;
  gameCols: number;
  gameRows: number;
  ox: number;
  oy: number;
  tooSmall: boolean;
}

const OPTIONS: [number, number][] = [
  [2, 0],
  [2, 32],
  [3, 0],
  [2, 48],
  [3, 32],
  [4, 0],
  [3, 48],
  [4, 32],
  [4, 48],
  [5, 32],
  [5, 48],
  [6, 48],
];

/** Pick the sharpest scale that fits, cropping a little sky before giving up detail. */
export function computeLayout(cols: number, rows: number): Layout {
  const avail = rows - 2;
  for (const [s, cropTop] of OPTIONS) {
    const gameRows = Math.ceil((VIEW_H - cropTop) / (2 * s));
    if (gameRows > avail) continue;
    const viewW = Math.max(192, Math.min(448, cols * s));
    const gameCols = Math.floor(viewW / s);
    if (gameCols > cols || cols < 40) continue;
    return {
      cols,
      rows,
      s,
      viewW,
      cropTop,
      gameCols,
      gameRows,
      ox: Math.floor((cols - gameCols) / 2),
      oy: 1 + Math.floor((avail - gameRows) / 2),
      tooSmall: false,
    };
  }
  return { cols, rows, s: 6, viewW: 256, cropTop: 48, gameCols: 0, gameRows: 0, ox: 0, oy: 1, tooSmall: true };
}

const C = {
  bg: rgb('#0f0d0c'),
  panel: rgb('#1b1917'),
  sel: rgb('#3a2a22'),
  hud: rgb('#14110f'),
  orange: rgb('#d97757'),
  text: rgb('#ede6dd'),
  dim: rgb('#8c8279'),
  faint: rgb('#5a524b'),
  green: rgb('#8fcb79'),
  red: rgb('#e5736e'),
  yellow: rgb('#e3b341'),
  violet: rgb('#b9a6ff'),
  gold: rgb('#f2b84b'),
};

type Tone = 'brand' | 'ok' | 'err' | 'warn';
const TONE: Record<Tone, number> = { brand: C.orange, ok: C.green, err: C.red, warn: C.yellow };

interface PanelItem {
  label: string;
  hint?: string;
  disabled?: boolean;
  action: () => void;
}

interface Panel {
  title: string;
  tone: Tone;
  lines: { text: string; color?: number }[];
  items: PanelItem[];
  sel: number;
  onBack?: () => void;
  footer?: string;
  low?: boolean;
}

export interface AppOptions {
  /** True when the terminal only sends key presses (no releases). */
  legacyInput: boolean;
  level?: string;
}

/** The terminal edition: same worlds and rules, drawn with half-block pixels and real terminal text. */
export class TerminalApp {
  scene: 'title' | 'intro' | 'play' = 'title';
  sceneT = 0;
  t = 0;
  session: Session = newSession();
  levelIndex = 0;
  world: World | null = null;
  checkpoint: { level: number; x: number } | null = null;
  panel: Panel | null = null;
  paused = false;
  autoApprove = false;
  quit = false;
  layout: Layout;
  readonly frame: SoftCanvas;
  private gatePanel = false;

  constructor(
    private keys: KeyState,
    private save: SaveData,
    private persist: () => void,
    layout: Layout,
    private opts: AppOptions,
  ) {
    this.layout = layout;
    this.frame = new SoftCanvas(layout.viewW, VIEW_H);
    const lv = opts.level ? levelIndex(opts.level) : -1;
    if (lv >= 0) this.newGame(lv);
    else this.showTitle();
  }

  setLegacyInput(legacy: boolean): void {
    this.opts.legacyInput = legacy;
  }

  resize(layout: Layout): void {
    this.layout = layout;
    this.frame.resize(layout.viewW, VIEW_H);
    this.world?.setViewW(layout.viewW);
  }

  private get g(): CanvasRenderingContext2D {
    return this.frame.getContext('2d') as unknown as CanvasRenderingContext2D;
  }

  // ---------------------------------------------------------------- menus

  private open(p: Omit<Panel, 'sel'>): void {
    this.panel = {
      ...p,
      sel: Math.max(
        0,
        p.items.findIndex((i) => !i.disabled),
      ),
    };
  }

  private close(): void {
    this.panel = null;
    this.gatePanel = false;
  }

  showTitle(): void {
    this.scene = 'title';
    this.world = null;
    this.paused = false;
    const unlocked = Math.min(this.save.unlocked, LEVELS.length - 1);
    this.open({
      title: '✻ Welcome to Super Clawd!',
      tone: 'brand',
      low: true,
      lines: [{ text: 'Fix bugs. Collect tokens. Ship to prod.', color: C.dim }],
      items: [
        { label: '/play      New game', hint: 'World 1-1', action: () => this.newGame(0) },
        {
          label: '/continue  Continue',
          hint: `World ${LEVELS[unlocked].id}`,
          disabled: this.save.unlocked === 0,
          action: () => this.newGame(unlocked),
        },
        { label: '/levels    Select level', action: () => this.showLevels() },
        { label: '/help      Controls', action: () => this.showHelp(() => this.showTitle()) },
        { label: '/quit      Exit', hint: 'q', action: () => (this.quit = true) },
      ],
      footer: 'fan game · not affiliated with Anthropic',
    });
  }

  private showLevels(): void {
    this.open({
      title: '/levels',
      tone: 'brand',
      lines: [{ text: 'World 1 — Terminal', color: C.dim }],
      items: [
        ...LEVELS.map((l, i) => {
          const best = this.save.best[l.id];
          return {
            label: `${l.id}  ${l.name}`,
            hint: i > this.save.unlocked ? 'locked' : best ? `best ${best.score}` : '',
            disabled: i > this.save.unlocked,
            action: () => this.newGame(i),
          };
        }),
        { label: 'Back', action: () => this.showTitle() },
      ],
      onBack: () => this.showTitle(),
    });
  }

  private showHelp(back: () => void): void {
    const exact = !this.opts.legacyInput;
    this.open({
      title: '/help',
      tone: 'brand',
      lines: [
        { text: 'MOVE    ← →  or  a d', color: C.text },
        { text: 'JUMP    ↑  space  w  z', color: C.text },
        { text: exact ? 'RUN     shift / x  (x throws subagents)' : 'RUN     always on · x throws subagents', color: C.text },
        { text: 'DOWN    ↓  s   crouch, enter pipes', color: C.text },
        { text: 'PAUSE   esc / p        QUIT  ctrl+c', color: C.text },
        { text: '' },
        {
          text: exact
            ? 'Your terminal reports key releases: full controls.'
            : 'Tip: Ghostty, kitty, WezTerm or iTerm2 give smoother controls.',
          color: C.dim,
        },
      ],
      items: [{ label: 'Back', action: back }],
      onBack: back,
    });
  }

  newGame(index: number): void {
    this.session = newSession();
    this.levelIndex = index;
    this.checkpoint = null;
    this.autoApprove = false;
    this.startIntro();
  }

  private startIntro(): void {
    this.close();
    this.scene = 'intro';
    this.sceneT = 0;
    this.world = null;
    this.paused = false;
    this.keys.releaseAll();
  }

  startLevel(): void {
    const level = getLevel(this.levelIndex);
    const cp = this.checkpoint && this.checkpoint.level === this.levelIndex ? this.checkpoint.x : null;
    this.world = new World(level, this.session, { sfx() {}, music() {} }, { viewW: this.layout.viewW, checkpointX: cp });
    this.world.pixelText = false;
    this.scene = 'play';
    this.sceneT = 0;
    this.paused = false;
    this.close();
    this.keys.releaseAll();
  }

  private pause(): void {
    this.paused = true;
    const resume = () => {
      this.paused = false;
      this.close();
      this.keys.releaseAll();
    };
    const open = () =>
      this.open({
        title: '❚❚ Paused',
        tone: 'brand',
        lines: [{ text: `${this.world?.level.id} · ${this.world?.level.name}`, color: C.dim }],
        items: [
          { label: 'Resume', hint: 'esc', action: resume },
          {
            label: 'Restart level',
            action: () => {
              this.checkpoint = null;
              this.startIntro();
            },
          },
          { label: 'Controls', action: () => this.showHelp(open) },
          { label: 'Quit to title', action: () => this.showTitle() },
        ],
        onBack: resume,
      });
    open();
  }

  private askPermission(gate: Gate, w: World): void {
    const answer = (yes: boolean, always = false) => {
      this.close();
      if (always) this.autoApprove = true;
      w.answerGate(gate, yes);
      this.keys.releaseAll();
    };
    this.open({
      title: 'Bash command',
      tone: 'warn',
      lines: [
        { text: `  ${gate.cmd}`, color: C.text },
        { text: gate.safe ? '  Run the test suite' : '  Delete everything in your home directory', color: C.dim },
        { text: '' },
        { text: 'Do you want to proceed?', color: C.text },
      ],
      items: [
        { label: '1. Yes', action: () => answer(true) },
        { label: "2. Yes, and don't ask again", action: () => answer(true, true) },
        { label: '3. No, and tell Claude what to do differently', hint: 'esc', action: () => answer(false) },
      ],
      onBack: () => answer(false),
    });
    this.gatePanel = true;
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.t += dt;
    this.sceneT += dt;
    const events = this.keys.drain();
    if (this.panel) {
      this.menuInput(events);
      return;
    }
    switch (this.scene) {
      case 'intro':
        if (this.sceneT > 2.2 || (this.sceneT > 0.5 && this.keys.pressed('enter', 'space', 'z'))) this.startLevel();
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      default:
        break;
    }
  }

  private menuInput(events: ReturnType<KeyState['drain']>): void {
    const p = this.panel!;
    for (const e of events) {
      if (e.type === 'release') continue;
      const move = (dir: number) => {
        const n = p.items.length;
        let i = p.sel;
        for (let k = 0; k < n; k++) {
          i = (i + dir + n) % n;
          if (!p.items[i].disabled) break;
        }
        p.sel = i;
      };
      if (e.key === 'up' || e.key === 'w' || e.key === 'k') move(-1);
      else if (e.key === 'down' || e.key === 's' || e.key === 'j') move(1);
      else if (e.key === 'enter' || e.key === 'space' || e.key === 'z') {
        const item = p.items[p.sel];
        if (item && !item.disabled) item.action();
        return;
      } else if (e.key === 'escape') {
        p.onBack?.();
        return;
      } else if (/^[1-9]$/.test(e.key)) {
        const item = p.items[Number(e.key) - 1];
        if (item && !item.disabled) item.action();
        return;
      } else if (this.gatePanel && (e.key === 'y' || e.key === 'n')) {
        p.items[e.key === 'y' ? 0 : 2].action();
        return;
      } else if (e.key === 'q' && this.scene === 'title') {
        this.quit = true;
        return;
      }
    }
  }

  private controls(): Controls {
    const k = this.keys;
    return {
      left: k.down('left', 'a'),
      right: k.down('right', 'd'),
      down: k.down('down', 's'),
      jump: k.down('up', 'w', 'space', 'z', 'k'),
      jumpPressed: k.pressed('up', 'w', 'space', 'z', 'k'),
      run: k.down('shift', 'x', 'j'),
      runPressed: k.pressed('shift', 'x', 'j'),
    };
  }

  private updatePlay(dt: number): void {
    const w = this.world;
    if (!w) return;
    if (this.keys.pressed('escape', 'p') && w.phase === 'play' && !w.paused) {
      this.pause();
      return;
    }
    w.player.autoRun = this.opts.legacyInput;
    w.update(dt, this.controls());
    if (w.phase === 'play' && !w.paused) this.session.playTime += dt;
    for (const ev of w.events.splice(0)) this.onEvent(ev, w);
  }

  private onEvent(ev: WorldEvent, w: World): void {
    switch (ev.type) {
      case 'gate':
        if (this.autoApprove) {
          w.answerGate(ev.gate, true);
          if (!ev.gate.safe) this.autoApprove = false;
        } else this.askPermission(ev.gate, w);
        break;
      case 'checkpoint':
        this.checkpoint = { level: this.levelIndex, x: ev.x };
        break;
      case 'died':
        this.onDeath(ev, w);
        break;
      case 'cleared':
        this.onCleared(w);
        break;
      case 'bossDefeated':
        this.onWorldClear(w);
        break;
      default:
        break;
    }
  }

  private onDeath(ev: Extract<WorldEvent, { type: 'died' }>, w: World): void {
    this.session.lives -= 1;
    this.session.deaths += 1;
    this.session.form = 'small';
    this.session.context = 0;
    this.save.stats.deaths += 1;
    this.persist();
    if (ev.cause === 'rmrf') this.autoApprove = false;
    const level = w.level;
    const line = deathLine(ev.cause, ev.killer);
    const pct = Math.round(ev.progress * 100);
    if (this.session.lives <= 0) {
      this.open({
        title: '✗ Session ended',
        tone: 'err',
        lines: [
          { text: `  ${line}`, color: C.red },
          { text: `  at ${level.id} · ${pct}% complete · score ${this.session.score}`, color: C.dim },
          { text: '' },
          { text: '// Out of sessions. Starting a fresh context…', color: C.violet },
        ],
        items: [
          {
            label: 'Continue',
            hint: `restart ${level.id}`,
            action: () => {
              this.session = newSession();
              this.checkpoint = null;
              this.startIntro();
            },
          },
          { label: 'Quit to title', action: () => this.showTitle() },
        ],
        onBack: () => this.showTitle(),
      });
      return;
    }
    this.open({
      title: '✗ Process exited with code 1',
      tone: 'err',
      lines: [
        { text: `  ${line}`, color: C.red },
        { text: `  at ${level.id} · ${pct}% complete`, color: C.dim },
        { text: `  lives ×${this.session.lives} · tokens ${this.session.tokens}K · score ${this.session.score}`, color: C.dim },
        { text: '' },
        { text: `// ${quipFor(this.session.deaths, this.t)}`, color: C.violet },
      ],
      items: [
        { label: 'Retry', hint: this.checkpoint?.level === this.levelIndex ? 'from git commit' : 'enter', action: () => this.startIntro() },
        { label: 'Quit to title', action: () => this.showTitle() },
      ],
      onBack: () => this.startIntro(),
    });
  }

  private onCleared(w: World): void {
    recordClear(this.save, w.level.id, this.levelIndex + 1, this.session.score, w.level.time - w.time);
    this.save.stats.tokens += this.session.tokens;
    this.persist();
    this.session.form = w.player.form;
    this.session.context = w.player.context;
    this.checkpoint = null;
    this.levelIndex = Math.min(this.levelIndex + 1, LEVELS.length - 1);
    this.startIntro();
  }

  private onWorldClear(w: World): void {
    recordClear(this.save, w.level.id, this.levelIndex, this.session.score, w.level.time - w.time);
    const ms = Math.round(this.session.playTime * 1000);
    const prev = this.save.stats.worldBestMs;
    const best = prev === null || ms < prev;
    if (best) this.save.stats.worldBestMs = ms;
    this.persist();
    const time = fmtTime(this.session.playTime);
    this.open({
      title: '✻ World 1 complete!',
      tone: 'ok',
      lines: [
        { text: 'Copilot has stopped responding.', color: C.green },
        { text: '' },
        { text: `  time    ${time}${best ? '  (new best!)' : ''}`, color: C.text },
        { text: `  deaths  ${this.session.deaths}`, color: C.text },
        { text: `  bugs    ${this.session.bugsFixed} fixed`, color: C.text },
        { text: `  score   ${this.session.score}`, color: C.text },
        { text: '' },
        { text: 'Next: World 2 — The Repo (coming soon)', color: C.dim },
      ],
      items: [
        { label: 'Play again', action: () => this.newGame(0) },
        { label: 'Title', action: () => this.showTitle() },
      ],
      onBack: () => this.showTitle(),
    });
  }

  // ---------------------------------------------------------------- render

  render(buf: CellBuffer): void {
    const L = this.layout;
    buf.clear(C.bg);
    if (L.tooSmall) {
      const msg = ['Super Clawd needs a bigger window.', 'At least 40 × 16 — try Cmd − to zoom out.'];
      msg.forEach((m, i) =>
        buf.text(Math.max(0, Math.floor((buf.cols - m.length) / 2)), Math.floor(buf.rows / 2) - 1 + i, m, i ? C.dim : C.orange),
      );
      return;
    }
    if (this.scene === 'intro') this.renderIntro(buf);
    else if (this.scene === 'play' && this.world) this.renderPlay(buf, this.world);
    else this.renderTitle(buf);
    if (this.panel) this.renderPanel(buf, this.panel);
  }

  private pixels(buf: CellBuffer): void {
    const L = this.layout;
    framesToCells(this.frame, L.s, L.cropTop, buf, L.ox, L.oy, L.gameCols, L.gameRows);
  }

  private renderTitle(buf: CellBuffer): void {
    const g = this.g;
    const W = this.layout.viewW;
    Bg.drawTitleBackground(g, W, this.t);
    TileArt.drawGroundStrip(g, 'terminal', this.t * 20, W, 12);
    // Letter strokes are multiples of the terminal pixel size so the logo stays crisp.
    const s = this.layout.s;
    const top = this.layout.cropTop + 6;
    const small = s * 2;
    let big = s * 3;
    while (big > s && 29 * big > W - 16) big -= s;
    drawText(g, 'SUPER', Math.round(W / 2), top + 4, '#2e2926', { scale: small, align: 'center' });
    drawText(g, 'CLAWD', Math.round(W / 2), top + 8 + 8 * small, '#d97757', { scale: big, align: 'center', outline: '#2e2926' });
    const pose = (['run1', 'run2', 'run3', 'run2'] as const)[Math.floor(this.t * 8) % 4];
    const img = Hero.clawd('big', pose, Hero.PALS.claude, 1);
    g.drawImage(img, Math.round(W - 64), 192 - img.height * 2, img.width * 2, img.height * 2);
    this.pixels(buf);
    this.hudLine(buf, [
      ['✻ ', C.orange],
      ['Super Clawd', C.text],
      ['  ·  terminal edition', C.dim],
    ]);
    this.footer(buf, '↑↓ choose · enter select · q quit', C.dim);
  }

  private renderIntro(buf: CellBuffer): void {
    const level = LEVELS[this.levelIndex];
    const cx = Math.floor(buf.cols / 2);
    const cy = Math.floor(buf.rows / 2);
    const center = (y: number, s: string, color: number) => buf.text(cx - Math.floor([...s].length / 2), y, s, color);
    center(cy - 4, `WORLD ${level.id}`, C.text);
    center(cy - 2, level.name, C.orange);
    center(cy, `Clawd × ${this.session.lives}`, C.text);
    const cmd = `$ claude --level ${level.id}`;
    const shown = cmd.slice(0, Math.min(cmd.length, Math.floor(this.sceneT * 28)));
    const x0 = cx - Math.floor(cmd.length / 2);
    buf.text(x0, cy + 3, shown, C.dim);
    if (Math.floor(this.sceneT * 3) % 2 === 0) buf.set(x0 + shown.length, cy + 3, '▌', C.orange);
    if (this.checkpoint?.level === this.levelIndex) center(cy + 5, 'resuming from git commit', C.green);
    if (this.layout.s >= 4) center(buf.rows - 2, 'Tip: a bigger window (or Cmd −) makes the pixels sharper.', C.faint);
  }

  private toCell(w: World, wx: number, wy: number): [number, number] {
    const L = this.layout;
    return [L.ox + Math.floor((wx - Math.round(w.camX)) / L.s), L.oy + Math.floor((wy - L.cropTop) / (2 * L.s))];
  }

  private renderPlay(buf: CellBuffer, w: World): void {
    w.draw(this.g);
    this.pixels(buf);
    const L = this.layout;
    /** Write text inside the game area, clipping at its edges. */
    const clipped = (x: number, y: number, text: string, fg: number, bg: number) => {
      if (y < L.oy || y >= L.oy + L.gameRows) return;
      let chars = [...text];
      let cx = x;
      if (cx < L.ox) {
        chars = chars.slice(L.ox - cx);
        cx = L.ox;
      }
      const room = L.ox + L.gameCols - cx;
      if (room > 0 && chars.length) buf.text(cx, y, chars.slice(0, room).join(''), fg, bg);
    };

    // Sign text, crisp instead of tiny pixel letters.
    for (const d of w.level.decos) {
      if (d.kind !== 'sign' || !d.text) continue;
      const h = d.text.length * 9 + 12 + 10;
      d.text.forEach((line, i) => {
        const [x, y] = this.toCell(w, d.x + 4, d.y + 16 - h + 7 + i * 9);
        clipped(x, y, line, i === 0 ? C.text : C.dim, rgb('#1f1b18'));
      });
    }

    // Floating text.
    for (const p of w.fx.popups) {
      const rise = Math.min(1, p.t / 0.5) * 18;
      const [x, y] = this.toCell(w, p.x, p.y - rise);
      const color = p.rainbow ? rgb(rainbow(w.t * 1.5)) : rgb(p.color.length === 7 ? p.color : '#ffffff');
      clipped(x - Math.floor([...p.text].length / 2), y, p.text, color, C.hud);
    }

    for (const e of w.entities) {
      if (e instanceof Copilot && e.quipT > 0 && !e.dead) {
        const [x, y] = this.toCell(w, e.cx, e.y - 14);
        const q = ` ${e.quip} `;
        const x0 = Math.max(L.ox, Math.min(L.ox + L.gameCols - q.length, x - Math.floor(q.length / 2)));
        clipped(x0, Math.max(L.oy, y), q, C.text, C.panel);
      } else if (e instanceof RateLimit && e.state === 'counting' && e.activated) {
        const [x, y] = this.toCell(w, e.cx, e.cy);
        clipped(x - 1, y, ` ${Math.max(0, Math.ceil(e.remaining))} `, C.text, rgb('#3d4a63'));
      }
    }

    this.hud(buf, w);
    const p = w.player;
    if (p.star > 0) this.footer(buf, '»» bypass permissions on', rgb(rainbow(w.t * 0.8)));
    else if (w.slowmo > 0) this.footer(buf, 'ultrathink', rgb(rainbow(w.t * 0.8)));
    else if (p.form === 'agent') this.footer(buf, '» subagents ready (x)', C.text);
    else
      this.footer(
        buf,
        this.opts.legacyInput ? '← → move · ↑ jump · x subagents · esc pause' : '← → move · ↑ jump · shift run · esc pause',
        C.faint,
      );
  }

  private hudLine(buf: CellBuffer, parts: [string, number][]): void {
    buf.fill(0, 0, buf.cols, 1, C.hud);
    let x = 1;
    for (const [s, color] of parts) x += buf.text(x, 0, s, color, C.hud);
  }

  private hud(buf: CellBuffer, w: World): void {
    const s = w.session;
    const p = w.player;
    const sep: [string, number] = ['  │  ', C.faint];
    const ctxColor = p.context === 0 ? C.green : p.context === 1 ? C.gold : C.red;
    const wide = buf.cols >= 110;
    const sepS: [string, number] = wide ? sep : [' │ ', C.faint];
    const parts: [string, number][] = [
      ['✻ ', C.orange],
      [wide ? `Clawd ×${s.lives}` : `×${s.lives}`, C.text],
      sepS,
      [String(Math.min(999999, s.score)).padStart(6, '0'), C.text],
      sepS,
      ['✻ ', C.gold],
      [wide ? `${s.tokens}K tokens` : `${s.tokens}K`, C.text],
      sepS,
      ['ctx ', C.dim],
      ['▮'.repeat(p.context), ctxColor],
      ['▯'.repeat(Math.max(0, 3 - p.context)), C.faint],
      sepS,
      [w.level.id, C.orange],
      [wide ? ` ${w.level.name}` : '', C.dim],
      sepS,
      [`${wide ? 'time ' : '⧗'}${Math.ceil(w.time)}`, w.time < 100 ? C.red : C.text],
    ];
    const b = w.boss;
    if (b && w.bossStarted && !b.dead && b.state !== 'dying') {
      parts.push(
        sepS,
        [wide ? 'COPILOT ' : '', C.violet],
        ['█'.repeat(b.hp), b.phase2 ? C.red : C.violet],
        ['░'.repeat(b.maxHp - b.hp), C.faint],
      );
    }
    this.hudLine(buf, parts);
  }

  private footer(buf: CellBuffer, text: string, color: number): void {
    const y = buf.rows - 1;
    buf.fill(0, y, buf.cols, 1, C.bg);
    buf.text(1, y, text.slice(0, buf.cols - 2), color, C.bg);
  }

  private renderPanel(buf: CellBuffer, p: Panel): void {
    const lens = [
      p.title.length + 2,
      ...p.lines.map((l) => [...l.text].length),
      ...p.items.map((i) => i.label.length + (i.hint ? i.hint.length + 4 : 0) + 4),
    ];
    if (p.footer) lens.push(p.footer.length);
    const w = Math.min(buf.cols - 2, Math.max(...lens) + 4);
    const h = p.lines.length + p.items.length + (p.footer ? 2 : 0) + 4;
    const x0 = Math.floor((buf.cols - w) / 2);
    const y0 = p.low ? Math.max(1, buf.rows - h - 2) : Math.max(1, Math.floor((buf.rows - h) / 2));
    const border = TONE[p.tone];
    buf.fill(x0, y0, w, h, C.panel);
    buf.set(x0, y0, '╭', border, C.panel);
    buf.set(x0 + w - 1, y0, '╮', border, C.panel);
    buf.set(x0, y0 + h - 1, '╰', border, C.panel);
    buf.set(x0 + w - 1, y0 + h - 1, '╯', border, C.panel);
    for (let x = x0 + 1; x < x0 + w - 1; x++) {
      buf.set(x, y0, '─', border, C.panel);
      buf.set(x, y0 + h - 1, '─', border, C.panel);
    }
    for (let y = y0 + 1; y < y0 + h - 1; y++) {
      buf.set(x0, y, '│', border, C.panel);
      buf.set(x0 + w - 1, y, '│', border, C.panel);
    }
    const inner = w - 4;
    let y = y0 + 1;
    buf.text(x0 + 2, y++, p.title.slice(0, inner), border, C.panel);
    for (const l of p.lines) buf.text(x0 + 2, y++, l.text.slice(0, inner), l.color ?? C.text, C.panel);
    y++;
    p.items.forEach((item, i) => {
      const sel = i === p.sel;
      const rowBg = sel ? C.sel : C.panel;
      buf.fill(x0 + 1, y, w - 2, 1, rowBg);
      const color = item.disabled ? C.faint : C.text;
      buf.text(x0 + 2, y, sel ? '❯' : ' ', C.orange, rowBg);
      buf.text(x0 + 4, y, item.label.slice(0, inner - 2), color, rowBg);
      if (item.hint) buf.text(x0 + w - 2 - item.hint.length, y, item.hint, C.dim, rowBg);
      y++;
    });
    if (p.footer) buf.text(x0 + 2, y + 1, p.footer.slice(0, inner), C.faint, C.panel);
  }
}
