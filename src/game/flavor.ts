/** Words shared by every front-end: death lines, quips and time formatting. */

export const QUIPS = [
  "You're absolutely right! I should have jumped.",
  'It works on my machine.',
  'Have you tried /compact?',
  'git blame says: you.',
  'Let me try a different approach…',
  'Fixed it! (it was not fixed)',
  'Retrying with exponential backoff…',
  'Skill issue. Temporary one.',
  'Ship it anyway? No.',
];

export function deathLine(cause: string, killer: string): string {
  switch (cause) {
    case 'pit':
      return 'fell into /dev/null';
    case 'lava':
      return 'touched the red CI pipeline';
    case 'time':
      return 'request timed out';
    case 'context':
      return `context limit reached · last hit: ${killer || 'unknown'}`;
    case 'rmrf':
      return 'you approved rm -rf ~/';
    default:
      return `killed by ${killer || 'something'}`;
  }
}

export function quipFor(deaths: number, t: number): string {
  return QUIPS[(deaths * 7 + Math.floor(t)) % QUIPS.length];
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
