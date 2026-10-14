// Procedural sound: every sound is synthesised with WebAudio (no files). One small palette of timbres:
// dry filtered noise for mechanics and feet, a low sine thump for weight. No bleeps.
// Positional: pan by direction, volume by distance within the event's radius, muffled through walls.
import type { SoundType } from '../sim/world';

export type CueType = SoundType | 'hurt' | 'ui' | 'blocked';

export interface Audio {
  unlock(): void;
  /** sig: a 1:1's metadata id, which layers that Chog's own voice over the ability cue. */
  play(type: CueType, dx: number, dy: number, radius: number, muffled: boolean, own: boolean, weapon?: string, sig?: number): void;
  muted: boolean;
  /** Master volume 0..1 (Settings, RC-7). Applied to the sum before the limiter. */
  volume: number;
}

// Mix: per-cue level so guns sit on top, feet under, UI quiet.
// RC-1: the blocked-shot knock sits under gunshots (it fires on every cover hit, often several per burst).
const MIX: Partial<Record<CueType, number>> = { step: 0.8, quietStep: 0.8, shot: 0.9, pickup: 0.7, ui: 0.4, hurt: 0.9, blocked: 0.6 };
const MUTE_KEY = 'chog.muted';

// Simultaneous voice cap; extra sounds are dropped (lowest priority first is approximated by arrival).
const MAX_VOICES = 24;

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;
  // Master limiter (RC-1): up to 24 voices can stack in a firefight; a compressor keeps the sum from clipping.
  let master: AudioNode | null = null;
  let level: GainNode | null = null;
  let volume = 1;

  let muted = false;
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    /* storage blocked: default unmuted */
  }
  const a: Audio = {
    get muted() {
      return muted;
    },
    set muted(v: boolean) {
      muted = v;
      try {
        localStorage.setItem(MUTE_KEY, v ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    get volume() {
      return volume;
    },
    set volume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      if (level && ctx) level.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },
    unlock() {
      if (!ctx) {
        ctx = new AudioContext({ latencyHint: 'interactive' });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.15;
        comp.connect(ctx.destination);
        level = ctx.createGain();
        level.gain.value = volume;
        level.connect(comp);
        master = level;
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        // Fixed LCG so the noise texture is the same every session.
        let s = 12345;
        for (let i = 0; i < d.length; i++) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (s / 0x3fffffff) - 1;
        }
      }
      if (ctx.state === 'suspended') void ctx.resume();
    },
    play(type, dx, dy, radius, muffled, own, weapon, sig) {
      if (!ctx || !noise || a.muted || ctx.state !== 'running' || voices >= MAX_VOICES) return;
      const dist = Math.hypot(dx, dy);
      if (!own && dist > radius) return;
      const t = ctx.currentTime;
      let gain = (own ? 1 : Math.pow(1 - dist / radius, 1.3)) * (MIX[type] ?? 1) * 0.8;
      if (muffled) gain *= 0.6;
      if (gain < 0.02) return;

      const out = ctx.createGain();
      out.gain.value = gain;
      const pan = ctx.createStereoPanner();
      pan.pan.value = own ? 0 : Math.max(-0.9, Math.min(0.9, dx / 8));
      let tail: AudioNode = out;
      if (muffled) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        out.connect(lp);
        tail = lp;
      }
      tail.connect(pan).connect(master ?? ctx.destination);
      voices++;
      const c = ctx;
      const nb = noise;

      const burst = (start: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number) => {
        const src = c.createBufferSource();
        src.buffer = nb;
        src.playbackRate.value = 0.7 + ((start * 1000) % 7) / 10;
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = c.createGain();
        g.gain.setValueAtTime(vol, t + start);
        g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        src.connect(f).connect(g).connect(out);
        src.start(t + start, Math.random() * 0.5, dur + 0.02);
      };
      const thump = (start: number, dur: number, f0: number, f1: number, vol: number) => {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, t + start);
        o.frequency.exponentialRampToValueAtTime(f1, t + start + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(vol, t + start);
        g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        o.connect(g).connect(out);
        o.start(t + start);
        o.stop(t + start + dur + 0.02);
      };

      let len = 0.2;
      switch (type) {
        case 'shot': // each gun has its own voice, so you know what is shooting from the dark
          if (weapon === 'shotgun') {
            burst(0, 0.22, 'lowpass', 900, 0.7, 1);
            burst(0, 0.05, 'bandpass', 1800, 0.6, 0.6);
            thump(0, 0.2, 90, 35, 0.9);
            burst(0.32, 0.03, 'bandpass', 1500, 3, 0.35);
            burst(0.42, 0.04, 'bandpass', 1100, 3, 0.35);
            len = 0.5;
          } else if (weapon === 'marksman') {
            burst(0, 0.05, 'highpass', 3500, 0.6, 0.8);
            burst(0, 0.35, 'bandpass', 700, 0.5, 0.55);
            thump(0, 0.18, 160, 40, 0.8);
            len = 0.45;
          } else if (weapon === 'smg') {
            burst(0, 0.045, 'bandpass', 2200, 1.1, 0.6);
            thump(0, 0.05, 140, 70, 0.35);
            len = 0.08;
          } else {
            burst(0, 0.09, 'bandpass', 1400, 0.8, 0.85);
            burst(0, 0.03, 'highpass', 4000, 0.5, 0.45);
            thump(0, 0.12, 110, 45, 0.65);
          }
          break;
        case 'pickup': // a latch and a soft rustle
          burst(0, 0.02, 'bandpass', 2600, 5, 0.5);
          burst(0.04, 0.12, 'bandpass', 900, 1.2, 0.35);
          len = 0.2;
          break;
        case 'dash': // short air sweep
          burst(0, 0.16, 'bandpass', 1200, 0.9, 0.45);
          burst(0.02, 0.1, 'highpass', 3000, 0.5, 0.2);
          break;
        case 'sonar': // a low ping with a long ring: it carries, so everyone knows
          thump(0, 0.6, 620, 560, 0.35);
          thump(0, 0.9, 310, 300, 0.25);
          len = 0.95;
          break;
        case 'barrier': // a heavy slab set down
          thump(0, 0.25, 80, 40, 0.9);
          burst(0, 0.12, 'lowpass', 600, 0.8, 0.6);
          len = 0.3;
          break;
        case 'mend': // a breath of filtered noise rising
          burst(0, 0.35, 'bandpass', 600, 1.5, 0.3);
          burst(0.15, 0.3, 'bandpass', 1200, 1.5, 0.25);
          len = 0.5;
          break;
        // 1:1 signatures: each has its own sound, loud enough that the other side can react.
        case 'windup': // a rising hiss: a burst is coming, get out of its ring
          burst(0, 0.5, 'bandpass', 700, 0.6, 0.4);
          thump(0, 0.5, 90, 220, 0.4);
          len = 0.55;
          break;
        case 'burst': // the burst going off
          thump(0, 0.35, 70, 30, 1);
          burst(0, 0.25, 'lowpass', 1200, 0.7, 0.8);
          len = 0.4;
          break;
        case 'scream': // a harsh wail
          thump(0, 0.5, 900, 420, 0.45);
          burst(0, 0.4, 'bandpass', 1800, 2, 0.35);
          len = 0.55;
          break;
        case 'shield': // a bright bell
          thump(0, 0.6, 1320, 1300, 0.3);
          thump(0, 0.6, 1980, 1960, 0.15);
          len = 0.65;
          break;
        case 'frenzy': // a low growl
          thump(0, 0.4, 70, 110, 0.6);
          burst(0, 0.3, 'lowpass', 500, 1.2, 0.4);
          len = 0.45;
          break;
        case 'downed': // a teammate or foe is down, not out: a falling two-note call that says "rescue me"
          thump(0, 0.25, 520, 380, 0.5);
          thump(0.28, 0.4, 380, 260, 0.5);
          len = 0.7;
          break;
        case 'revive': // back up: the same two notes rising
          thump(0, 0.2, 380, 400, 0.45);
          thump(0.22, 0.3, 520, 560, 0.45);
          len = 0.55;
          break;
        case 'hurt': // you were hit: close, low, unmistakable
          thump(0, 0.16, 120, 55, 0.9);
          burst(0, 0.1, 'lowpass', 420, 1, 0.7);
          break;
        case 'ui':
          burst(0, 0.02, 'bandpass', 1800, 3, 0.4);
          len = 0.05;
          break;
        case 'step': // run: brighter heel strike
          burst(0, 0.05, 'bandpass', 900, 1.2, 0.35);
          len = 0.08;
          break;
        case 'quietStep': // creep: softer, darker, shorter
          burst(0, 0.03, 'lowpass', 380, 0.7, 0.18);
          len = 0.06;
          break;
        case 'impact': // bullet into concrete: grit
          burst(0, 0.06, 'highpass', 2500, 0.7, 0.4);
          len = 0.1;
          break;
        case 'blocked': // bullet stopped by half cover: a hollow knock + clank, distinct from concrete grit
          thump(0, 0.07, 420, 240, 0.55);
          burst(0, 0.05, 'bandpass', 1300, 6, 0.45);
          len = 0.12;
          break;
        case 'hit': // into a body: low and dull, clearly not concrete
          burst(0, 0.08, 'lowpass', 500, 1, 0.7);
          thump(0, 0.1, 180, 70, 0.6);
          break;
        case 'death': // long falling tone and a drop
          thump(0, 0.45, 260, 50, 0.6);
          burst(0.05, 0.25, 'lowpass', 300, 0.8, 0.5);
          len = 0.55;
          break;
        case 'reload': // two mechanical clicks
          burst(0, 0.02, 'bandpass', 3200, 4, 0.5);
          burst(0.22, 0.025, 'bandpass', 2400, 4, 0.5);
          len = 0.3;
          break;
      }
      // Each 1:1 has its own voice on top of its ability cue, so you know WHICH legend just acted before you see it.
      if (sig) {
        switch (sig) {
          case 53: for (let i = 0; i < 4; i++) burst(i * 0.07, 0.05, 'highpass', 3000 + i * 400, 0.8, 0.4); thump(0, 0.3, 200, 600, 0.3); break; // Blaze: crackle
          case 392: thump(0, 1, 55, 38, 0.9); burst(0, 0.8, 'lowpass', 260, 0.7, 0.6); break; // Burning Skully: deep roar
          case 434: thump(0, 0.7, 1400, 700, 0.4); thump(0.05, 0.6, 1750, 900, 0.2); break; // Chog Scream: shriek
          case 494: thump(0, 0.2, 60, 35, 1); thump(0.22, 0.25, 55, 30, 1); break; // Chogbomination: double slam
          case 973: thump(0, 0.09, 190, 120, 0.6); thump(0.12, 0.12, 170, 100, 0.6); break; // Frogger: croak
          case 1006: thump(0, 1.4, 220, 218, 0.45); thump(0, 1.2, 440, 437, 0.2); break; // Grim: toll
          case 1159: for (const f of [523, 659, 784]) thump(0, 0.9, f, f, 0.18); break; // Halo: choir chord
          case 1290: burst(0, 0.06, 'bandpass', 2600, 8, 0.7); thump(0, 0.3, 300, 180, 0.5); break; // Krown: plate clank
          case 1373: for (const [i, f] of [2637, 3136, 3520].entries()) thump(i * 0.06, 0.35, f, f, 0.14); break; // Midas: coin shimmer
          case 1376: thump(0, 0.6, 90, 55, 0.8); burst(0, 0.5, 'lowpass', 300, 1.5, 0.5); break; // Redd: growl
        }
        len = Math.max(len, 1.4);
      }
      setTimeout(() => voices--, len * 1000 + 50);
    },
  };
  return a;
}
