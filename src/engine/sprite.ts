/** Pixel-art helpers. Everything is built lazily so logic modules stay DOM-free in tests. */
export type Img = HTMLCanvasElement;

type CanvasFactory = (w: number, h: number) => Img;

let factory: CanvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Swap the canvas implementation (the terminal edition renders without a DOM). */
export function setCanvasFactory(f: CanvasFactory): void {
  factory = f;
}

export function canvas(w: number, h: number): Img {
  return factory(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
}

export function ctx2d(c: Img): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2d context unavailable');
  g.imageSmoothingEnabled = false;
  return g;
}

export class Painter {
  constructor(readonly g: CanvasRenderingContext2D) {}

  px(x: number, y: number, color: string): void {
    this.g.fillStyle = color;
    this.g.fillRect(x | 0, y | 0, 1, 1);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = color;
    this.g.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  /** Filled pixel disc centered on (cx, cy). */
  disc(cx: number, cy: number, r: number, color: string): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.px(x, y, color);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const xe = Math.round(x1);
    const ye = Math.round(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x, y, color);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
}

export function paint(w: number, h: number, fn: (p: Painter, g: CanvasRenderingContext2D) => void): Img {
  const c = canvas(w, h);
  const g = ctx2d(c);
  fn(new Painter(g), g);
  return c;
}

/** Build a sprite from rows of palette characters. '.' and ' ' are transparent. */
export function fromRows(rows: readonly string[], pal: Readonly<Record<string, string>>): Img {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return paint(w, rows.length, (p) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const color = pal[ch];
        if (color) p.px(x, y, color);
      }
    });
  });
}

export function flip(src: Img): Img {
  const c = canvas(src.width, src.height);
  const g = ctx2d(c);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

const store = new Map<string, Img>();

export function cached(key: string, build: () => Img): Img {
  let img = store.get(key);
  if (!img) {
    img = build();
    store.set(key, img);
  }
  return img;
}

/** Cached sprite plus its mirrored twin. */
export function cachedPair(key: string, build: () => Img): [Img, Img] {
  const a = cached(key, build);
  const b = cached(key + '|flip', () => flip(a));
  return [a, b];
}

/** Draw an image facing left (dir -1) or right (dir 1); sprites are authored facing right. */
export function drawFacing(g: CanvasRenderingContext2D, key: string, build: () => Img, x: number, y: number, dir: number): void {
  const [r, l] = cachedPair(key, build);
  g.drawImage(dir < 0 ? l : r, Math.round(x), Math.round(y));
}
