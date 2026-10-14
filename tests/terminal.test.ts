import { beforeAll, describe, expect, it } from 'vitest';
import { setCanvasFactory } from '../src/engine/sprite';
import { emptySave } from '../src/save';
import { computeLayout, TerminalApp } from '../src/terminal/app';
import { KeyState, parseKeys } from '../src/terminal/keys';
import { CellBuffer, copyCells, diffToAnsi, framesToCells } from '../src/terminal/screen';
import { parseColor, SoftCanvas } from '../src/terminal/softcanvas';

beforeAll(() => {
  setCanvasFactory((w, h) => new SoftCanvas(w, h) as unknown as HTMLCanvasElement);
});

function px(c: SoftCanvas, x: number, y: number): number[] {
  const i = (y * c.width + x) * 4;
  return Array.from(c.data.slice(i, i + 4));
}

describe('soft canvas', () => {
  it('parses hex and rgba colors', () => {
    expect(parseColor('#d97757')).toEqual([217, 119, 87, 255]);
    expect(parseColor('#fff')).toEqual([255, 255, 255, 255]);
    expect(parseColor('rgba(20, 17, 15, 0.5)')).toEqual([20, 17, 15, 128]);
  });

  it('fills rects and blends alpha', () => {
    const c = new SoftCanvas(4, 4);
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 4, 4);
    g.globalAlpha = 0.5;
    g.fillStyle = '#0000ff';
    g.fillRect(1, 1, 1, 1);
    expect(px(c, 0, 0)).toEqual([255, 0, 0, 255]);
    const [r, , b, a] = px(c, 1, 1);
    expect(r).toBeGreaterThan(120);
    expect(b).toBeGreaterThan(120);
    expect(a).toBe(255);
  });

  it('draws images, mirrored with a negative scale', () => {
    const src = new SoftCanvas(2, 1);
    const sg = src.getContext('2d');
    sg.fillStyle = '#ff0000';
    sg.fillRect(0, 0, 1, 1);
    sg.fillStyle = '#00ff00';
    sg.fillRect(1, 0, 1, 1);
    const dst = new SoftCanvas(4, 1);
    const g = dst.getContext('2d');
    g.drawImage(src, 0, 0);
    g.save();
    g.translate(4, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    g.restore();
    expect(px(dst, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(dst, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(px(dst, 2, 0)).toEqual([0, 255, 0, 255]);
    expect(px(dst, 3, 0)).toEqual([255, 0, 0, 255]);
  });

  it('fills vertical gradients', () => {
    const c = new SoftCanvas(1, 10);
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 10);
    lg.addColorStop(0, '#000000');
    lg.addColorStop(1, '#ffffff');
    g.fillStyle = lg;
    g.fillRect(0, 0, 1, 10);
    expect(px(c, 0, 0)[0]).toBeLessThan(30);
    expect(px(c, 0, 9)[0]).toBeGreaterThan(225);
  });
});

describe('half-block screen', () => {
  it('turns two stacked pixels into one cell', () => {
    const c = new SoftCanvas(2, 4);
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000';
    g.fillRect(0, 0, 2, 2);
    g.fillStyle = '#0000ff';
    g.fillRect(0, 2, 2, 2);
    const buf = new CellBuffer(2, 2);
    framesToCells(c, 1, 0, buf, 0, 0, 2, 2);
    expect(buf.ch[0]).toBe(' ');
    expect(buf.bg[0]).toBe(0xff0000);
    const lower = new CellBuffer(1, 1);
    framesToCells(c, 2, 0, lower, 0, 0, 1, 1);
    expect(lower.ch[0]).toBe('▀');
    expect(lower.fg[0]).toBe(0xff0000);
    expect(lower.bg[0]).toBe(0x0000ff);
  });

  it('only redraws cells that changed', () => {
    const a = new CellBuffer(4, 2);
    a.text(0, 0, 'abcd', 0xffffff, 0);
    const b = copyCells(a);
    expect(diffToAnsi(a, b, 'truecolor')).toBe('');
    b.set(2, 1, 'X', 0xff0000, 0);
    const out = diffToAnsi(a, b, 'truecolor');
    expect(out).toContain('\x1b[2;3H');
    expect(out).toContain('X');
    expect(out).not.toContain('abcd');
  });

  it('falls back to 256 colors', () => {
    const b = new CellBuffer(1, 1);
    b.set(0, 0, 'A', 0xd97757, 0x000000);
    expect(diffToAnsi(null, b, '256')).toMatch(/\x1b\[38;5;\d+m/);
  });
});

describe('keys', () => {
  it('reads kitty protocol presses, repeats and releases', () => {
    expect(parseKeys('\x1b[97u')).toEqual([{ key: 'a', type: 'press' }]);
    expect(parseKeys('\x1b[97;1:2u')).toEqual([{ key: 'a', type: 'repeat' }]);
    expect(parseKeys('\x1b[97;1:3u')).toEqual([{ key: 'a', type: 'release' }]);
    expect(parseKeys('\x1b[1;1:3C')).toEqual([{ key: 'right', type: 'release' }]);
    expect(parseKeys('\x1b[57441;2u')).toEqual([{ key: 'shift', type: 'press' }]);
    expect(parseKeys('\x1b[99;5u')).toEqual([{ key: 'ctrl-c', type: 'press' }]);
    expect(parseKeys('\x1b[13u\x1b[32u')).toEqual([
      { key: 'enter', type: 'press' },
      { key: 'space', type: 'press' },
    ]);
  });

  it('reads legacy sequences', () => {
    expect(parseKeys('\x1b[A\x1bOD x\r\x03').map((e) => e.key)).toEqual(['up', 'left', 'space', 'x', 'enter', 'ctrl-c']);
  });

  it('infers holds from key repeat on legacy terminals', () => {
    const k = new KeyState();
    k.feed([{ key: 'right', type: 'press' }], 0);
    expect(k.pressed('right')).toBe(true);
    k.endStep();
    k.tick(0.4);
    expect(k.down('right')).toBe(true);
    k.feed([{ key: 'right', type: 'press' }], 0.5);
    expect(k.pressed('right')).toBe(false);
    k.tick(0.6);
    expect(k.down('right')).toBe(true);
    k.tick(0.7);
    expect(k.down('right')).toBe(false);
  });

  it('uses exact releases when the terminal supports them', () => {
    const k = new KeyState();
    k.exact = true;
    k.feed([{ key: 'right', type: 'press' }], 0);
    k.tick(10);
    expect(k.down('right')).toBe(true);
    k.feed([{ key: 'right', type: 'release' }], 10.1);
    expect(k.down('right')).toBe(false);
  });
});

describe('layout', () => {
  it('uses the sharpest scale that fits', () => {
    expect(computeLayout(160, 58)).toMatchObject({ s: 2, cropTop: 0, tooSmall: false });
    expect(computeLayout(100, 40).s).toBe(3);
    expect(computeLayout(80, 24).s).toBeGreaterThanOrEqual(4);
    expect(computeLayout(30, 10).tooSmall).toBe(true);
  });
});

describe('terminal app', () => {
  it('plays 1-1 headless and renders text and pixels', () => {
    const keys = new KeyState();
    const layout = computeLayout(160, 58);
    const app = new TerminalApp(keys, emptySave(), () => {}, layout, { legacyInput: true, level: '1-1' });
    const buf = new CellBuffer(layout.cols, layout.rows);
    for (let i = 0; i < 200; i++) app.update(1 / 60);
    expect(app.scene).toBe('play');
    const x0 = app.world!.player.x;
    for (let i = 0; i < 90; i++) {
      keys.feed([{ key: 'right', type: 'press' }], i / 60);
      keys.tick(i / 60);
      app.update(1 / 60);
      keys.endStep();
    }
    expect(app.world!.player.x).toBeGreaterThan(x0 + 40);
    app.render(buf);
    const text = buf.ch.slice(0, buf.cols).join('');
    expect(text).toContain('Clawd');
    expect(text).toContain('Hello, World');
    expect(buf.ch.filter((c) => c === '▀').length).toBeGreaterThan(500);
  });

  it('opens the permission prompt as a terminal panel', () => {
    const keys = new KeyState();
    const layout = computeLayout(120, 40);
    const app = new TerminalApp(keys, emptySave(), () => {}, layout, { legacyInput: false, level: '1-1' });
    for (let i = 0; i < 200; i++) app.update(1 / 60);
    const w = app.world!;
    w.player.x = 96 * 16;
    w.player.prevX = w.player.x;
    for (let i = 0; i < 60 && !app.panel; i++) {
      keys.feed([{ key: 'right', type: 'press' }], i / 60);
      app.update(1 / 60);
      keys.endStep();
    }
    expect(app.panel?.title).toBe('Bash command');
    const buf = new CellBuffer(layout.cols, layout.rows);
    app.render(buf);
    expect(buf.ch.join('')).toContain('Do you want to proceed?');
    keys.feed([{ key: '1', type: 'press' }], 2);
    app.update(1 / 60);
    expect(app.panel).toBeNull();
  });
});
