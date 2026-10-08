import { cached, paint, type Img } from '../engine/sprite';

/**
 * Copilot (cartoon parody): a round pilot helmet with big aviator goggles,
 * a headset, a tiny propeller and twin jets. Not any real logo.
 */
export function copilot(phase2: boolean, frame: number, stunned: boolean): Img {
  return cached(`copilot|${phase2}|${frame}|${stunned}`, () =>
    paint(52, 46, (p) => {
      const out = '#241c3a';
      const helm = phase2 ? '#6a3f7a' : '#5b4b8a';
      const helmLight = phase2 ? '#9a62a8' : '#7d6cb3';
      const helmDark = phase2 ? '#43264f' : '#3e3263';
      const face = '#efe3f7';
      const band = '#2b2238';
      const rim = '#c9ccd6';
      const lens = phase2 ? '#ff6b6b' : '#7fd3f7';
      const lensDark = phase2 ? '#b3282f' : '#3a9cc4';

      // Jets (only while flying).
      if (!stunned) {
        const fl = frame ? 6 : 4;
        for (const jx of [17, 33]) {
          p.rect(jx, 36, 4, 3, '#4a4458');
          p.rect(jx, 39, 4, fl, '#ff7a45');
          p.rect(jx + 1, 39, 2, fl - 1, '#ffd166');
        }
      }

      // Scarf trailing to the left.
      const sw = frame ? 0 : 1;
      p.rect(4, 31 + sw, 10, 3, '#e5484d');
      p.rect(1, 32 + sw * 2, 4, 2, '#e5484d');
      p.rect(4, 33 + sw, 10, 1, '#a32a30');

      // Helmet.
      for (let y = 0; y < 46; y++) {
        for (let x = 0; x < 52; x++) {
          const nx = (x + 0.5 - 26) / 21;
          const ny = (y + 0.5 - 21) / 16;
          const d = nx * nx + ny * ny;
          if (d > 1) continue;
          let c = helm;
          if (d > 0.86) c = out;
          else if (nx < -0.35 && ny < -0.1) c = helmLight;
          else if (nx > 0.45 || ny > 0.55) c = helmDark;
          p.px(x, y, c);
        }
      }
      // Face plate.
      for (let y = 20; y < 38; y++)
        for (let x = 10; x < 42; x++) {
          const nx = (x + 0.5 - 26) / 13.5;
          const ny = (y + 0.5 - 28) / 8.5;
          if (nx * nx + ny * ny <= 1) p.px(x, y, face);
        }
      // Goggle strap.
      p.rect(6, 13, 40, 5, band);
      // Lenses.
      for (const lx of [17, 35]) {
        for (let y = 7; y < 26; y++)
          for (let x = lx - 9; x < lx + 9; x++) {
            const r = Math.hypot(x + 0.5 - lx, y + 0.5 - 16);
            if (r <= 7.6) p.px(x, y, r > 6.2 ? rim : r > 5.4 ? lensDark : lens);
          }
        if (stunned) {
          // Dizzy swirl.
          p.rect(lx - 3, 15, 6, 1, '#ffffff');
          p.rect(lx - 3, 13, 1, 3, '#ffffff');
          p.rect(lx - 3, 13, 5, 1, '#ffffff');
          p.rect(lx + 1, 13, 1, 5, '#ffffff');
          p.rect(lx - 1, 17, 3, 1, '#ffffff');
        } else {
          p.rect(lx - 4, 12, 3, 2, '#ffffff');
          p.px(lx - 4, 14, '#ffffff');
          p.rect(lx + 1, 16, 2, 2, phase2 ? '#2a0b0e' : '#0f3b52');
        }
      }
      // Mouth.
      if (stunned) {
        p.rect(23, 31, 6, 2, '#3a2a4a');
      } else if (phase2) {
        p.rect(21, 31, 10, 2, '#3a2a4a');
        p.rect(21, 31, 10, 1, '#ffffff');
      } else {
        p.rect(22, 31, 8, 1, '#3a2a4a');
        p.px(21, 30, '#3a2a4a');
        p.px(30, 30, '#3a2a4a');
      }
      // Headset ear cups + mic boom.
      p.rect(3, 18, 4, 9, band);
      p.rect(45, 18, 4, 9, band);
      p.rect(46, 26, 1, 5, rim);
      p.rect(36, 31, 11, 1, rim);
      p.rect(34, 30, 3, 3, '#3a3448');
      // Propeller.
      p.rect(24, 2, 4, 3, band);
      if (frame) p.rect(13, 1, 26, 2, rim);
      else p.rect(21, 0, 10, 2, rim);
    }),
  );
}
