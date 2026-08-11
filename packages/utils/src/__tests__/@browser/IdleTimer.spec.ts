import { filter } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { IdleTimer } from '../../@browser/IdleTimer.js';

describe('IdleTimer', () => {
  it('should true', () => {
    return new Promise<void>(done => {
      const timer = new IdleTimer({ timeout: 1000 });
      timer.start();
      timer.idle$.pipe(filter(d => !!d)).subscribe(() => {
        done();
      });
    });
  });

  it('should idle$ emit true after default timeout', () => {
    vi.useFakeTimers();
    const timer = new IdleTimer();
    let idleState: boolean | undefined;
    timer.idle$.subscribe(v => (idleState = v));
    timer.start();
    vi.advanceTimersByTime(2000);
    expect(idleState).toBe(true);
    vi.useRealTimers();
  });

  it('should only emit idle$ true once after multiple starts', () => {
    vi.useFakeTimers();
    const timer = new IdleTimer({ timeout: 100 });
    let idleCount = 0;
    timer.idle$.pipe(filter(Boolean)).subscribe(() => idleCount++);
    timer.start();
    timer.start();
    vi.advanceTimersByTime(100);
    expect(idleCount).toBe(1);
    vi.useRealTimers();
  });

  it('should set idle$ to false on document event', () => {
    vi.useFakeTimers();
    const timer = new IdleTimer({ timeout: 50 });
    let idleState: boolean | undefined;
    timer.idle$.subscribe(v => (idleState = v));
    timer.start();
    vi.advanceTimersByTime(100);
    expect(idleState).toBe(true);
    document.dispatchEvent(new Event('mousemove'));
    vi.advanceTimersByTime(10);
    expect(idleState).toBe(false);
    vi.useRealTimers();
  });

  it('should not trigger idle after timer cleared', async () => {
    vi.useFakeTimers();
    const timer = new IdleTimer({ timeout: 100 });
    timer.start();
    // 立即重新 start，清理上一个 timer
    timer.start();
    // 不 advance 时间，idle$ 不应变 true
    let idleState = false;
    timer.idle$.subscribe(v => (idleState = v));
    vi.advanceTimersByTime(50);
    expect(idleState).toBe(false);
    vi.useRealTimers();
  });

  it('should not bind duplicate listeners across repeated starts and should clean them up on stop', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const timer = new IdleTimer({ timeout: 100 });

    timer.start();
    const boundListenerCount = addEventListenerSpy.mock.calls.length;

    timer.start();
    expect(addEventListenerSpy.mock.calls.length).toBe(boundListenerCount);

    timer.stop();
    expect(removeEventListenerSpy.mock.calls.length).toBe(boundListenerCount);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  // UTL-010：destroy() 只做 stop()+complete()，既不置位也不幂等。
  // destroy 后再 start()，事件会被重新绑上、setTimeout 照常跑，
  // 但 #idleSub 已 complete —— next() 是 no-op，于是留下一个永远不发射的僵尸计时器与一组永不摘除的监听器。
  it('destroy 后不得复活：start/stop 必须 fail-fast，且 destroy 幂等', () => {
    const timer = new IdleTimer();
    timer.destroy();

    expect(() => timer.destroy()).not.toThrow();
    expect(() => timer.start()).toThrow(/destroy/i);
    expect(() => timer.stop()).toThrow(/destroy/i);
  });

  // UTL-010：`options?.timeout || this.#timeout` 把合法的 0 当成「没传」，回退成 2000。
  it('timeout: 0 是合法值，不得回退到默认值', () => {
    vi.useFakeTimers();
    try {
      const timer = new IdleTimer({ timeout: 0 });
      const seen: boolean[] = [];
      timer.idle$.subscribe(v => seen.push(v));
      timer.start();
      vi.advanceTimersByTime(1);
      expect(seen).toContain(true);
      timer.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('非法 timeout 必须抛错而不是静默回退', () => {
    expect(() => new IdleTimer({ timeout: -1 })).toThrow(/timeout/i);
    expect(() => new IdleTimer({ timeout: 1.5 })).toThrow(/timeout/i);
    expect(() => new IdleTimer({ timeout: Number.NaN })).toThrow(/timeout/i);
  });
});
