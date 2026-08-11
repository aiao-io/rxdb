import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResettableTimer } from './resettable-timer';

describe('ResettableTimer', () => {
  afterEach(() => vi.useRealTimers());

  it('replaces the previous callback when rescheduled', async () => {
    vi.useFakeTimers();
    const timer = new ResettableTimer();
    const first = vi.fn();
    const second = vi.fn();

    timer.schedule(first, 10);
    timer.schedule(second, 10);
    await vi.advanceTimersByTimeAsync(10);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('cancels the pending callback when cleared', async () => {
    vi.useFakeTimers();
    const timer = new ResettableTimer();
    const callback = vi.fn();

    timer.schedule(callback, 10);
    timer.clear();
    await vi.advanceTimersByTimeAsync(10);

    expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
