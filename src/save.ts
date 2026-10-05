/** Local progress and stats (no accounts, no network). */
export interface SaveData {
  v: 1;
  /** Highest level index the player may start from. */
  unlocked: number;
  best: Record<string, { score: number; time: number }>;
  stats: { deaths: number; bugsFixed: number; tokens: number; clears: number; worldBestMs: number | null };
  muted: boolean;
}

const KEY = 'superclawd:v1';

export function emptySave(): SaveData {
  return { v: 1, unlocked: 0, best: {}, stats: { deaths: 0, bugsFixed: 0, tokens: 0, clears: 0, worldBestMs: null }, muted: false };
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): SaveData {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw) as Partial<SaveData>;
    const base = emptySave();
    return {
      ...base,
      ...d,
      v: 1,
      best: { ...base.best, ...(d.best ?? {}) },
      stats: { ...base.stats, ...(d.stats ?? {}) },
    };
  } catch {
    return emptySave();
  }
}

export function writeSave(
  d: SaveData,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null,
): void {
  try {
    storage?.setItem(KEY, JSON.stringify(d));
  } catch {
    // Private mode or quota: progress just won't persist.
  }
}

/** Record a level clear. Returns true when it's a new best score. */
export function recordClear(d: SaveData, levelId: string, nextIndex: number, score: number, time: number): boolean {
  d.unlocked = Math.max(d.unlocked, nextIndex);
  d.stats.clears += 1;
  const prev = d.best[levelId];
  const isBest = !prev || score > prev.score;
  if (isBest) d.best[levelId] = { score, time };
  else if (time < prev.time) d.best[levelId] = { ...prev, time };
  return isBest;
}
