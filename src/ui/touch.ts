import type { Act, Input } from '../engine/input';

/**
 * On-screen controls. Fingers can slide between buttons (left ↔ right) without lifting,
 * and several fingers work at once (run + jump).
 */
export class TouchControls {
  private pointers = new Map<number, Act | null>();
  private buttons: HTMLElement[];
  active = false;

  constructor(
    private root: HTMLElement,
    private input: Input,
    private onFirstUse: () => void,
  ) {
    this.buttons = Array.from(root.querySelectorAll<HTMLElement>('[data-act]'));
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      this.pointers.set(e.pointerId, this.actAt(e.clientX, e.clientY));
      this.sync();
      if (!this.active) {
        this.active = true;
        this.onFirstUse();
      }
    };
    const move = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault();
      this.pointers.set(e.pointerId, this.actAt(e.clientX, e.clientY));
      this.sync();
    };
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      this.sync();
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private actAt(x: number, y: number): Act | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-act]');
    if (!el || !this.root.contains(el)) return null;
    return el.dataset.act as Act;
  }

  private sync(): void {
    const on = new Set<Act>();
    for (const a of this.pointers.values()) if (a) on.add(a);
    const all: Act[] = ['left', 'right', 'down', 'jump', 'run', 'pause'];
    for (const a of all) {
      this.input.setTouch(a, on.has(a));
      if (a === 'jump') this.input.setTouch('confirm', on.has(a));
    }
    for (const b of this.buttons) b.classList.toggle('on', on.has(b.dataset.act as Act));
  }

  release(): void {
    this.pointers.clear();
    this.sync();
  }
}
