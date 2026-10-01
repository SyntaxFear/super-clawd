export type Act = 'left' | 'right' | 'up' | 'down' | 'jump' | 'run' | 'pause' | 'confirm' | 'back' | 'mute' | 'share';

const ACTS: Act[] = ['left', 'right', 'up', 'down', 'jump', 'run', 'pause', 'confirm', 'back', 'mute', 'share'];

const KEYMAP: Record<string, Act[]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up'],
  KeyW: ['up'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['jump', 'confirm'],
  KeyZ: ['jump'],
  KeyK: ['jump'],
  ShiftLeft: ['run'],
  ShiftRight: ['run'],
  KeyX: ['run'],
  KeyJ: ['run'],
  Enter: ['pause', 'confirm'],
  NumpadEnter: ['pause', 'confirm'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyM: ['mute'],
};

export type Device = 'keyboard' | 'touch' | 'gamepad';

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}

/**
 * Merges keyboard, touch and gamepad into one action state.
 * poll() runs once per fixed update so pressed() is true for exactly one step;
 * presses shorter than a frame are latched so they are never lost.
 */
export class Input {
  private kb = new Set<Act>();
  private touch = new Set<Act>();
  private pad = new Set<Act>();
  private virt = new Set<Act>();
  private latch = new Set<Act>();
  private held = new Set<Act>();
  private prevHeld = new Set<Act>();
  private now = new Set<Act>();
  private prevPadButtons: boolean[] = [];
  device: Device = 'keyboard';
  /** Raw key listener for UI text entry (slash commands). */
  onKey: ((e: KeyboardEvent) => boolean) | null = null;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (this.onKey && this.onKey(e)) {
        e.preventDefault();
        return;
      }
      const acts = KEYMAP[e.code];
      if (!acts) return;
      if (!isTypingTarget(e.target)) e.preventDefault();
      this.device = 'keyboard';
      if (e.repeat) return;
      for (const a of acts) {
        this.kb.add(a);
        this.latch.add(a);
      }
    });
    target.addEventListener('keyup', (e) => {
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.kb.delete(a);
    });
    target.addEventListener('blur', () => this.kb.clear());
  }

  setTouch(act: Act, on: boolean): void {
    if (on) {
      if (!this.touch.has(act)) this.latch.add(act);
      this.touch.add(act);
      this.device = 'touch';
    } else this.touch.delete(act);
  }

  /** Scripted input for automated play-tests. */
  setVirtual(acts: Act[]): void {
    const next = new Set(acts);
    for (const a of next) if (!this.virt.has(a)) this.latch.add(a);
    this.virt = next;
  }

  private pollPad(): void {
    this.pad.clear();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = (i: number) => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0;
      const ay = gp.axes[1] ?? 0;
      const map: [boolean, Act[]][] = [
        [b(0), ['jump', 'confirm']],
        [b(1), ['run', 'back']],
        [b(2), ['run']],
        [b(3), ['jump']],
        [b(9), ['pause']],
        [b(12) || ay < -0.6, ['up']],
        [b(13) || ay > 0.6, ['down']],
        [b(14) || ax < -0.4, ['left']],
        [b(15) || ax > 0.4, ['right']],
      ];
      let any = false;
      map.forEach(([on, acts]) => {
        if (on) {
          any = true;
          for (const a of acts) this.pad.add(a);
        }
      });
      const btns = gp.buttons.map((x) => x.pressed);
      if (any && btns.some((v, i) => v && !this.prevPadButtons[i])) this.device = 'gamepad';
      this.prevPadButtons = btns;
      break;
    }
  }

  poll(): void {
    this.pollPad();
    this.prevHeld = this.held;
    this.held = new Set();
    for (const a of ACTS) if (this.kb.has(a) || this.touch.has(a) || this.pad.has(a) || this.virt.has(a)) this.held.add(a);
    this.now = new Set(this.latch);
    for (const a of this.held) if (!this.prevHeld.has(a)) this.now.add(a);
    this.latch.clear();
  }

  down(a: Act): boolean {
    return this.held.has(a);
  }

  pressed(a: Act): boolean {
    return this.now.has(a);
  }

  /** Forget pending presses (used when switching scenes so one key doesn't trigger twice). */
  flush(): void {
    this.latch.clear();
    this.now.clear();
    this.prevHeld = new Set(this.held);
  }
}
