/**
 * Minimal animated GIF89a encoder (global palette, LZW), written for flat pixel art.
 * Pure functions so it runs in a worker and in tests.
 */

export interface GifFrame {
  /** Palette indices, one byte per pixel. */
  indices: Uint8Array;
  /** Delay in hundredths of a second. */
  delay: number;
}

class ByteWriter {
  private buf: Uint8Array;
  len = 0;

  constructor(size = 1 << 16) {
    this.buf = new Uint8Array(size);
  }

  private grow(n: number): void {
    if (this.len + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.len + n) size *= 2;
    const nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }

  byte(b: number): void {
    this.grow(1);
    this.buf[this.len++] = b & 0xff;
  }

  u16(v: number): void {
    this.byte(v & 0xff);
    this.byte((v >> 8) & 0xff);
  }

  bytes(arr: ArrayLike<number>): void {
    this.grow(arr.length);
    for (let i = 0; i < arr.length; i++) this.buf[this.len++] = arr[i] & 0xff;
  }

  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i));
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

/** LZW-compress palette indices into GIF data sub-blocks (same scheme as omggif). */
export function lzw(indices: Uint8Array, minCodeSize: number, out: ByteWriter): void {
  out.byte(minCodeSize);
  const clearCode = 1 << minCodeSize;
  const eoi = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let table = new Map<number, number>();

  const block = new Uint8Array(255);
  let blockLen = 0;
  let cur = 0;
  let curBits = 0;
  const flushBlock = () => {
    if (!blockLen) return;
    out.byte(blockLen);
    out.bytes(block.subarray(0, blockLen));
    blockLen = 0;
  };
  const emit = (code: number) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      block[blockLen++] = cur & 0xff;
      if (blockLen === 255) flushBlock();
      cur >>>= 8;
      curBits -= 8;
    }
  };

  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(clearCode);
      next = eoi + 1;
      codeSize = minCodeSize + 1;
      table = new Map();
    } else {
      if (next >= 1 << codeSize) codeSize++;
      table.set(key, next++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) {
    block[blockLen++] = cur & 0xff;
    if (blockLen === 255) flushBlock();
  }
  flushBlock();
  out.byte(0);
}

/** Encode frames sharing one palette (max 256 colors, as 0xRRGGBB numbers). */
export function encodeGif(w: number, h: number, palette: number[], frames: GifFrame[], loop = true): Uint8Array {
  const out = new ByteWriter(w * h * frames.length + 1024);
  let bits = 1;
  while (1 << bits < palette.length) bits++;
  bits = Math.max(2, bits);
  const tableSize = 1 << bits;

  out.str('GIF89a');
  out.u16(w);
  out.u16(h);
  out.byte(0x80 | ((bits - 1) << 4) | (bits - 1));
  out.byte(0);
  out.byte(0);
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? 0;
    out.byte((c >> 16) & 0xff);
    out.byte((c >> 8) & 0xff);
    out.byte(c & 0xff);
  }
  if (loop) {
    out.bytes([0x21, 0xff, 0x0b]);
    out.str('NETSCAPE2.0');
    out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);
  }
  for (const f of frames) {
    out.bytes([0x21, 0xf9, 0x04, 0x00]);
    out.u16(f.delay);
    out.bytes([0x00, 0x00]);
    out.byte(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(w);
    out.u16(h);
    out.byte(0);
    lzw(f.indices, bits, out);
  }
  out.byte(0x3b);
  return out.result();
}

/**
 * Turn RGBA frames into palette indices. Uses exact colors when there are ≤256,
 * otherwise falls back to a 6-7-6 color cube.
 */
export function quantize(
  frames: Uint8ClampedArray[],
  scale = 1,
  w = 0,
  h = 0,
): { palette: number[]; indexed: Uint8Array[]; w: number; h: number } {
  const map = new Map<number, number>();
  const palette: number[] = [];
  let exact = true;
  outer: for (const f of frames) {
    for (let i = 0; i < f.length; i += 4) {
      const c = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
      if (!map.has(c)) {
        if (palette.length >= 256) {
          exact = false;
          break outer;
        }
        map.set(c, palette.length);
        palette.push(c);
      }
    }
  }
  if (!exact) {
    map.clear();
    palette.length = 0;
    for (let r = 0; r < 6; r++)
      for (let g = 0; g < 7; g++)
        for (let b = 0; b < 6; b++)
          palette.push((Math.round((r * 255) / 5) << 16) | (Math.round((g * 255) / 6) << 8) | Math.round((b * 255) / 5));
  }
  const ow = w * scale;
  const oh = h * scale;
  const indexed = frames.map((f) => {
    const out = new Uint8Array(ow * oh);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let idx: number;
        if (exact) idx = map.get((f[i] << 16) | (f[i + 1] << 8) | f[i + 2])!;
        else idx = Math.round((f[i] * 5) / 255) * 42 + Math.round((f[i + 1] * 6) / 255) * 6 + Math.round((f[i + 2] * 5) / 255);
        for (let sy = 0; sy < scale; sy++) {
          const row = (y * scale + sy) * ow + x * scale;
          for (let sx = 0; sx < scale; sx++) out[row + sx] = idx;
        }
      }
    }
    return out;
  });
  return { palette, indexed, w: ow, h: oh };
}
