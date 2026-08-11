import { describe, expect, it, vi } from 'vitest';
import { listen } from './event-listener';

describe('listen', () => {
  it('stops forwarding events after cleanup', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const cleanup = listen(target, 'scroll', listener);

    target.dispatchEvent(new Event('scroll'));
    cleanup();
    target.dispatchEvent(new Event('scroll'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('allows cleanup to be called repeatedly', () => {
    const target = new EventTarget();
    const cleanup = listen(target, 'scroll', vi.fn());

    expect(() => {
      cleanup();
      cleanup();
    }).not.toThrow();
  });
});
