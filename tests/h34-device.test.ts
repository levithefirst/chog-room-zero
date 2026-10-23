// H34 device capability layer: the form factor comes from what the device can do and its screen, not its name.
import { describe, expect, it } from 'vitest';
import { deviceProfile } from '../src/ui/device';

const mm = (on: string[]) => (q: string) => ({ matches: on.includes(q) });

describe('device profile (capabilities, not user agent)', () => {
  it('a phone: coarse pointer, no hover, small screen', () => {
    expect(deviceProfile(390, 844, mm(['(pointer: coarse)', '(any-pointer: coarse)']), 5)).toMatchObject({ coarse: true, hover: false, form: 'phone' });
    expect(deviceProfile(844, 390, mm(['(pointer: coarse)']), 5).form).toBe('phone');
  });
  it('a tablet: touch, no hover, a mid screen; a desktop: fine pointer and hover', () => {
    expect(deviceProfile(1024, 768, mm(['(pointer: coarse)']), 5).form).toBe('tablet');
    expect(deviceProfile(1440, 900, mm(['(pointer: fine)', '(hover: hover)', '(any-pointer: fine)']), 0)).toMatchObject({ fine: true, hover: true, form: 'desktop' });
  });
  it('a touch laptop with a trackpad is a desktop (it hovers); a small desktop window is not a phone unless the screen is small', () => {
    expect(deviceProfile(1366, 768, mm(['(pointer: fine)', '(hover: hover)', '(any-pointer: coarse)']), 10).form).toBe('desktop');
    expect(deviceProfile(1920, 1080, mm(['(pointer: fine)', '(hover: hover)']), 0).form).toBe('desktop');
  });
  it('no media queries at all (old browser, tests): a desktop by its screen', () => {
    expect(deviceProfile(1280, 720, null).form).toBe('desktop');
  });
});
