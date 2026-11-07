import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prefetch } from './prefetch.js';

afterEach(() => vi.useRealTimers());
describe('DESKTOP-US-307 空闲静态预取', () => {
  it('空闲五百毫秒后才准备静态资源，交互推迟开始，相同完整版本不重复准备', async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => undefined);
    const prefetch = new Prefetch(run, () => undefined, new AbortController().signal);
    prefetch.start([{ id: 'editor', key: 'one' }]);
    await vi.advanceTimersByTimeAsync(400);
    prefetch.activity();
    await vi.advanceTimersByTimeAsync(400);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    expect(prefetch.statuses.get('editor')?.state).toBe('ready');
    prefetch.start([{ id: 'editor', key: 'one' }]);
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(1);
    prefetch.stop();
  });
  it('取消和实例销毁会停止排队及运行任务，更新后可准备新版本', async () => {
    vi.useFakeTimers();
    const lifetime = new AbortController();
    const signals: AbortSignal[] = [];
    const run = vi.fn((_item: { id: string; key: string }, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      );
    });
    const prefetch = new Prefetch(run, () => undefined, lifetime.signal);
    prefetch.start([{ id: 'editor', key: 'one' }]);
    prefetch.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(run).not.toHaveBeenCalled();
    prefetch.start([{ id: 'editor', key: 'one' }]);
    await vi.advanceTimersByTimeAsync(500);
    prefetch.cancel('editor');
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    prefetch.start([{ id: 'editor', key: 'two' }]);
    await vi.advanceTimersByTimeAsync(500);
    expect(run).toHaveBeenCalledTimes(2);
    lifetime.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(signals[1].aborted).toBe(true);
    expect(prefetch.enabled).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
