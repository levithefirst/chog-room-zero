// CHOG-DES-001 camera lead: no snap at spawn, no whip on aim flicks, little jitter from noisy touch aim, and a
// steady lead that converges. Units: world u; at 844x390 ppu ~= 35 px/u.
import { describe, expect, it } from 'vitest';
import { createCamera, leadTarget, stepCamera } from '../src/render/camera';
import { TUNING } from '../src/config/tuning';

const DT = 1 / 60, PPU = 35;
// The P1F model, kept for before/after numbers: target = player + facing * 2, one 0.12 s smoothing.
function oldModel() {
  const c = { x: 0, y: 0 };
  return { c, step(px: number, py: number, f: number) { const k = 1 - Math.exp(-DT / 0.12); c.x += (px + Math.cos(f) * 2 - c.x) * k; c.y += (py + Math.sin(f) * 2 - c.y) * k; } };
}
function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export function metrics(stepper: (px: number, py: number, f: number) => { x: number; y: number }) {
  // 1) spawn: offset after 0.1 s of aiming east from a fresh start
  let c = { x: 0, y: 0 };
  for (let i = 0; i < 6; i++) c = stepper(0, 0, 0);
  const spawnPx = Math.hypot(c.x, c.y) * PPU;
  // settle, then 2) flick 180 deg: max camera speed (px/frame) in the next 0.5 s
  for (let i = 0; i < 120; i++) c = stepper(0, 0, 0);
  let prev = { ...c }, maxStep = 0;
  for (let i = 0; i < 30; i++) { c = stepper(0, 0, Math.PI); maxStep = Math.max(maxStep, Math.hypot(c.x - prev.x, c.y - prev.y) * PPU); prev = { ...c }; }
  // 3) noisy touch aim: +-6 deg uniform jitter around east for 2 s: camera position std (px)
  for (let i = 0; i < 120; i++) c = stepper(0, 0, 0);
  const r = lcg(7), xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < 120; i++) { c = stepper(0, 0, (r() * 2 - 1) * 6 * Math.PI / 180); xs.push(c.x); ys.push(c.y); }
  const sd = (a: number[]) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
  const jitterPx = Math.hypot(sd(xs), sd(ys)) * PPU;
  // 4) steady lead after 2 s aiming east
  for (let i = 0; i < 120; i++) c = stepper(0, 0, 0);
  const steadyPx = Math.hypot(c.x, c.y) * PPU;
  return { spawnPx, maxStep, jitterPx, steadyPx };
}
export const OLD = (() => { const m = oldModel(); return metrics((px, py, f) => { m.step(px, py, f); return m.c; }); })();
export const NEW = (() => { const cam = createCamera(0, 0); return metrics((px, py, f) => { stepCamera(cam, px, py, leadTarget(f, TUNING.render), DT, TUNING.render); return cam; }); })();

describe('DES-001 camera lead', () => {
  it('no snap at spawn: < 10 px offset after 0.1 s (old model: ~' + OLD.spawnPx.toFixed(0) + ' px)', () => {
    expect(NEW.spawnPx).toBeLessThan(10);
  });
  it('a 180 deg aim flick moves the camera < 4 px per frame (old: ' + OLD.maxStep.toFixed(1) + ')', () => {
    expect(NEW.maxStep).toBeLessThan(4);
  });
  it('noisy touch aim (+-6 deg) jitters the camera < 0.5 px std (old: ' + OLD.jitterPx.toFixed(2) + ')', () => {
    expect(NEW.jitterPx).toBeLessThan(0.5);
  });
  it('steady aim still leads by lookahead (u) within 5%', () => {
    expect(Math.abs(NEW.steadyPx / PPU - TUNING.render.lookahead)).toBeLessThan(0.05 * TUNING.render.lookahead);
  });
  it('never overshoots the lead target (monotone approach on a flick)', () => {
    const cam = createCamera(0, 0);
    for (let i = 0; i < 240; i++) stepCamera(cam, 0, 0, leadTarget(0, TUNING.render), DT, TUNING.render);
    let minX = Infinity;
    for (let i = 0; i < 240; i++) { stepCamera(cam, 0, 0, leadTarget(Math.PI, TUNING.render), DT, TUNING.render); minX = Math.min(minX, cam.x); }
    expect(minX).toBeGreaterThanOrEqual(-TUNING.render.lookahead - 1e-6);
  });
});
