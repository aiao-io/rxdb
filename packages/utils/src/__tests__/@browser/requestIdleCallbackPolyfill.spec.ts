import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestIdleCallbackPolyfill } from '../../@browser/requestIdleCallbackPolyfill.js';

describe('requestIdleCallbackPolyfill', () => {
  const originalRequest = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;

  afterEach(() => {
    window.requestIdleCallback = originalRequest;
    window.cancelIdleCallback = originalCancel;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps native implementations when already present', () => {
    const nativeRequest = vi.fn();
    const nativeCancel = vi.fn();
    window.requestIdleCallback = nativeRequest as unknown as typeof window.requestIdleCallback;
    window.cancelIdleCallback = nativeCancel as unknown as typeof window.cancelIdleCallback;

    requestIdleCallbackPolyfill();

    expect(window.requestIdleCallback).toBe(nativeRequest);
    expect(window.cancelIdleCallback).toBe(nativeCancel);
  });

  it('installs setTimeout-based fallbacks when APIs are missing', () => {
    // @ts-expect-error intentional polyfill setup
    delete window.requestIdleCallback;
    // @ts-expect-error intentional polyfill setup
    delete window.cancelIdleCallback;
    vi.useFakeTimers();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);

    requestIdleCallbackPolyfill();

    const callback = vi.fn();
    const id = window.requestIdleCallback(callback);
    expect(id).toBeDefined();

    nowSpy.mockReturnValue(1_020);
    vi.runAllTimers();

    expect(callback).toHaveBeenCalledTimes(1);
    const deadline = callback.mock.calls[0]?.[0] as IdleDeadline;
    expect(deadline.didTimeout).toBe(false);
    expect(deadline.timeRemaining()).toBe(30);

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    window.cancelIdleCallback(id);
    expect(clearSpy).toHaveBeenCalledWith(id);
  });
});
