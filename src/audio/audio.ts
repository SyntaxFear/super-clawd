import { noteFreq, tracks, type Channel, type NoteEvt, type Track, type TrackId, type Wave } from './music';

const N = (n: string) => noteFreq(n);

function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
    imag[k] = (2 * Math.sin(Math.PI * k * duty) ** 2) / (k * Math.PI);
  }
  return ctx.createPeriodicWave(real, imag);
}

class Sequencer {
  private timer: ReturnType<typeof setInterval>;
  private next: number;
  private step = 0;
  private readonly stepDur: number;
  private readonly byStep = new Map<number, { ch: Channel; n: NoteEvt }[]>();
  private readonly out: GainNode;
  stopped = false;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private track: Track,
    tempo: number,
    private sys: AudioSys,
  ) {
    this.stepDur = 60 / (track.bpm * tempo) / 4;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(dest);
    for (const ch of track.channels)
      for (const n of ch.notes) {
        const list = this.byStep.get(n.step) ?? [];
        list.push({ ch, n });
        this.byStep.set(n.step, list);
      }
    this.next = ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  private tick(): void {
    if (this.stopped) return;
    while (this.next < this.ctx.currentTime + 0.15) {
      if (this.step >= this.track.steps) {
        if (!this.track.loop) {
          this.finish();
          return;
        }
        this.step = 0;
      }
      for (const { ch, n } of this.byStep.get(this.step) ?? []) this.play(ch, n, this.next);
      this.next += this.stepDur;
      this.step++;
    }
  }

  private play(ch: Channel, n: NoteEvt, t: number): void {
    const dur = n.len * this.stepDur;
    if (ch.wave === 'noise') {
      this.sys.drum(n.drum ?? 'h', t, ch.vol, this.out);
      return;
    }
    const osc = this.ctx.createOscillator();
    if (ch.wave === 'tri') osc.type = 'triangle';
    else osc.setPeriodicWave(this.sys.wave(ch.wave));
    osc.frequency.value = n.freq;
    const g = this.ctx.createGain();
    const end = t + Math.max(0.03, dur * 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ch.vol, t + 0.006);
    g.gain.setValueAtTime(ch.vol * (ch.wave === 'tri' ? 1 : 0.85), Math.max(t + 0.007, end - 0.025));
    g.gain.linearRampToValueAtTime(0, end);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(end + 0.02);
  }

  private finish(): void {
    this.stopped = true;
    clearInterval(this.timer);
  }

  stop(): void {
    this.finish();
    const now = this.ctx.currentTime;
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.04);
    setTimeout(() => this.out.disconnect(), 200);
  }
}

/**
 * WebAudio chiptune synth. Created lazily on the first user gesture (browsers require it).
 * When disabled (?mute=1, used for automated testing) no AudioContext is ever created.
 */
export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private waves = new Map<Wave, PeriodicWave>();
  private noiseBuf: AudioBuffer | null = null;
  private seq: Sequencer | null = null;
  private want: { id: TrackId; fast: boolean } | null = null;
  muted: boolean;
  readonly disabled: boolean;

  constructor(opts: { disabled: boolean; muted: boolean }) {
    this.disabled = opts.disabled;
    this.muted = opts.muted;
  }

  unlock(): void {
    if (this.disabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = 0.75;
      this.musicBus.connect(this.master);
      this.waves.set('p12', pulseWave(ctx, 0.125));
      this.waves.set('p25', pulseWave(ctx, 0.25));
      this.waves.set('p50', pulseWave(ctx, 0.5));
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      let s = 1;
      for (let i = 0; i < len; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 2147483647) * 2 - 1;
      }
      if (this.want) this.startTrack(this.want.id, this.want.fast);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready(): boolean {
    return !!this.ctx;
  }

  wave(w: Wave): PeriodicWave {
    return this.waves.get(w)!;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  music(id: TrackId | null, opts: { fast?: boolean } = {}): void {
    const fast = !!opts.fast;
    if (id === null) {
      this.want = null;
      this.seq?.stop();
      this.seq = null;
      return;
    }
    if (this.want && this.want.id === id && this.want.fast === fast && this.seq && !this.seq.stopped) return;
    this.want = { id, fast };
    this.startTrack(id, fast);
  }

  private startTrack(id: TrackId, fast: boolean): void {
    this.seq?.stop();
    this.seq = null;
    if (!this.ctx || !this.musicBus) return;
    this.seq = new Sequencer(this.ctx, this.musicBus, tracks()[id], fast ? 1.28 : 1, this);
  }

  drum(kind: 'k' | 's' | 'h', t: number, vol: number, dest: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const dur = kind === 'k' ? 0.12 : kind === 's' ? 0.12 : 0.035;
    f.type = kind === 'k' ? 'lowpass' : kind === 's' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 'k' ? 200 : kind === 's' ? 1800 : 7000;
    g.gain.setValueAtTime(vol * (kind === 'k' ? 2.2 : 1), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
    if (kind === 'k') {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      const og = ctx.createGain();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      og.gain.setValueAtTime(vol * 3, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(og).connect(dest);
      o.start(t);
      o.stop(t + 0.13);
    }
  }

  private tone(f0: number, f1: number, dur: number, wave: Wave, vol: number, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    if (wave === 'tri') o.type = 'triangle';
    else o.setPeriodicWave(this.wave(wave === 'noise' ? 'p50' : wave));
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, when = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private arp(notes: string[], step: number, wave: Wave, vol: number): void {
    notes.forEach((n, i) => {
      if (n === 'r') return;
      const f = N(n);
      this.tone(f, f, step * (i === notes.length - 1 ? 2.5 : 1.1), wave, vol, i * step);
    });
  }

  sfx(name: string): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':
        return this.tone(280, 600, 0.13, 'p25', 0.14);
      case 'jumpBig':
        return this.tone(200, 440, 0.16, 'p25', 0.15);
      case 'token':
        this.tone(N('C6'), N('C6'), 0.05, 'p50', 0.1);
        return this.tone(N('G6'), N('G6'), 0.22, 'p50', 0.1, 0.05);
      case 'stomp':
        this.tone(520, 130, 0.11, 'p50', 0.16);
        return this.noise(0.06, 0.08, 'lowpass', 1500);
      case 'bump':
        return this.tone(190, 90, 0.09, 'tri', 0.4);
      case 'break':
        this.noise(0.28, 0.25, 'lowpass', 1800);
        return this.tone(320, 70, 0.18, 'p50', 0.09);
      case 'powerAppear':
        return this.arp(['G4', 'B4', 'D5', 'G5', 'B5', 'D6'], 0.04, 'p25', 0.1);
      case 'powerUp':
        return this.arp(['C5', 'G4', 'C5', 'E5', 'G5', 'E5', 'C6', 'G5', 'C6', 'E6'], 0.035, 'p25', 0.11);
      case 'oneUp':
        return this.arp(['E5', 'G5', 'E6', 'C6', 'D6', 'G6'], 0.08, 'p25', 0.12);
      case 'shrink':
        return this.arp(['A5', 'E5', 'C5', 'A4', 'E4'], 0.06, 'p25', 0.11);
      case 'hurt':
        this.tone(440, 150, 0.25, 'p12', 0.15);
        return this.noise(0.12, 0.08, 'bandpass', 1200);
      case 'kick':
        return this.tone(900, 300, 0.05, 'p50', 0.13);
      case 'agent':
        return this.tone(700, 1400, 0.07, 'p12', 0.11);
      case 'flag':
        return this.tone(1300, 220, 0.95, 'p50', 0.1);
      case 'pause':
        return this.arp(['E5', 'C5', 'E5', 'C5'], 0.06, 'p25', 0.1);
      case 'beep':
        this.tone(880, 880, 0.06, 'p50', 0.08);
        return this.tone(880, 880, 0.06, 'p50', 0.08, 0.1);
      case 'bossHit':
        this.noise(0.3, 0.25, 'lowpass', 900);
        return this.tone(240, 50, 0.35, 'p50', 0.15);
      case 'warning':
        for (let i = 0; i < 3; i++) this.tone(N('C6'), N('C6'), 0.08, 'p50', 0.1, i * 0.15);
        return;
      case 'thud':
        this.noise(0.3, 0.3, 'lowpass', 350);
        return this.tone(110, 35, 0.3, 'tri', 0.5);
      case 'tick':
        return this.tone(1700, 1700, 0.025, 'p50', 0.05);
      case 'checkpoint':
        return this.arp(['C5', 'E5', 'G5', 'C6'], 0.06, 'p25', 0.11);
      case 'gate':
        this.arp(['G4', 'C5', 'E5', 'G5'], 0.05, 'p25', 0.1);
        return this.noise(0.4, 0.06, 'highpass', 3000);
      case 'select':
        return this.tone(1300, 1300, 0.03, 'p50', 0.06);
      case 'pipe':
        for (let i = 0; i < 3; i++) this.tone(260, 90, 0.09, 'p50', 0.1, i * 0.1);
        return;
      default:
        return;
    }
  }
}
