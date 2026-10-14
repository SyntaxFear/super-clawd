/**
 * Terminal keyboard input. Supports the kitty keyboard protocol (real key-up events, used by
 * Ghostty, kitty, WezTerm, foot, iTerm2…) and falls back to plain escape sequences, where holds are
 * inferred from key-repeat timing.
 */

export type KeyName = 'left' | 'right' | 'up' | 'down' | 'enter' | 'escape' | 'space' | 'shift' | 'backspace' | 'tab' | 'ctrl-c' | string;

export interface KeyEvent {
  key: KeyName;
  type: 'press' | 'repeat' | 'release';
}

const CSI_LETTER: Record<string, KeyName> = { A: 'up', B: 'down', C: 'right', D: 'left' };

function codeToKey(code: number, mods: number): KeyName {
  if (code === 13) return 'enter';
  if (code === 27) return 'escape';
  if (code === 32) return 'space';
  if (code === 9) return 'tab';
  if (code === 127 || code === 8) return 'backspace';
  if (code === 57441 || code === 57447) return 'shift';
  if ((mods - 1) & 4 && (code === 99 || code === 67)) return 'ctrl-c';
  if (code >= 32 && code < 0x110000) return String.fromCodePoint(code).toLowerCase();
  return `key${code}`;
}

/** Parse a chunk of terminal input into key events. */
export function parseKeys(data: string): KeyEvent[] {
  const out: KeyEvent[] = [];
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    if (ch === '\x1b') {
      // CSI sequences: ESC [ params final
      if (data[i + 1] === '[') {
        let j = i + 2;
        while (j < data.length && !/[A-Za-z~u]/.test(data[j])) j++;
        if (j >= data.length) break;
        const params = data.slice(i + 2, j);
        const final = data[j];
        i = j + 1;
        const [main, modPart] = params.split(';');
        const [modsStr, eventStr] = (modPart ?? '1').split(':');
        const mods = parseInt(modsStr || '1', 10) || 1;
        const ev = parseInt(eventStr || '1', 10);
        const type = ev === 3 ? 'release' : ev === 2 ? 'repeat' : 'press';
        if (final === 'u') {
          const code = parseInt(main.split(':')[0], 10);
          if (!Number.isNaN(code)) out.push({ key: codeToKey(code, mods), type });
        } else if (CSI_LETTER[final]) {
          out.push({ key: CSI_LETTER[final], type });
        }
        continue;
      }
      // SS3 arrows: ESC O A
      if (data[i + 1] === 'O' && i + 2 < data.length) {
        const k = CSI_LETTER[data[i + 2]];
        if (k) out.push({ key: k, type: 'press' });
        i += 3;
        continue;
      }
      out.push({ key: 'escape', type: 'press' });
      i += 1;
      continue;
    }
    i += 1;
    if (ch === '\r' || ch === '\n') out.push({ key: 'enter', type: 'press' });
    else if (ch === '\x03') out.push({ key: 'ctrl-c', type: 'press' });
    else if (ch === '\x7f' || ch === '\b') out.push({ key: 'backspace', type: 'press' });
    else if (ch === '\t') out.push({ key: 'tab', type: 'press' });
    else if (ch === ' ') out.push({ key: 'space', type: 'press' });
    else out.push({ key: ch.toLowerCase(), type: 'press' });
  }
  return out;
}

/** Tracks which keys are held. With real key-up events this is exact; otherwise holds expire. */
export class KeyState {
  private held = new Map<KeyName, number>();
  private pressedNow = new Set<KeyName>();
  private queue: KeyEvent[] = [];
  /** True once the terminal has confirmed the kitty keyboard protocol. */
  exact = false;

  feed(events: KeyEvent[], now: number): void {
    for (const e of events) {
      this.queue.push(e);
      if (e.type === 'release') {
        this.held.delete(e.key);
        continue;
      }
      if (this.exact) {
        if (e.type === 'press') this.pressedNow.add(e.key);
        this.held.set(e.key, Infinity);
        continue;
      }
      // Legacy terminals: a first press covers the OS key-repeat delay, repeats keep it alive briefly.
      const until = this.held.get(e.key);
      const holding = until !== undefined && until > now;
      if (!holding) this.pressedNow.add(e.key);
      this.held.set(e.key, now + (holding ? 0.13 : 0.55));
    }
  }

  /** Call once per update step. */
  tick(now: number): void {
    for (const [k, until] of this.held) if (until <= now) this.held.delete(k);
  }

  down(...keys: KeyName[]): boolean {
    return keys.some((k) => this.held.has(k));
  }

  pressed(...keys: KeyName[]): boolean {
    return keys.some((k) => this.pressedNow.has(k));
  }

  /** Events since the last call (for menus and text entry). */
  drain(): KeyEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  endStep(): void {
    this.pressedNow.clear();
  }

  releaseAll(): void {
    this.held.clear();
    this.pressedNow.clear();
  }
}
