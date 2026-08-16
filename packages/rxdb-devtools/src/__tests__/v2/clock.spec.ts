import { describe, expect, it, vi } from 'vitest';

import { createFakeClock } from '../../testing/fake-clock.js';
import { createSystemClock } from '../../v2/clock.js';

describe('createSystemClock', () => {
  it('MUST delegate now() to the host clock', () => {
    const before = Date.now();
    const now = createSystemClock().now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(Number.isSafeInteger(now)).toBe(true);
  });

  it('MUST fire the handler after the delay and stop firing once cancelled', () => {
    vi.useFakeTimers();
    try {
      const clock = createSystemClock();
      const fired = vi.fn();
      const cancelled = vi.fn();

      clock.setTimeout(fired, 1_000);
      const cancel = clock.setTimeout(cancelled, 1_000);
      cancel();

      vi.advanceTimersByTime(1_000);

      expect(fired).toHaveBeenCalledTimes(1);
      expect(cancelled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('MUST tolerate cancelling twice and cancelling after the handler ran', () => {
    vi.useFakeTimers();
    try {
      const clock = createSystemClock();
      const cancel = clock.setTimeout(() => undefined, 10);

      vi.advanceTimersByTime(10);

      expect(() => {
        cancel();
        cancel();
      }).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createFakeClock', () => {
  it('MUST start at the requested time and advance deterministically', () => {
    const clock = createFakeClock(1_000);

    expect(clock.now()).toBe(1_000);
    clock.advance(250);
    expect(clock.now()).toBe(1_250);
  });

  it('MUST fire due timers in due order, then by registration order on ties', () => {
    const clock = createFakeClock();
    const order: string[] = [];

    clock.setTimeout(() => order.push('late'), 20);
    clock.setTimeout(() => order.push('tie-a'), 10);
    clock.setTimeout(() => order.push('tie-b'), 10);

    clock.advance(20);

    expect(order).toEqual(['tie-a', 'tie-b', 'late']);
  });

  it('MUST expose the virtual time at which each handler was due, not the window end', () => {
    const clock = createFakeClock();
    const seen: number[] = [];

    clock.setTimeout(() => seen.push(clock.now()), 10);
    clock.setTimeout(() => seen.push(clock.now()), 30);

    clock.advance(100);

    expect(seen).toEqual([10, 30]);
    expect(clock.now()).toBe(100);
  });

  it('MUST fire timers registered during advancement when they fall inside the same window', () => {
    const clock = createFakeClock();
    const order: string[] = [];

    clock.setTimeout(() => {
      order.push('outer');
      clock.setTimeout(() => order.push('inner'), 5);
    }, 10);

    clock.advance(20);

    expect(order).toEqual(['outer', 'inner']);
  });

  it('MUST NOT fire timers registered during advancement that fall past the window', () => {
    const clock = createFakeClock();
    const order: string[] = [];

    clock.setTimeout(() => {
      order.push('outer');
      clock.setTimeout(() => order.push('inner'), 100);
    }, 10);

    clock.advance(20);

    expect(order).toEqual(['outer']);
    expect(clock.pendingTimers()).toBe(1);
  });

  it('MUST NOT fire a cancelled timer and MUST drop it from the pending count', () => {
    const clock = createFakeClock();
    const handler = vi.fn();

    const cancel = clock.setTimeout(handler, 10);
    expect(clock.pendingTimers()).toBe(1);

    cancel();
    expect(clock.pendingTimers()).toBe(0);

    clock.advance(50);
    expect(handler).not.toHaveBeenCalled();
  });

  it('MUST treat cancel as idempotent after the handler has run', () => {
    const clock = createFakeClock();
    const cancel = clock.setTimeout(() => undefined, 10);

    clock.advance(10);

    expect(() => {
      cancel();
      cancel();
    }).not.toThrow();
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST fire a zero-delay timer on the next advance', () => {
    const clock = createFakeClock();
    const handler = vi.fn();

    clock.setTimeout(handler, 0);
    clock.advance(0);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('MUST reject non-safe-integer or negative delays and advances', () => {
    const clock = createFakeClock();

    expect(() => clock.setTimeout(() => undefined, -1)).toThrow(RangeError);
    expect(() => clock.setTimeout(() => undefined, 1.5)).toThrow(RangeError);
    expect(() => clock.setTimeout(() => undefined, Number.NaN)).toThrow(RangeError);
    expect(() => clock.setTimeout(() => undefined, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => clock.advance(-1)).toThrow(RangeError);
    expect(() => clock.advance(Number.NaN)).toThrow(RangeError);
  });
});
