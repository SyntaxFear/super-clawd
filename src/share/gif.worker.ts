import { encodeGif, quantize } from './gif';

interface Job {
  w: number;
  h: number;
  frames: Uint8ClampedArray[];
  delayCs: number;
  holdLastCs: number;
  scale: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { w, h, frames, delayCs, holdLastCs, scale } = e.data;
  const q = quantize(frames, scale, w, h);
  const gif = encodeGif(
    q.w,
    q.h,
    q.palette,
    q.indexed.map((indices, i) => ({ indices, delay: i === q.indexed.length - 1 ? holdLastCs : delayCs })),
  );
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(gif, [gif.buffer]);
};
