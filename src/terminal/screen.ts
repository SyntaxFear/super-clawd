import type { SoftCanvas } from './softcanvas';

/** A grid of terminal cells. Colors are 0xRRGGBB, or -1 for the terminal default. */
export class CellBuffer {
  ch: string[];
  fg: Int32Array;
  bg: Int32Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    this.ch = new Array<string>(cols * rows).fill(' ');
    this.fg = new Int32Array(cols * rows).fill(-1);
    this.bg = new Int32Array(cols * rows).fill(-1);
  }

  clear(bg = -1): void {
    this.ch.fill(' ');
    this.fg.fill(-1);
    this.bg.fill(bg);
  }

  set(x: number, y: number, ch: string, fg: number, bg?: number): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = y * this.cols + x;
    this.ch[i] = ch;
    this.fg[i] = fg;
    if (bg !== undefined) this.bg[i] = bg;
  }

  /** Write text; cells keep their background unless one is given. */
  text(x: number, y: number, s: string, fg: number, bg?: number): number {
    let cx = x;
    for (const ch of s) {
      this.set(cx, y, ch, fg, bg);
      cx++;
    }
    return cx - x;
  }

  fill(x: number, y: number, w: number, h: number, bg: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, ' ', -1, bg);
  }

  bgAt(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return this.bg[y * this.cols + x];
  }
}

/** Most common color in an s×s block (keeps thin pixel-art details better than averaging). */
function sample(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  x0: number,
  y0: number,
  s: number,
  scratch: Int32Array,
  counts: Int32Array,
): number {
  let n = 0;
  for (let y = y0; y < y0 + s; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = x0; x < x0 + s; x++) {
      if (x < 0 || x >= W) continue;
      const i = (y * W + x) * 4;
      const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let k = 0;
      while (k < n && scratch[k] !== c) k++;
      if (k === n) {
        scratch[n] = c;
        counts[n] = 0;
        n++;
      }
      counts[k]++;
    }
  }
  if (n === 0) return 0;
  let best = 0;
  for (let k = 1; k < n; k++) if (counts[k] > counts[best]) best = k;
  return scratch[best];
}

/**
 * Paint a frame into the cell buffer with upper-half-block characters: each cell shows two
 * vertically stacked "pixels", each one s×s game pixels.
 */
export function framesToCells(
  frame: SoftCanvas,
  s: number,
  cropTop: number,
  out: CellBuffer,
  ox: number,
  oy: number,
  cols: number,
  rows: number,
): void {
  const scratch = new Int32Array(s * s);
  const counts = new Int32Array(s * s);
  const { data, width: W, height: H } = frame;
  for (let r = 0; r < rows; r++) {
    const y = oy + r;
    if (y < 0 || y >= out.rows) continue;
    const top = cropTop + r * 2 * s;
    for (let c = 0; c < cols; c++) {
      const x = ox + c;
      if (x < 0 || x >= out.cols) continue;
      const t = sample(data, W, H, c * s, top, s, scratch, counts);
      const b = sample(data, W, H, c * s, top + s, s, scratch, counts);
      const i = y * out.cols + x;
      if (t === b) {
        out.ch[i] = ' ';
        out.fg[i] = -1;
        out.bg[i] = t;
      } else {
        out.ch[i] = '▀';
        out.fg[i] = t;
        out.bg[i] = b;
      }
    }
  }
}

export type ColorMode = 'truecolor' | '256';

function to256(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 23);
  }
  const q = (v: number) => (v < 48 ? 0 : v < 115 ? 1 : Math.round((v - 35) / 40));
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

function sgr(kind: 38 | 48, c: number, mode: ColorMode): string {
  if (c < 0) return kind === 38 ? '\x1b[39m' : '\x1b[49m';
  if (mode === '256') return `\x1b[${kind};5;${to256(c)}m`;
  return `\x1b[${kind};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`;
}

/** Emit only what changed since `prev` (or everything when prev is null). */
export function diffToAnsi(prev: CellBuffer | null, next: CellBuffer, mode: ColorMode): string {
  const parts: string[] = [];
  let curFg = -2;
  let curBg = -2;
  let cursor = -1;
  const full = !prev || prev.cols !== next.cols || prev.rows !== next.rows;
  for (let y = 0; y < next.rows; y++) {
    for (let x = 0; x < next.cols; x++) {
      const i = y * next.cols + x;
      const ch = next.ch[i];
      const fg = ch === ' ' ? -1 : next.fg[i];
      const bg = next.bg[i];
      if (!full && prev!.ch[i] === ch && prev!.bg[i] === bg && (ch === ' ' || prev!.fg[i] === fg)) continue;
      if (cursor !== i) parts.push(`\x1b[${y + 1};${x + 1}H`);
      if (ch !== ' ' && fg !== curFg) {
        parts.push(sgr(38, fg, mode));
        curFg = fg;
      }
      if (bg !== curBg) {
        parts.push(sgr(48, bg, mode));
        curBg = bg;
      }
      parts.push(ch);
      cursor = i + 1;
    }
    cursor = -1;
  }
  return parts.join('');
}

export function copyCells(src: CellBuffer): CellBuffer {
  const c = new CellBuffer(src.cols, src.rows);
  c.ch = src.ch.slice();
  c.fg.set(src.fg);
  c.bg.set(src.bg);
  return c;
}

export const rgb = (hex: string): number => parseInt(hex.replace('#', ''), 16);
