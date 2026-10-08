import type { AudioSys } from '../audio/audio';
import type { TrackId } from '../audio/music';
import * as Bg from '../art/backgrounds';
import * as Hero from '../art/hero';
import * as TileArt from '../art/tiles';
import { drawText, measure } from '../engine/font';
import type { Input } from '../engine/input';
import { recordClear, writeSave, type SaveData } from '../save';
import type { UI } from '../ui/ui';
import type { Gate } from './entities/props';
import { drawHud } from './hud';
import { getLevel, LEVELS, levelIndex } from './levels';
import type { Controls } from './player';
import { newSession, World, type Session, type WorldEvent, type WorldHooks } from './world';

type Scene = 'title' | 'intro' | 'play' | 'menu';

const QUIPS = [
  "You're absolutely right! I should have jumped.",
  'It works on my machine.',
  'Have you tried /compact?',
  'git blame says: you.',
  'Let me try a different approach…',
  'Fixed it! (it was not fixed)',
  'Retrying with exponential backoff…',
  'Skill issue. Temporary one.',
  'Ship it anyway? No.',
];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface GameDeps {
  g: CanvasRenderingContext2D;
  input: Input;
  audio: AudioSys;
  ui: UI;
  save: SaveData;
  params: URLSearchParams;
}

export class Game {
  scene: Scene = 'title';
  sceneT = 0;
  t = 0;
  viewW: number;
  session: Session = newSession();
  levelIndex = 0;
  world: World | null = null;
  checkpoint: { level: number; x: number } | null = null;
  paused = false;
  autoApprove = false;
  private readonly g: CanvasRenderingContext2D;
  private readonly input: Input;
  private readonly audio: AudioSys;
  private readonly ui: UI;
  private readonly save: SaveData;
  private readonly params: URLSearchParams;
  private titleMusicPlayed = false;

  private readonly hooks: WorldHooks = {
    sfx: (n) => this.audio.sfx(n),
    music: (id, o) => this.audio.music(id as TrackId | null, o),
  };

  constructor(d: GameDeps, viewW: number) {
    this.g = d.g;
    this.input = d.input;
    this.audio = d.audio;
    this.ui = d.ui;
    this.save = d.save;
    this.params = d.params;
    this.viewW = viewW;
    this.input.onKey = (e) => this.onKey(e);
  }

  boot(): void {
    const lv = this.params.get('level');
    if (lv && levelIndex(lv) >= 0) {
      this.newGame(levelIndex(lv));
      const x = Number(this.params.get('x'));
      if (x) this.checkpoint = { level: this.levelIndex, x: x * 16 };
      if (this.params.has('skipintro')) this.startLevel();
      return;
    }
    this.showTitle();
  }

  resize(viewW: number): void {
    this.viewW = viewW;
    this.world?.setViewW(viewW);
  }

  /** First user gesture: audio can start now. */
  onUnlock(): void {
    if (this.scene === 'title' && !this.titleMusicPlayed) {
      this.titleMusicPlayed = true;
      this.audio.music('title');
    }
  }

  private onKey(e: KeyboardEvent): boolean {
    if (!this.ui.isOpen) return false;
    if (this.ui.handleKey(e)) return true;
    if (/^Digit[1-9]$/.test(e.code)) {
      this.ui.pick(Number(e.code.slice(5)) - 1);
      return true;
    }
    if (this.gatePanel && (e.key === 'y' || e.key === 'n')) {
      this.ui.pick(e.key === 'y' ? 0 : 2);
      return true;
    }
    return false;
  }

  private gatePanel = false;

  // ---------------------------------------------------------------- scenes

  showTitle(): void {
    this.scene = 'title';
    this.sceneT = 0;
    this.world = null;
    this.paused = false;
    this.audio.music(null);
    const unlocked = Math.min(this.save.unlocked, LEVELS.length - 1);
    const cont = LEVELS[unlocked];
    this.ui.open({
      title: '✻ Welcome to Super Clawd!',
      tone: 'brand',
      className: 'title-panel',
      lines: [{ text: 'Fix bugs. Collect tokens. Ship to prod.', cls: 'dim' }],
      items: [
        { cmd: '/play', label: 'New game', hint: 'World 1-1', action: () => this.newGame(0) },
        {
          cmd: '/continue',
          label: 'Continue',
          hint: `World ${cont.id}`,
          disabled: this.save.unlocked === 0,
          action: () => this.newGame(unlocked),
        },
        { cmd: '/levels', label: 'Select level', action: () => this.showLevels() },
        { cmd: '/help', label: 'Controls', action: () => this.showHelp(() => this.showTitle()) },
        { cmd: '/sound', label: `Sound: ${this.audio.muted ? 'off' : 'on'}`, action: () => this.toggleMute(() => this.showTitle()) },
      ],
      typing: true,
      footer: 'fan game · not affiliated with Anthropic',
    });
  }

  private showLevels(): void {
    this.ui.open({
      title: '/levels',
      tone: 'brand',
      lines: [{ text: 'World 1 — Terminal', cls: 'dim' }],
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
    this.ui.open({
      title: '/help',
      tone: 'brand',
      wide: true,
      lines: [
        { text: 'KEYBOARD', cls: 'head' },
        '← →  move      ↑ / Space / Z  jump',
        'Shift / X  run + throw subagents',
        '↓  crouch / enter pipes   Esc  pause   M  mute',
        { text: 'TOUCH', cls: 'head' },
        '◀ ▶ move   A jump   B subagents   ❚❚ pause',
        { text: 'GAMEPAD', cls: 'head' },
        'D-pad move · A jump · B/X run · Start pause',
        { text: 'RULES', cls: 'head' },
        'Stomp bugs. 100K tokens = extra life.',
        'Getting hit fills your context window. Full = dead.',
        'Opus makes you big. /compact clears context.',
      ],
      items: [{ label: 'Back', action: back }],
      onBack: back,
    });
  }

  private toggleMute(reopen?: () => void): void {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    this.save.muted = m;
    writeSave(this.save);
    if (reopen) reopen();
    else this.ui.toast(m ? 'Sound off (M)' : 'Sound on (M)');
  }

  newGame(index: number): void {
    this.session = newSession();
    this.levelIndex = index;
    this.checkpoint = null;
    this.autoApprove = false;
    this.startIntro();
  }

  private startIntro(): void {
    this.ui.close();
    this.scene = 'intro';
    this.sceneT = 0;
    this.world = null;
    this.paused = false;
    this.audio.music(null);
    this.input.flush();
  }

  startLevel(): void {
    const level = getLevel(this.levelIndex);
    const cp = this.checkpoint && this.checkpoint.level === this.levelIndex ? this.checkpoint.x : null;
    this.world = new World(level, this.session, this.hooks, { viewW: this.viewW, checkpointX: cp });
    if (this.params.has('god')) this.world.player.star = 9999;
    this.scene = 'play';
    this.sceneT = 0;
    this.paused = false;
    this.audio.music(level.music);
    this.input.flush();
    this.ui.close();
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.t += dt;
    this.sceneT += dt;
    this.input.poll();
    if (this.input.pressed('mute')) this.toggleMute();

    if (this.ui.isOpen) {
      if (this.input.pressed('up')) this.ui.nav(-1);
      if (this.input.pressed('down')) this.ui.nav(1);
      if (this.input.pressed('confirm') || this.input.pressed('jump')) this.ui.select();
      else if (this.input.pressed('back')) this.ui.back();
      return;
    }

    switch (this.scene) {
      case 'intro':
        if (this.sceneT > 2.4 || (this.sceneT > 0.5 && (this.input.pressed('confirm') || this.input.pressed('jump')))) this.startLevel();
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      default:
        break;
    }
  }

  private controls(): Controls {
    const i = this.input;
    return {
      left: i.down('left'),
      right: i.down('right'),
      down: i.down('down'),
      jump: i.down('jump') || i.down('up'),
      jumpPressed: i.pressed('jump') || i.pressed('up'),
      run: i.down('run'),
      runPressed: i.pressed('run'),
    };
  }

  private updatePlay(dt: number): void {
    const w = this.world;
    if (!w) return;
    if (this.input.pressed('pause') && w.phase === 'play' && !w.paused) {
      this.pause();
      return;
    }
    w.player.autoRun = this.input.device === 'touch';
    w.update(dt, this.controls());
    if (w.phase === 'play' && !w.paused) this.session.playTime += dt;
    const events = w.events.splice(0);
    for (const ev of events) this.onEvent(ev, w);
  }

  private onEvent(ev: WorldEvent, w: World): void {
    switch (ev.type) {
      case 'gate':
        if (this.autoApprove) {
          this.ui.toast('auto-approved (you said don’t ask again)', 2400);
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

  private askPermission(gate: Gate, w: World): void {
    this.gatePanel = true;
    const answer = (yes: boolean, always = false) => {
      this.gatePanel = false;
      this.ui.close();
      if (always) this.autoApprove = true;
      w.answerGate(gate, yes);
      this.input.flush();
    };
    this.ui.open({
      title: 'Bash command',
      tone: 'warn',
      className: 'permission',
      lines: [
        { text: `  ${gate.cmd}`, cls: 'cmd' },
        { text: gate.safe ? '  Run the test suite' : '  Delete everything in your home directory', cls: 'dim' },
        '',
        'Do you want to proceed?',
      ],
      items: [
        { label: '1. Yes', action: () => answer(true) },
        { label: "2. Yes, and don't ask again", action: () => answer(true, true) },
        { label: '3. No, and tell Claude what to do differently', hint: 'esc', action: () => answer(false) },
      ],
      onBack: () => answer(false),
    });
  }

  private deathLine(cause: string, killer: string): string {
    switch (cause) {
      case 'pit':
        return 'fell into /dev/null';
      case 'lava':
        return 'touched the red CI pipeline';
      case 'time':
        return 'request timed out';
      case 'context':
        return `context limit reached · last hit: ${killer || 'unknown'}`;
      case 'rmrf':
        return 'you approved rm -rf ~/';
      default:
        return `killed by ${killer || 'something'}`;
    }
  }

  private onDeath(ev: Extract<WorldEvent, { type: 'died' }>, w: World): void {
    this.session.lives -= 1;
    this.session.deaths += 1;
    this.session.form = 'small';
    this.session.context = 0;
    this.save.stats.deaths += 1;
    this.save.stats.bugsFixed = Math.max(this.save.stats.bugsFixed, 0);
    writeSave(this.save);
    const level = w.level;
    if (ev.cause === 'rmrf') this.autoApprove = false;
    const line = this.deathLine(ev.cause, ev.killer);
    const pct = Math.round(ev.progress * 100);
    const quip = QUIPS[(this.session.deaths * 7 + Math.floor(this.t)) % QUIPS.length];
    if (this.session.lives <= 0) {
      this.audio.music('gameover');
      this.ui.open({
        title: '✗ Session ended',
        tone: 'err',
        lines: [
          { text: `  ${line}`, cls: 'err' },
          { text: `  at ${level.id} · ${pct}% complete · score ${this.session.score}`, cls: 'dim' },
          '',
          { text: '// Out of sessions. Starting a fresh context…', cls: 'quip' },
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
    this.ui.open({
      title: '✗ Process exited with code 1',
      tone: 'err',
      lines: [
        { text: `  ${line}`, cls: 'err' },
        { text: `  at ${level.id} · ${pct}% complete`, cls: 'dim' },
        { text: `  lives ×${this.session.lives} · tokens ${this.session.tokens}K · score ${this.session.score}`, cls: 'dim' },
        '',
        { text: `// ${quip}`, cls: 'quip' },
      ],
      items: [
        { label: 'Retry', hint: this.checkpoint?.level === this.levelIndex ? 'from git commit' : 'enter', action: () => this.startIntro() },
        { label: 'Quit to title', action: () => this.showTitle() },
      ],
      onBack: () => this.startIntro(),
    });
  }

  private onCleared(w: World): void {
    const used = w.level.time - w.time;
    const id = w.level.id;
    const isBest = recordClear(this.save, id, this.levelIndex + 1, this.session.score, used);
    this.save.stats.tokens += this.session.tokens;
    writeSave(this.save);
    if (isBest) this.ui.toast(`New best on ${id}: ${this.session.score}`);
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
    writeSave(this.save);
    this.audio.music('world');
    const time = fmtTime(this.session.playTime);
    this.ui.open({
      title: '✻ World 1 complete!',
      tone: 'ok',
      lines: [
        { text: 'Copilot has stopped responding.', cls: 'ok' },
        '',
        `  time    ${time}${best ? '  (new best!)' : ''}`,
        `  deaths  ${this.session.deaths}`,
        `  bugs    ${this.session.bugsFixed} fixed`,
        `  score   ${this.session.score}`,
        '',
        { text: 'Next: World 2 — The Repo (coming soon)', cls: 'dim' },
      ],
      items: [
        { label: 'Play again', action: () => this.newGame(0) },
        { label: 'Title', action: () => this.showTitle() },
      ],
      onBack: () => this.showTitle(),
    });
  }

  pauseFromOutside(): void {
    if (this.scene === 'play' && this.world?.phase === 'play' && !this.ui.isOpen) this.pause();
  }

  private pause(): void {
    this.paused = true;
    this.audio.sfx('pause');
    setTimeout(() => {
      if (this.paused) this.audio.suspend();
    }, 250);
    const resume = () => {
      this.paused = false;
      this.ui.close();
      this.audio.resume();
      this.input.flush();
    };
    const open = () =>
      this.ui.open({
        title: '❚❚ Paused',
        tone: 'brand',
        lines: [{ text: `${this.world?.level.id} · ${this.world?.level.name}`, cls: 'dim' }],
        items: [
          { label: 'Resume', hint: 'esc', action: resume },
          {
            label: 'Restart level',
            action: () => {
              this.audio.resume();
              this.checkpoint = null;
              this.startIntro();
            },
          },
          {
            label: `Sound: ${this.audio.muted ? 'off' : 'on'}`,
            action: () => {
              this.toggleMute(open);
            },
          },
          { label: 'Controls', action: () => this.showHelp(open) },
          {
            label: 'Quit to title',
            action: () => {
              this.audio.resume();
              this.showTitle();
            },
          },
        ],
        onBack: resume,
      });
    open();
  }

  // ---------------------------------------------------------------- render

  render(): void {
    const g = this.g;
    const W = this.viewW;
    g.imageSmoothingEnabled = false;
    if (this.scene === 'title') this.drawTitle(g, W);
    else if (this.scene === 'intro') this.drawIntro(g, W);
    else if (this.world) {
      this.world.draw(g);
      drawHud(g, this.world, W);
    }
    if (this.params.has('debug') && this.world) {
      const p = this.world.player;
      drawText(g, `x${Math.floor(p.x / 16)} y${Math.floor(p.y / 16)} e${this.world.entities.length}`, 4, 200, '#ffffff', {
        shadow: '#000000',
      });
    }
  }

  private drawTitle(g: CanvasRenderingContext2D, W: number): void {
    const t = this.t;
    Bg.drawTitleBackground(g, W, t);
    TileArt.drawGroundStrip(g, 'terminal', t * 20, W, 12);
    const s1 = 'SUPER';
    const s2 = 'CLAWD';
    drawText(g, s1, Math.round(W / 2), 16, '#2e2926', { scale: 2, align: 'center' });
    const bob = Math.round(Math.sin(t * 2) * 1.5);
    drawText(g, s2, Math.round(W / 2 + 2), 36 + bob + 2, '#8a3d27', { scale: 4, align: 'center' });
    drawText(g, s2, Math.round(W / 2), 36 + bob, '#d97757', { scale: 4, align: 'center', outline: '#2e2926' });
    const pose = Math.floor(t * 8) % 4;
    const img = Hero.clawd('big', (['run1', 'run2', 'run3', 'run2'] as const)[pose], Hero.PALS.claude, 1);
    g.drawImage(img, Math.round(W - 60), 192 - img.height * 2, img.width * 2, img.height * 2);
  }

  private drawIntro(g: CanvasRenderingContext2D, W: number): void {
    const level = LEVELS[this.levelIndex];
    g.fillStyle = '#141210';
    g.fillRect(0, 0, W, 224);
    drawText(g, `WORLD ${level.id}`, Math.round(W / 2), 64, '#ffffff', { scale: 2, align: 'center' });
    drawText(g, level.name, Math.round(W / 2), 92, '#d97757', { align: 'center' });
    const lives = `× ${this.session.lives}`;
    const img = Hero.clawd('small', 'idle', Hero.PALS.claude, 1);
    const total = img.width + 6 + measure(lives);
    const x0 = Math.round(W / 2 - total / 2);
    g.drawImage(img, x0, 118);
    drawText(g, lives, x0 + img.width + 6, 121, '#ffffff');
    const cmd = `$ claude --level ${level.id}`;
    const n = Math.min(cmd.length, Math.floor(this.sceneT * 28));
    const shown = cmd.slice(0, n);
    const cx = Math.round(W / 2 - measure(cmd) / 2);
    drawText(g, shown, cx, 170, '#8c8279');
    if (Math.floor(this.sceneT * 3) % 2 === 0) {
      g.fillStyle = '#d97757';
      g.fillRect(cx + measure(shown) + 2, 170, 5, 8);
    }
    if (this.checkpoint?.level === this.levelIndex)
      drawText(g, 'resuming from git commit', Math.round(W / 2), 186, '#5f8f55', { align: 'center' });
  }
}
