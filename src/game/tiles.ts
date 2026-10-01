export const TILE = 16;
export const ROWS = 14;

export const T = {
  EMPTY: 0,
  GROUND: 1,
  BRICK: 2,
  PROMPT: 3,
  USED: 4,
  HARD: 5,
  PIPE_TL: 6,
  PIPE_TR: 7,
  PIPE_L: 8,
  PIPE_R: 9,
  HIDDEN: 10,
  ONEWAY: 11,
  LAVA: 12,
  TOKEN: 13,
  BARRIER: 14,
  INVIS: 15,
} as const;

export type TileId = (typeof T)[keyof typeof T];

const solid = new Uint8Array(32);
[T.GROUND, T.BRICK, T.PROMPT, T.USED, T.HARD, T.PIPE_TL, T.PIPE_TR, T.PIPE_L, T.PIPE_R, T.BARRIER, T.INVIS].forEach((t) => (solid[t] = 1));

export function isSolid(t: number): boolean {
  return solid[t] === 1;
}

export function isOneWay(t: number): boolean {
  return t === T.ONEWAY;
}

/** What a block releases when bumped from below. 'power' adapts: Opus if small, Subagents if already big. */
export type Content = 'token' | 'multi' | 'power' | 'opus' | 'agent' | 'oneup' | 'bypass' | 'compact' | 'ultrathink';
