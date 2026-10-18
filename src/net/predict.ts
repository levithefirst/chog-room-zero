// SB own-movement prediction for online play. Your operator moves the frame you push the stick, by the same movement
// rule the server runs (world.ts moveBody), instead of a round trip later. Each snapshot says the newest input the
// server had (ack) and how many steps it has applied it (as): start from the server's position, replay what it has not
// applied yet, and blend any difference out over ~0.1 s so a correction never jumps. The server still decides
// everything: this only draws you where you are about to be. Pure (no sockets): tests/sb-predict.test.ts.
import { TUNING } from '../config/tuning';
import { downedInput, moveBody, type Actor, type ActorInput } from '../sim/world';
import type { Level } from '../sim/level';

const STEP = TUNING.simStepSeconds;

/** The part of an actor prediction moves (the rest comes from the server as is). */
export type Body = Pick<Actor, 'x' | 'y' | 'vx' | 'vy' | 'hero' | 'slowLeft' | 'slowMul' | 'dashLeft' | 'dashX' | 'dashY' | 'downed'>
  // CHOG superpowers on you (absent: none): beam slow, Bubble cage, Drool glue.
  & Partial<Pick<Actor, 'chargeLeft' | 'beamLeft' | 'trapLeft' | 'trapX' | 'trapY' | 'trapR' | 'pinLeft' | 'pinX' | 'pinY'>>;

export class Predictor {
  /** Inputs sent and not yet fully applied by the server, with how many steps each has been held here. */
  private pend: { seq: number; inp: ActorInput; steps: number }[] = [];
  private body: Body | null = null;
  private acc = 0;
  /** Visual offset left by the last correction, blended to 0. */
  offX = 0;
  offY = 0;
  /** Size of the last correction (u): how far the server disagreed. */
  lastError = 0;
  /** Corrections this session, and how many were too big to blend (snapped). */
  corrections = 0;
  snaps = 0;

  get active(): boolean { return this.body !== null; }

  /** A new input went to the server: it is the one held from now on. */
  sent(seq: number, inp: ActorInput): void {
    this.pend.push({ seq, inp: { ...inp }, steps: 0 });
    if (this.pend.length > 240) this.pend.shift();
  }

  /** Advance your own body by the input currently held, in fixed sim steps. */
  advance(level: Level, dt: number): void {
    const b = this.body, cur = this.pend[this.pend.length - 1];
    const k = Math.exp(-dt / TUNING.net.correctSeconds);
    this.offX *= k;
    this.offY *= k;
    if (!b || !cur) return;
    this.acc = Math.min(this.acc + dt, STEP * 6);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      moveBody(level, b as Actor, b.downed ? downedInput(cur.inp) : cur.inp, STEP);
      cur.steps++;
    }
  }

  /**
   * The server's state of you at a snapshot: start there, replay the inputs it has not applied (the acked one's
   * remaining steps, then every later one), and keep the drawn position continuous (the difference becomes an offset).
   */
  reconcile(level: Level, server: Body, ack: number, appliedSteps: number): void {
    const b: Body = { ...server, dashLeft: 0 };
    this.pend = this.pend.filter((e) => e.seq >= ack);
    for (const e of this.pend) {
      const n = e.seq === ack ? Math.max(0, e.steps - appliedSteps) : e.steps;
      for (let i = 0; i < n; i++) moveBody(level, b as Actor, b.downed ? downedInput(e.inp) : e.inp, STEP);
    }
    if (this.body) {
      const dx = this.body.x + this.offX - b.x, dy = this.body.y + this.offY - b.y;
      this.lastError = Math.hypot(this.body.x - b.x, this.body.y - b.y);
      this.corrections++;
      if (Math.hypot(dx, dy) > TUNING.net.snapDistance) { this.offX = this.offY = 0; this.snaps++; }
      else { this.offX = dx; this.offY = dy; }
    }
    this.body = b;
  }

  /** Where to draw you now (predicted body plus the fading correction), or null before the first reconcile. */
  drawn(): { x: number; y: number; vx: number; vy: number } | null {
    const b = this.body;
    return b ? { x: b.x + this.offX, y: b.y + this.offY, vx: b.vx, vy: b.vy } : null;
  }

  /** Out of the match, dead, or a fresh match: forget everything. */
  reset(): void {
    this.pend = [];
    this.body = null;
    this.acc = 0;
    this.offX = this.offY = 0;
  }
}
