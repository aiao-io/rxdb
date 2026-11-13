import { afterEach, describe, expect, it, vi } from 'vitest';

import { whenIdle } from './idle';

describe('whenIdle：空闲时执行', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('浏览器有 requestIdleCallback 时交给它，并带上超时上限', () => {
    const request = vi.fn<(task: () => void, options: { timeout: number }) => number>(() => 1);
    vi.stubGlobal('requestIdleCallback', request);
    const task = vi.fn();
    whenIdle(task, 2600);
    expect(request).toHaveBeenCalledExactlyOnceWith(task, { timeout: 2600 });
    expect(task).not.toHaveBeenCalled();
  });

  it('没有 requestIdleCallback（Safari 18.4 之前）时退到定时器，任务照样执行一次', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const task = vi.fn();
    whenIdle(task, 2600);
    expect(task).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
