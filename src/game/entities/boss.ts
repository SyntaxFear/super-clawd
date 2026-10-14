import { drawText, measure } from '../../engine/font';
import * as BossArt from '../../art/boss';
import { moveBody } from '../physics';
import type { Player } from '../player';
import type { World } from '../world';
import { Entity } from './base';

const QUIPS = [
  'Did you mean: give up?',
  '// TODO: defeat Clawd',
  'Tab to accept',
  'Suggestion rejected?!',
  'lgtm',
  '// FIXME',
  'I was trained on this',
];

const GHOSTS = ['undefined', 'any', 'TODO', 'null', 'NaN', 'eval()', '!important', '// works?', 'sudo', 'lgtm'];

/** Gray "ghost text" autocomplete that rains down during the fight. */
export class GhostText extends Entity {
  text: string;
  landed = false;
  life = 1.3;
  enemy = true;
  harmful = true;
  stompable = false;
  name = 'a bad autocomplete';

  constructor(x: number, y: number, text: string) {
    super(x, y);
    this.text = text;
    this.w = measure(text) + 2;
    this.h = 9;
    this.x = x - this.w / 2;
    this.vy = 70;
  }

  knock(w: World): void {
    this.dead = true;
    w.fx.puff(this.cx, this.cy, '#9aa0a6');
  }

  update(w: World, dt: number): void {
    if (this.landed) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
      return;
    }
    this.vy = Math.min(this.vy + 320 * dt, 170);
    this.vx = 0;
    const r = moveBody(this, w.map, dt);
    if (r.hitBottom) this.landed = true;
    if (this.y > w.map.h * 16) this.dead = true;
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    const a = this.landed ? Math.min(1, this.life / 0.4) : 1;
    const x = Math.round(this.x + 1 - camX);
    const y = Math.round(this.y + 1);
    g.globalAlpha = 0.85 * a;
    g.fillStyle = w.dark ? '#2a2630' : '#e8e2da';
    g.fillRect(x - 2, y - 1, this.w + 2, this.h + 1);
    g.globalAlpha = 1;
    drawText(g, this.text, x, y, '#9aa0a6', { alpha: a });
  }
}

type BossState = 'enter' | 'hover' | 'telegraph' | 'dive' | 'dash' | 'stunned' | 'rise' | 'dying';

/** World 1 boss: a cartoon autopilot with goggles that autocompletes you to death. */
export class Copilot extends Entity {
  name = 'Copilot';
  enemy = true;
  killable = false;
  slowable = true;
  hp = 6;
  maxHp = 6;
  state: BossState = 'enter';
  st = 0;
  hurtT = 0;
  spawnT = 0.8;
  drops = 0;
  dashes = 0;
  dir: 1 | -1 = -1;
  t = 0;
  homeY = 54;
  targetX = 0;
  quip = '// TODO: defeat Clawd';
  quipT = 3;
  spin = 0;
  readonly x0: number;
  readonly x1: number;
  readonly floorY: number;

  constructor(x0: number, x1: number, floorY: number) {
    super(x1 - 70, -60);
    this.x0 = x0;
    this.x1 = x1;
    this.floorY = floorY;
    this.w = 40;
    this.h = 30;
    this.alwaysActive = true;
  }

  get phase2(): boolean {
    return this.hp <= 3;
  }

  get vulnerable(): boolean {
    return this.state !== 'enter' && this.state !== 'dying' && this.hurtT <= 0;
  }

  private say(text: string, time = 2): void {
    this.quip = text;
    this.quipT = time;
  }

  update(w: World, dt: number): void {
    this.t += dt;
    this.st += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.quipT = Math.max(0, this.quipT - dt);
    this.stompable = this.vulnerable;
    this.harmful = this.state !== 'stunned' && this.state !== 'dying' && this.state !== 'enter';
    const p = w.player;
    const mid = (this.x0 + this.x1) / 2;
    const half = (this.x1 - this.x0) / 2 - 44;

    switch (this.state) {
      case 'enter':
        this.y += (this.homeY - this.y) * Math.min(1, dt * 2.2);
        this.x += (mid + 40 - this.cx) * Math.min(1, dt * 1.5);
        if (this.st > 2.2) this.go('hover');
        break;
      case 'hover': {
        const tx = mid + Math.sin(this.t * (this.phase2 ? 1.25 : 0.85)) * half - this.w / 2;
        this.x += (tx - this.x) * Math.min(1, dt * 2.4);
        this.y = this.homeY + Math.sin(this.t * 3) * 4;
        this.spawnT -= dt;
        if (this.spawnT <= 0) {
          this.drop(w);
          this.spawnT = this.phase2 ? 1.05 : 1.45;
          this.drops++;
        }
        if (this.drops >= (this.phase2 ? 4 : 3) && this.spawnT > 0.4) {
          this.drops = 0;
          this.go('telegraph');
          this.say('⇥ Tab', 1);
          w.sfx('beep');
        }
        break;
      }
      case 'telegraph':
        if (this.st > (this.phase2 ? 0.55 : 0.8)) {
          this.targetX = Math.max(this.x0 + 20, Math.min(this.x1 - 20 - this.w, p.cx - this.w / 2));
          this.dir = p.cx < this.cx ? -1 : 1;
          this.go('dive');
        }
        break;
      case 'dive': {
        this.y += (this.phase2 ? 330 : 260) * dt;
        this.x += (this.targetX - this.x) * Math.min(1, dt * 4);
        if (this.y + this.h >= this.floorY) {
          this.y = this.floorY - this.h;
          this.dashes = 0;
          this.dir = p.cx < this.cx ? -1 : 1;
          this.go('dash');
          w.shake(2, 0.15);
          w.sfx('thud');
        }
        break;
      }
      case 'dash': {
        this.x += this.dir * (this.phase2 ? 300 : 235) * dt;
        const left = this.x0 + 16;
        const right = this.x1 - 16 - this.w;
        if (this.x <= left || this.x >= right) {
          this.x = Math.max(left, Math.min(right, this.x));
          this.dashes++;
          w.shake(3, 0.2);
          w.sfx('thud');
          if (this.phase2 && this.dashes < 2) {
            this.dir = this.dir > 0 ? -1 : 1;
          } else {
            this.go('stunned');
            this.say('Thinking…', this.phase2 ? 1.2 : 1.7);
          }
        }
        break;
      }
      case 'stunned':
        if (this.st > (this.phase2 ? 1.25 : 1.75)) this.go('rise');
        break;
      case 'rise':
        this.y -= 130 * dt;
        if (this.y <= this.homeY) {
          this.y = this.homeY;
          this.spawnT = 0.6;
          this.go('hover');
        }
        break;
      case 'dying':
        this.vy += 380 * dt;
        this.y += this.vy * dt;
        this.spin += dt * 9;
        if (Math.floor(this.st * 12) !== Math.floor((this.st - dt) * 12)) w.fx.glyphs(this.cx, this.cy, GHOSTS.join(''), '#9aa0a6', 2);
        if (this.y > w.map.h * 16 + 60) {
          this.dead = true;
          w.bossDefeated();
        }
        break;
    }
  }

  private go(s: BossState): void {
    this.state = s;
    this.st = 0;
  }

  private drop(w: World): void {
    const n = this.phase2 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - 1) * 56;
      const text = GHOSTS[Math.floor(w.rng.next() * GHOSTS.length)];
      const x = Math.max(this.x0 + 30, Math.min(this.x1 - 30, this.cx + off));
      w.spawn(new GhostText(x, this.y + this.h, text));
    }
    w.sfx('agent');
  }

  hit(w: World, by: 'stomp' | 'agent'): void {
    if (!this.vulnerable) return;
    this.hp -= 1;
    this.hurtT = by === 'stomp' ? 1.1 : 0.8;
    w.sfx('bossHit');
    w.shake(3, 0.25);
    w.addScore(by === 'stomp' ? 1000 : 500, this.cx, this.y);
    if (this.hp <= 0) {
      this.state = 'dying';
      this.st = 0;
      this.vy = -220;
      this.harmful = false;
      this.stompable = false;
      this.say('Copilot has stopped responding', 4);
      w.bossDying(this);
      return;
    }
    if (this.hp === 3) this.say('Switching to a bigger model…', 2.2);
    else this.say(QUIPS[Math.floor(w.rng.next() * QUIPS.length)], 1.6);
    if (this.state === 'stunned' || this.state === 'dash') this.go('rise');
  }

  onStomp(w: World, p: Player): void {
    this.hit(w, 'stomp');
    w.bounceOff(p, true);
  }

  draw(g: CanvasRenderingContext2D, camX: number, w: World): void {
    const blink = this.hurtT > 0 && Math.floor(this.hurtT * 20) % 2 === 0;
    const img = BossArt.copilot(this.phase2, Math.floor(this.t * 10) % 2, this.state === 'stunned');
    const x = Math.round(this.cx - img.width / 2 - camX);
    const y = Math.round(this.y + this.h - img.height + 4);
    if (!blink) {
      if (this.state === 'dying') {
        g.save();
        g.translate(x + img.width / 2, y + img.height / 2);
        g.rotate(this.spin);
        g.drawImage(img, -img.width / 2, -img.height / 2);
        g.restore();
      } else {
        const shake = this.state === 'telegraph' ? (Math.floor(this.st * 30) % 2 ? 1 : -1) : 0;
        g.drawImage(img, x + shake, y);
      }
    }
    if (this.state === 'stunned') {
      const frame = Math.floor(this.t * 10) % 4;
      for (let i = 0; i < 3; i++) {
        const a = this.t * 4 + (i * Math.PI * 2) / 3;
        drawText(
          g,
          '✻',
          Math.round(this.cx - camX + Math.cos(a) * 14 - 2),
          Math.round(this.y - 8 + Math.sin(a) * 3),
          ['#d97757', '#f2b84b', '#ffffff', '#f2b84b'][(frame + i) % 4],
        );
      }
    }
    if (this.quipT > 0 && w.pixelText) {
      const tw = measure(this.quip);
      const bx = Math.round(Math.max(this.x0 + 4 - camX, Math.min(this.x1 - 8 - tw - camX, this.cx - camX - tw / 2)));
      const by = Math.max(32, Math.round(this.y - 20));
      g.fillStyle = '#1f1b18';
      g.fillRect(bx - 3, by - 2, tw + 6, 11);
      g.fillStyle = '#d97757';
      g.fillRect(bx - 3, by + 9, tw + 6, 1);
      drawText(g, this.quip, bx, by, '#ede6dd');
    }
  }
}
