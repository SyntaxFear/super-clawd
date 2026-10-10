import './style.css';
import { AudioSys } from './audio/audio';
import { Input } from './engine/input';
import { Game } from './game/game';
import { loadSave } from './save';
import { Recorder } from './share/recorder';
import { TouchControls } from './ui/touch';
import { UI } from './ui/ui';

const VIEW_H = 224;
const STEP = 1 / 60;

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const touchRoot = document.getElementById('touch') as HTMLElement;
const g = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;

const save = loadSave();
const audio = new AudioSys({ disabled: params.has('mute') && params.get('mute') !== '0', muted: save.muted });
const input = new Input(window);
const ui = new UI(uiRoot, (n) => audio.sfx(n));
const recorder = new Recorder();
const game = new Game({ g, input, audio, ui, recorder, save, params }, 320);

const coarse = window.matchMedia('(pointer: coarse)').matches;
let touchMode = coarse || params.has('touch');

let unlocked = false;
function unlock(): void {
  audio.unlock();
  if (!unlocked) {
    unlocked = true;
    game.onUnlock();
  }
}
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);
window.addEventListener('touchend', unlock, { passive: true });

new TouchControls(touchRoot, input, () => {
  unlock();
  if (!touchMode) {
    touchMode = true;
    layout();
  }
});

function layout(): void {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const portrait = touchMode && H > W * 1.1;
  document.body.classList.toggle('touch', touchMode);
  document.body.classList.toggle('portrait', portrait);
  touchRoot.hidden = !touchMode;

  let scale: number;
  let viewW: number;
  if (portrait) {
    viewW = 288;
    scale = Math.min(W / viewW, (H * 0.58) / VIEW_H);
  } else {
    scale = H / VIEW_H;
    if (W / scale < 256) scale = W / 256;
  }
  // One game pixel = a whole number of device pixels, so the art stays crisp.
  const css = Math.max(1, Math.floor(scale * dpr)) / dpr;
  viewW = portrait ? 288 : Math.max(256, Math.min(448, Math.floor(W / css)));
  if (canvas.width !== viewW) canvas.width = viewW;
  if (canvas.height !== VIEW_H) canvas.height = VIEW_H;
  const cw = Math.round(viewW * css);
  const ch = Math.round(VIEW_H * css);
  stage.style.width = `${cw}px`;
  stage.style.height = `${ch}px`;
  document.documentElement.style.setProperty('--px', `${css}px`);
  g.imageSmoothingEnabled = false;
  game.resize(viewW);
}

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 100));
layout();

// Pause when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    if (game.scene === 'play' && !game.paused && !ui.isOpen) game.pauseFromOutside();
  }
});

// Hide touch buttons while a menu is open so taps reach the menu.
new MutationObserver(() => document.body.classList.toggle('menu-open', ui.isOpen)).observe(uiRoot, { childList: true });

game.boot();

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  let d = (now - last) / 1000;
  last = now;
  if (d > 0.25) d = 0.25;
  if (Math.abs(d - STEP) < 0.002) d = STEP;
  acc += d;
  let n = 0;
  while (acc >= STEP && n < 5) {
    game.update(STEP);
    acc -= STEP;
    n++;
  }
  if (n >= 5) acc = 0;
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hook: drive the simulation from the console or an automated browser (see README).
(window as unknown as { __superclawd: unknown }).__superclawd = {
  game,
  input,
  audio,
  /** Advance the simulation `frames` steps while holding `acts`, then render. */
  step(frames: number, acts: Parameters<Input['setVirtual']>[0] = []) {
    input.setVirtual(acts);
    for (let i = 0; i < frames; i++) game.update(STEP);
    game.render();
    return {
      scene: game.scene,
      world: game.world
        ? { x: game.world.player.x, y: game.world.player.y, phase: game.world.phase, state: game.world.player.state }
        : null,
    };
  },
};
