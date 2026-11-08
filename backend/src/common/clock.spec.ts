import { FixedClock, SystemClock } from './clock.js';

describe('Clock', () => {
  it('SystemClock tells the real time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('FixedClock stands still until moved', () => {
    const clock = new FixedClock('2026-11-09T10:00:00.000Z');
    clock.now().setFullYear(2000);

    expect(clock.now().toISOString()).toBe('2026-11-09T10:00:00.000Z');
    clock.advance(24 * 60 * 60 * 1000);
    expect(clock.now().toISOString()).toBe('2026-11-10T10:00:00.000Z');
    clock.set('2026-12-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });
});
