// CHOG-HUD-002: pickup labels never sit under HUD panels (screen-space rects, safe areas included by the DOM).
import { describe, expect, it } from 'vitest';
import { placeLabel, type Rect } from '../src/render/labels';

// 844x390 phone HUD, CSS px (vitals top-left, hostiles top-centre, buttons top-right, weapon bottom-centre).
const HUD: Rect[] = [
  { x: 14, y: 10, w: 178, h: 98 },
  { x: 345, y: 10, w: 154, h: 34 },
  { x: 740, y: 10, w: 90, h: 44 },
  { x: 290, y: 330, w: 160, h: 50 },
];
const LW = 60, LH = 14, GAP = 15;

describe('HUD-002 pickup label placement', () => {
  it('a pickup at the top-left (under the vitals panel) does not get a label under the panel', () => {
    const r = placeLabel(100, 80, LW, LH, GAP, HUD);
    if (r.visible) for (const h of HUD) expect(overlap({ x: 100 - LW / 2, y: r.y, w: LW, h: LH }, h)).toBe(false);
  });
  it('flips above when below would hit the weapon panel', () => {
    const r = placeLabel(370, 310, LW, LH, GAP, HUD);
    expect(r.visible).toBe(true);
    expect(r.y).toBeLessThan(310);
  });
  it('stays below in the open (default)', () => {
    expect(placeLabel(500, 200, LW, LH, GAP, HUD)).toEqual({ y: 200 + GAP, visible: true });
  });
  it('hides the text (icon stays) when both slots are covered', () => {
    const r = placeLabel(100, 55, LW, LH, GAP, HUD);
    expect(r.visible).toBe(false);
  });
});
function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

import { stackLabels } from '../src/render/labels';
describe('debug overlay label stacking', () => {
  it('two bots at the same spot get labels that do not overlap', () => {
    const ys = stackLabels([{ x: 5, y: 5 }, { x: 5.1, y: 5.05 }], 2.2, 0.6);
    expect(Math.abs(ys[0] - ys[1])).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });
  it('labels far apart are not moved', () => {
    expect(stackLabels([{ x: 0, y: 5 }, { x: 9, y: 5 }], 2.2, 0.6)).toEqual([5, 5]);
  });
  it('three in a pile stack into three rows', () => {
    const ys = stackLabels([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }], 2.2, 0.6).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(0.6 - 1e-9);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });
});
