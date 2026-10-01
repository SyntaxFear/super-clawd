import { NO_CONTROLS, Player, type Controls, type PlayerHost, type PlatformLike } from '../src/game/player';
import { TileMap } from '../src/game/tilemap';
import { T, ROWS } from '../src/game/tiles';

export function flatMap(width = 60, top = 12): TileMap {
  const m = new TileMap(width, ROWS);
  for (let x = 0; x < width; x++) for (let y = top; y < ROWS; y++) m.set(x, y, T.GROUND);
  return m;
}

export class StubHost implements PlayerHost {
  bumps: { tx: number; ty: number }[] = [];
  killed = '';
  platforms: PlatformLike[] = [];
  constructor(public map: TileMap) {}
  sfx(): void {}
  bump(_p: Player, ceiling: { tx: number; ty: number }[]): void {
    this.bumps.push(...ceiling);
  }
  platformList(): readonly PlatformLike[] {
    return this.platforms;
  }
  fireAgent(): void {}
  tryWarp(): boolean {
    return false;
  }
  killPlayer(cause: string): void {
    this.killed = cause;
  }
  landed(): void {}
}

export const DT = 1 / 60;

export function ctl(over: Partial<Controls>): Controls {
  return { ...NO_CONTROLS, ...over };
}

/** Settle the player on the ground. */
export function settle(p: Player, host: StubHost, frames = 10): void {
  for (let i = 0; i < frames; i++) p.update(host, DT, NO_CONTROLS);
}
