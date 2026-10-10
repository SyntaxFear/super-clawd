import { drawText, measure } from '../engine/font';
import type { Recorder } from './recorder';

const CAPTION_H = 12;

/** Render the recorded frames (plus a caption bar) to an animated GIF in a worker. */
export async function makeReplayGif(rec: Recorder, caption: string): Promise<Blob | null> {
  const snap = rec.snapshot();
  if (!snap.frames.length || !snap.w) return null;
  const W = snap.w;
  const H = snap.h + CAPTION_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  const brand = 'SUPER CLAWD';
  const frames = snap.frames.map((f) => {
    g.putImageData(new ImageData(new Uint8ClampedArray(f), snap.w, snap.h), 0, 0);
    g.fillStyle = '#1f1b18';
    g.fillRect(0, snap.h, W, CAPTION_H);
    g.fillStyle = '#d97757';
    g.fillRect(0, snap.h, W, 1);
    drawText(g, caption, 4, snap.h + 3, '#ede6dc');
    if (measure(caption) + measure(brand) + 16 < W) drawText(g, brand, W - 4 - measure(brand), snap.h + 3, '#d97757');
    return new Uint8ClampedArray(g.getImageData(0, 0, W, H).data);
  });
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
  try {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<Uint8Array>) => resolve(e.data);
      worker.onerror = (e) => reject(e);
      worker.postMessage(
        { w: W, h: H, frames, delayCs: snap.delayCs, holdLastCs: 160, scale: 2 },
        frames.map((f) => f.buffer),
      );
    });
    return new Blob([bytes as BlobPart], { type: 'image/gif' });
  } finally {
    worker.terminate();
  }
}

export type ShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

/** Share a file through the OS share sheet when possible, otherwise download it and copy the text. */
export async function shareFile(blob: Blob, filename: string, text: string): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: 'Super Clawd' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch {
    return 'failed';
  }
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard may be blocked; the download still happened.
  }
  return 'downloaded';
}

export async function shareText(text: string): Promise<ShareResult> {
  const nav = navigator as Navigator;
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text, title: 'Super Clawd' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
