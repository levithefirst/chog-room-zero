import { describe, expect, it } from 'vitest';
import { keysToMove } from '../src/input/input';

const m = (...codes: string[]) => keysToMove(new Set(codes));

describe('keysToMove', () => {
  it('no keys -> zero vector', () => expect(m()).toEqual({ x: 0, y: 0 }));
  it('maps WASD to cardinal directions (+y down)', () => {
    expect(m('KeyW')).toEqual({ x: 0, y: -1 });
    expect(m('KeyS')).toEqual({ x: 0, y: 1 });
    expect(m('KeyA')).toEqual({ x: -1, y: 0 });
    expect(m('KeyD')).toEqual({ x: 1, y: 0 });
  });
  it('opposite keys cancel to 0', () => {
    expect(m('KeyA', 'KeyD')).toEqual({ x: 0, y: 0 });
    expect(m('KeyW', 'KeyS')).toEqual({ x: 0, y: 0 });
    expect(m('KeyW', 'KeyS', 'KeyD')).toEqual({ x: 1, y: 0 });
  });
  it('diagonals are unit length', () => {
    const v = m('KeyW', 'KeyD');
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
    expect(v.x).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });
  it('ignores unrelated keys', () => expect(m('ArrowUp', 'Space')).toEqual({ x: 0, y: 0 }));
});
