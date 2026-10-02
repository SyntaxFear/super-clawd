import { shade } from '../engine/color';
import { cachedPair, paint, type Img, type Painter } from '../engine/sprite';
import type { Form, Player, Pose } from '../game/player';

/**
 * Clawd, the Claude Code mascot, built procedurally from its terminal-glyph silhouette:
 * a wide block body, two tall eyes, stubby side arms and four little legs.
 */
export interface HeroPal {
  key: string;
  main: string;
  light: string;
  dark: string;
  leg: string;
  eye: string;
  glint: string;
}

function pal(key: string, main: string, eye: string, glint = '#ffffff'): HeroPal {
  return { key, main, light: shade(main, 0.25), dark: shade(main, -0.18), leg: shade(main, -0.3), eye, glint };
}

export const PALS = {
  claude: pal('claude', '#d97757', '#1e1412'),
  agent: pal('agent', '#f3ede4', '#d97757'),
  green: pal('green', '#5dbb63', '#12230f'),
  star: [
    pal('s0', '#ff6b6b', '#1e1412'),
    pal('s1', '#ffc93d', '#1e1412'),
    pal('s2', '#5fd47a', '#1e1412'),
    pal('s3', '#5aa2ff', '#1e1412'),
  ],
};

interface Spec {
  name: string;
  W: number;
  H: number;
  bodyW: number;
  bodyH: number;
  eyeW: number;
  eyeH: number;
  eyeInset: number;
  eyeTop: number;
  armW: number;
  armH: number;
  armTop: number;
  legW: number;
  legH: number;
  legX: number[];
}

const SMALL: Spec = {
  name: 's',
  W: 16,
  H: 12,
  bodyW: 12,
  bodyH: 9,
  eyeW: 1,
  eyeH: 2,
  eyeInset: 2,
  eyeTop: 2,
  armW: 2,
  armH: 2,
  armTop: 4,
  legW: 1,
  legH: 3,
  legX: [1, 3, 8, 10],
};

const BIG: Spec = {
  name: 'b',
  W: 24,
  H: 18,
  bodyW: 18,
  bodyH: 13,
  eyeW: 2,
  eyeH: 3,
  eyeInset: 3,
  eyeTop: 3,
  armW: 3,
  armH: 3,
  armTop: 6,
  legW: 2,
  legH: 5,
  legX: [1, 4, 12, 15],
};

const CROUCH: Spec = {
  ...BIG,
  name: 'c',
  H: 12,
  bodyH: 10,
  eyeTop: 2,
  eyeH: 2,
  armTop: 4,
  armH: 2,
  legH: 2,
};

const MINI: Spec = {
  name: 'm',
  W: 8,
  H: 6,
  bodyW: 6,
  bodyH: 4,
  eyeW: 1,
  eyeH: 1,
  eyeInset: 1,
  eyeTop: 1,
  armW: 1,
  armH: 1,
  armTop: 2,
  legW: 1,
  legH: 2,
  legX: [1, 4],
};

function build(spec: Spec, pose: Pose, c: HeroPal): Img {
  return paint(spec.W, spec.H, (p) => drawClawd(p, spec, pose, c));
}

function drawClawd(p: Painter, s: Spec, pose: Pose, c: HeroPal): void {
  const bx = s.armW;
  let by = 0;
  let legH = s.legH;
  const legDx = s.legX.map(() => 0);
  const half = s.legX.length / 2;
  let armTop = s.armTop;
  let armsUp = false;
  let frontArmDy = 0;
  let backArmDy = 0;

  switch (pose) {
    case 'run1':
      for (let i = 0; i < s.legX.length; i++) legDx[i] = i < half ? -1 : 1;
      break;
    case 'run2':
      by = -1;
      break;
    case 'run3':
      for (let i = 0; i < s.legX.length; i++) legDx[i] = i < half ? 1 : -1;
      break;
    case 'jump':
    case 'dead':
      legH = Math.max(1, s.legH - (s.legH > 3 ? 2 : 1));
      for (let i = 0; i < s.legX.length; i++) legDx[i] = i < half ? -1 : 1;
      armsUp = true;
      break;
    case 'pole':
    case 'victory':
      armsUp = true;
      break;
    case 'skid':
      for (let i = 0; i < s.legX.length; i++) legDx[i] = 1;
      frontArmDy = 1;
      backArmDy = -1;
      break;
    default:
      break;
  }

  const bodyY = Math.max(0, s.H - legH - s.bodyH + by);
  const bodyBottom = bodyY + s.bodyH;

  // Legs.
  s.legX.forEach((lx, i) => {
    const x = bx + lx + legDx[i];
    p.rect(x, bodyBottom, s.legW, s.H - bodyBottom, c.leg);
  });

  // Body block with simple light/shade edges.
  p.rect(bx, bodyY, s.bodyW, s.bodyH, c.main);
  p.rect(bx, bodyY, s.bodyW, 1, c.light);
  p.rect(bx, bodyY + 1, 1, Math.ceil(s.bodyH / 2), c.light);
  p.rect(bx + s.bodyW - 1, bodyY + 1, 1, s.bodyH - 1, c.dark);
  p.rect(bx, bodyBottom - 1, s.bodyW, 1, c.dark);

  // Arms: stubs on both sides; raised arms point up and out.
  if (armsUp) {
    const top = Math.max(0, bodyY + 1);
    p.rect(0, top, s.armW, s.armH, c.main);
    p.rect(bx + s.bodyW, top, s.armW, s.armH, c.main);
    p.rect(0, Math.max(0, top - 1), 1, 1, c.main);
    p.rect(s.W - 1, Math.max(0, top - 1), 1, 1, c.main);
    p.rect(0, top + s.armH - 1, s.armW, 1, c.dark);
    p.rect(bx + s.bodyW, top + s.armH - 1, s.armW, 1, c.dark);
  } else {
    armTop = bodyY + s.armTop;
    const back = armTop + backArmDy;
    const front = armTop + frontArmDy;
    p.rect(0, back, s.armW, s.armH, c.main);
    p.rect(0, back + s.armH - 1, s.armW, 1, c.dark);
    p.rect(bx + s.bodyW, front, s.armW, s.armH, c.main);
    p.rect(bx + s.bodyW, front + s.armH - 1, s.armW, 1, c.dark);
  }

  // Eyes.
  const eyeY = bodyY + s.eyeTop;
  const lx = bx + s.eyeInset;
  const rx = bx + s.bodyW - s.eyeInset - s.eyeW;
  for (const ex of [lx, rx]) {
    if (pose === 'dead') {
      const cx = ex + Math.floor(s.eyeW / 2);
      const cy = eyeY + Math.floor(s.eyeH / 2);
      p.px(cx - 1, cy - 1, c.eye);
      p.px(cx + 1, cy - 1, c.eye);
      p.px(cx, cy, c.eye);
      p.px(cx - 1, cy + 1, c.eye);
      p.px(cx + 1, cy + 1, c.eye);
    } else if (pose === 'victory') {
      const cx = ex + Math.floor(s.eyeW / 2);
      p.px(cx - 1, eyeY + 1, c.eye);
      p.px(cx, eyeY, c.eye);
      p.px(cx + 1, eyeY + 1, c.eye);
      if (s.eyeW > 1) p.px(cx + 1, eyeY, c.eye);
    } else if (pose === 'blink') {
      p.rect(ex, eyeY + s.eyeH - 1, s.eyeW, 1, c.eye);
    } else {
      p.rect(ex, eyeY, s.eyeW, s.eyeH, c.eye);
      if (s.eyeW > 1) p.px(ex, eyeY, c.glint);
    }
  }
}

export function clawd(form: Form | 'crouch', pose: Pose, c: HeroPal, dir: number): Img {
  const spec = form === 'crouch' ? CROUCH : form === 'small' ? SMALL : BIG;
  const [r, l] = cachedPair(`clawd|${spec.name}|${pose}|${c.key}`, () => build(spec, pose, c));
  return dir < 0 ? l : r;
}

export function mini(c: HeroPal, frame: number, dir: number): Img {
  const [r, l] = cachedPair(`mini|${c.key}|${frame}`, () => build(MINI, frame ? 'run1' : 'run3', c));
  return dir < 0 ? l : r;
}

/** Big idle Clawd for title screens, scaled up by the caller. */
export function portrait(c: HeroPal = PALS.claude, pose: Pose = 'idle'): Img {
  return clawd('big', pose, c, 1);
}

export function drawPlayer(g: CanvasRenderingContext2D, p: Player, form: Form, camX: number, t: number): void {
  let c: HeroPal = form === 'agent' ? PALS.agent : PALS.claude;
  if (p.star > 0) {
    const fast = p.star > 2 ? 12 : 6;
    c = PALS.star[Math.floor(t * fast) % 4];
  }
  const crouch = p.crouch && form !== 'small';
  const img = clawd(crouch ? 'crouch' : form, p.pose, c, p.facing);
  const x = Math.round(p.cx - img.width / 2 - camX);
  const y = Math.round(p.y + p.h - img.height);
  g.drawImage(img, x, y);
  if (form === 'agent' && p.state === 'play') {
    // A tiny subagent buddy hovering behind Clawd.
    const bob = Math.round(Math.sin(t * 6) * 1.5);
    const m = mini(PALS.claude, Math.floor(t * 8) % 2, p.facing);
    g.drawImage(m, Math.round(p.cx - p.facing * 15 - 4 - camX), Math.round(p.y - 6 + bob));
  }
}
