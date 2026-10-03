import { buildLevel, type LevelData, type LevelDef } from '../builder';
import { WORLD1 } from './world1';

export const LEVELS: LevelDef[] = WORLD1;

const cache = new Map<string, LevelData>();

export function getLevel(index: number): LevelData {
  const def = LEVELS[index];
  let data = cache.get(def.id);
  if (!data) {
    data = buildLevel(def);
    cache.set(def.id, data);
  }
  return data;
}

export function levelIndex(id: string): number {
  return LEVELS.findIndex((l) => l.id === id);
}
