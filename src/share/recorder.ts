/**
 * Keeps the last few seconds of gameplay so a death can be shared as a GIF replay.
 * Frames are copied from the low-res game canvas into a ring buffer.
 */
export class Recorder {
  private frames: Uint8ClampedArray[] = [];
  private w = 0;
  private h = 0;
  private head = 0;
  private count = 0;
  private tick = 0;
  frozen = false;

  constructor(
    readonly maxFrames = 42,
    readonly every = 4,
  ) {}

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.tick = 0;
    this.frozen = false;
  }

  capture(g: CanvasRenderingContext2D): void {
    if (this.frozen) return;
    if (this.tick++ % this.every !== 0) return;
    const { width, height } = g.canvas;
    if (width !== this.w || height !== this.h) {
      this.w = width;
      this.h = height;
      this.frames = [];
      this.head = 0;
      this.count = 0;
    }
    const data = g.getImageData(0, 0, width, height).data;
    if (this.frames.length < this.maxFrames) this.frames.push(new Uint8ClampedArray(data));
    else this.frames[this.head].set(data);
    this.head = (this.head + 1) % this.maxFrames;
    this.count = Math.min(this.count + 1, this.maxFrames);
  }

  freeze(): void {
    this.frozen = true;
  }

  get size(): number {
    return this.count;
  }

  /** Oldest to newest copies of the recorded frames. */
  snapshot(): { w: number; h: number; frames: Uint8ClampedArray[]; delayCs: number } {
    const out: Uint8ClampedArray[] = [];
    const n = this.count;
    const start = (this.head - n + this.maxFrames * 2) % Math.max(1, this.frames.length || 1);
    for (let i = 0; i < n; i++) {
      const idx = this.frames.length < this.maxFrames ? i : (start + i) % this.maxFrames;
      out.push(new Uint8ClampedArray(this.frames[idx]));
    }
    return { w: this.w, h: this.h, frames: out, delayCs: Math.round((this.every * 100) / 60) };
  }
}
