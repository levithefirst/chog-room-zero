// Procedural sound: every sound is synthesised with WebAudio (no files). One small palette of timbres:
// dry filtered noise for mechanics and feet, a low sine thump for weight. No bleeps.
// Positional: pan by direction, volume by distance within the event's radius, muffled through walls.
import type { SoundType } from '../sim/world';

export interface Audio {
  unlock(): void;
  play(type: SoundType, dx: number, dy: number, radius: number, muffled: boolean, own: boolean): void;
  muted: boolean;
}

// Simultaneous voice cap; extra sounds are dropped (lowest priority first is approximated by arrival).
const MAX_VOICES = 24;

export function createAudio(): Audio {
  let ctx: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let voices = 0;

  const a: Audio = {
    muted: false,
    unlock() {
      if (!ctx) {
        ctx = new AudioContext({ latencyHint: 'interactive' });
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
    play(type, dx, dy, radius, muffled, own) {
      if (!ctx || !noise || a.muted || ctx.state !== 'running' || voices >= MAX_VOICES) return;
      const dist = Math.hypot(dx, dy);
      if (!own && dist > radius) return;
      const t = ctx.currentTime;
      let gain = own ? 1 : Math.pow(1 - dist / radius, 1.3);
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
      tail.connect(pan).connect(ctx.destination);
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
        case 'shot': // dry crack plus a short body: who fired is told by pan and volume
          burst(0, 0.09, 'bandpass', 1400, 0.8, 0.9);
          burst(0, 0.03, 'highpass', 4000, 0.5, 0.5);
          thump(0, 0.12, 110, 45, 0.7);
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
      setTimeout(() => voices--, len * 1000 + 50);
    },
  };
  return a;
}
