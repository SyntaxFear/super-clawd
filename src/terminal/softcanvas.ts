/**
 * A tiny software 2D canvas: just the subset of CanvasRenderingContext2D the game's art uses
 * (rects, image blits with any affine transform, alpha, linear gradients). Lets the terminal
 * edition reuse every sprite, tile and background without a browser.
 */

type Rgba = [number, number, number, number];

const colors = new Map<string, Rgba>();

export function parseColor(input: string): Rgba {
  const hit = colors.get(input);
  if (hit) return hit;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  const s = input.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16);
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      const p = m[1].split(',').map((x) => parseFloat(x));
      [r, g, b] = p;
      if (p.length > 3) a = Math.round(p[3] * 255);
    }
  }
  const out: Rgba = [r, g, b, a];
  colors.set(input, out);
  return out;
}

export class SoftGradient {
  private stops: { o: number; c: Rgba }[] = [];

  constructor(
    private x0: number,
    private y0: number,
    private x1: number,
    private y1: number,
  ) {}

  addColorStop(offset: number, color: string): void {
    this.stops.push({ o: offset, c: parseColor(color) });
    this.stops.sort((a, b) => a.o - b.o);
  }

  at(x: number, y: number): Rgba {
    const dx = this.x1 - this.x0;
    const dy = this.y1 - this.y0;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - this.x0) * dx + (y - this.y0) * dy) / len));
    const s = this.stops;
    if (!s.length) return [0, 0, 0, 0];
    if (t <= s[0].o) return s[0].c;
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i].o) {
        const a = s[i - 1];
        const b = s[i];
        const k = (t - a.o) / Math.max(1e-6, b.o - a.o);
        return [
          a.c[0] + (b.c[0] - a.c[0]) * k,
          a.c[1] + (b.c[1] - a.c[1]) * k,
          a.c[2] + (b.c[2] - a.c[2]) * k,
          a.c[3] + (b.c[3] - a.c[3]) * k,
        ];
      }
    }
    return s[s.length - 1].c;
  }
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export class SoftCanvas {
  data: Uint8ClampedArray;
  private ctx: SoftContext | null = null;

  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  getContext(_type: '2d'): SoftContext {
    if (!this.ctx) this.ctx = new SoftContext(this);
    return this.ctx;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

export class SoftContext {
  fillStyle: string | SoftGradient = '#000000';
  globalAlpha = 1;
  imageSmoothingEnabled = false;
  private m: Matrix = { ...IDENTITY };
  private stack: { m: Matrix; alpha: number; fill: string | SoftGradient }[] = [];

  constructor(readonly canvas: SoftCanvas) {}

  save(): void {
    this.stack.push({ m: { ...this.m }, alpha: this.globalAlpha, fill: this.fillStyle });
  }

  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.m = s.m;
    this.globalAlpha = s.alpha;
    this.fillStyle = s.fill;
  }

  translate(x: number, y: number): void {
    const m = this.m;
    m.e += m.a * x + m.c * y;
    m.f += m.b * x + m.d * y;
  }

  scale(sx: number, sy: number): void {
    const m = this.m;
    m.a *= sx;
    m.b *= sx;
    m.c *= sy;
    m.d *= sy;
  }

  rotate(t: number): void {
    const m = this.m;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const { a, b, c, d } = m;
    m.a = a * cos + c * sin;
    m.b = b * cos + d * sin;
    m.c = -a * sin + c * cos;
    m.d = -b * sin + d * cos;
  }

  setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    this.m = { a, b, c, d, e, f };
  }

  resetTransform(): void {
    this.m = { ...IDENTITY };
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): SoftGradient {
    return new SoftGradient(x0, y0, x1, y1);
  }

  private axisAligned(): boolean {
    return this.m.b === 0 && this.m.c === 0;
  }

  /** Device-space pixel range covered by a user-space rect (axis-aligned transforms only). */
  private span(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const m = this.m;
    let x0 = m.a * x + m.e;
    let x1 = m.a * (x + w) + m.e;
    let y0 = m.d * y + m.f;
    let y1 = m.d * (y + h) + m.f;
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    const W = this.canvas.width;
    const H = this.canvas.height;
    return [Math.max(0, Math.round(x0)), Math.max(0, Math.round(y0)), Math.min(W, Math.round(x1)), Math.min(H, Math.round(y1))];
  }

  private blend(i: number, r: number, g: number, b: number, a: number): void {
    const d = this.canvas.data;
    const sa = (a / 255) * this.globalAlpha;
    if (sa <= 0) return;
    if (sa >= 1) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
      return;
    }
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    const k = da * (1 - sa);
    d[i] = (r * sa + d[i] * k) / oa;
    d[i + 1] = (g * sa + d[i + 1] * k) / oa;
    d[i + 2] = (b * sa + d[i + 2] * k) / oa;
    d[i + 3] = oa * 255;
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    const d = this.canvas.data;
    const W = this.canvas.width;
    for (let py = y0; py < y1; py++) d.fill(0, (py * W + x0) * 4, (py * W + x1) * 4);
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    const W = this.canvas.width;
    const style = this.fillStyle;
    if (!this.axisAligned()) {
      this.fillTransformed(x, y, w, h);
      return;
    }
    const [x0, y0, x1, y1] = this.span(x, y, w, h);
    if (typeof style === 'string') {
      const [r, g, b, a] = parseColor(style);
      for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.blend((py * W + px) * 4, r, g, b, a);
      return;
    }
    const inv = this.inverse();
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const ux = inv.a * (px + 0.5) + inv.c * (py + 0.5) + inv.e;
        const uy = inv.b * (px + 0.5) + inv.d * (py + 0.5) + inv.f;
        const [r, g, b, a] = style.at(ux, uy);
        this.blend((py * W + px) * 4, r, g, b, a);
      }
  }

  private fillTransformed(x: number, y: number, w: number, h: number): void {
    const style = this.fillStyle;
    const inv = this.inverse();
    const [bx0, by0, bx1, by1] = this.bounds(x, y, w, h);
    const W = this.canvas.width;
    for (let py = by0; py < by1; py++)
      for (let px = bx0; px < bx1; px++) {
        const ux = inv.a * (px + 0.5) + inv.c * (py + 0.5) + inv.e;
        const uy = inv.b * (px + 0.5) + inv.d * (py + 0.5) + inv.f;
        if (ux < x || ux >= x + w || uy < y || uy >= y + h) continue;
        const [r, g, b, a] = typeof style === 'string' ? parseColor(style) : style.at(ux, uy);
        this.blend((py * W + px) * 4, r, g, b, a);
      }
  }

  private inverse(): Matrix {
    const { a, b, c, d, e, f } = this.m;
    const det = a * d - b * c || 1e-9;
    return { a: d / det, b: -b / det, c: -c / det, d: a / det, e: (c * f - d * e) / det, f: (b * e - a * f) / det };
  }

  private bounds(x: number, y: number, w: number, h: number): [number, number, number, number] {
    const m = this.m;
    const pts = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [
      Math.max(0, Math.floor(Math.min(...xs))),
      Math.max(0, Math.floor(Math.min(...ys))),
      Math.min(this.canvas.width, Math.ceil(Math.max(...xs))),
      Math.min(this.canvas.height, Math.ceil(Math.max(...ys))),
    ];
  }

  drawImage(img: SoftCanvas, ...args: number[]): void {
    let sx = 0;
    let sy = 0;
    let sw = img.width;
    let sh = img.height;
    let dx: number;
    let dy: number;
    let dw: number;
    let dh: number;
    if (args.length === 2) {
      [dx, dy] = args;
      dw = sw;
      dh = sh;
    } else if (args.length === 4) {
      [dx, dy, dw, dh] = args;
    } else {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    }
    if (sw <= 0 || sh <= 0 || dw === 0 || dh === 0) return;
    const m = this.m;
    const src = img.data;
    const SW = img.width;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Fast path: unscaled blit with only a translation.
    if (m.a === 1 && m.d === 1 && m.b === 0 && m.c === 0 && dw === sw && dh === sh) {
      const ox = Math.round(dx + m.e);
      const oy = Math.round(dy + m.f);
      const x0 = Math.max(0, ox);
      const y0 = Math.max(0, oy);
      const x1 = Math.min(W, ox + sw);
      const y1 = Math.min(H, oy + sh);
      for (let py = y0; py < y1; py++) {
        const srow = (sy + py - oy) * SW;
        for (let px = x0; px < x1; px++) {
          const si = (srow + sx + px - ox) * 4;
          const a = src[si + 3];
          if (a === 0) continue;
          this.blend((py * W + px) * 4, src[si], src[si + 1], src[si + 2], a);
        }
      }
      return;
    }

    // General path: inverse-map every covered device pixel (handles flips, scaling and rotation).
    const inv = this.inverse();
    const [bx0, by0, bx1, by1] = this.bounds(dx, dy, dw, dh);
    const kx = sw / dw;
    const ky = sh / dh;
    for (let py = by0; py < by1; py++) {
      for (let px = bx0; px < bx1; px++) {
        const ux = inv.a * (px + 0.5) + inv.c * (py + 0.5) + inv.e;
        const uy = inv.b * (px + 0.5) + inv.d * (py + 0.5) + inv.f;
        const fx = (ux - dx) * kx;
        const fy = (uy - dy) * ky;
        if (fx < 0 || fy < 0 || fx >= sw || fy >= sh) continue;
        const ix = Math.floor(sx + fx);
        const iy = Math.floor(sy + fy);
        if (ix < 0 || iy < 0 || ix >= SW || iy >= img.height) continue;
        const si = (iy * SW + ix) * 4;
        const a = src[si + 3];
        if (a === 0) continue;
        this.blend((py * W + px) * 4, src[si], src[si + 1], src[si + 2], a);
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray; width: number; height: number } {
    const out = new Uint8ClampedArray(w * h * 4);
    const W = this.canvas.width;
    for (let py = 0; py < h; py++) {
      const start = ((y + py) * W + x) * 4;
      out.set(this.canvas.data.subarray(start, start + w * 4), py * w * 4);
    }
    return { data: out, width: w, height: h };
  }
}
