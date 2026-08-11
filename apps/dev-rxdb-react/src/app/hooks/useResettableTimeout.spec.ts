import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoDismissedState, useResettableTimeout } from './useResettableTimeout';

describe('useResettableTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('replaces a pending timeout', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useResettableTimeout());

    act(() => result.current.schedule(first, 3000));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.schedule(second, 3000));
    act(() => vi.advanceTimersByTime(2000));

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1000));
    expect(second).toHaveBeenCalledOnce();
  });

  it('cancels a pending timeout on unmount', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useResettableTimeout());

    act(() => result.current.schedule(callback, 3000));
    unmount();
    act(() => vi.runAllTimers());

    expect(callback).not.toHaveBeenCalled();
  });

  it('cancels a pending timeout explicitly', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useResettableTimeout());

    act(() => result.current.schedule(callback, 3000));
    act(() => result.current.cancel());
    act(() => vi.runAllTimers());

    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useAutoDismissedState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('新消息会替换旧消息的自动关闭计时', () => {
    const { result } = renderHook(() => useAutoDismissedState<string>(3000));

    act(() => result.current.show('first'));
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.show('second'));
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.value).toBe('second');

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.value).toBeNull();
  });

  it('卸载后不再执行状态更新', () => {
    const { result, unmount } = renderHook(() => useAutoDismissedState<string>(3000));

    act(() => result.current.show('message'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
