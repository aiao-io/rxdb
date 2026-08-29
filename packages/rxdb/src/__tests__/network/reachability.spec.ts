/**
 * @fileoverview 可达性监视器测试
 *
 * @remarks
 * 这里检验的核心不变量是「`online$` 只在**看到证据**时翻转」：
 * 成功的远端调用是在线的证据，`isNetworkError` 命中的失败是离线的证据，
 * 除此之外（4xx / 业务错误 / 退避节拍）一律不动状态。
 */

import { firstValueFrom, toArray } from 'rxjs';
import { take } from 'rxjs/operators';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkOfflineError } from '../../RxDBError.js';
import { ReachabilityMonitor } from '../../network/reachability.js';

const networkError = (): Error => Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });

describe('ReachabilityMonitor', () => {
  let monitor: ReachabilityMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    monitor?.destroy();
    vi.useRealTimers();
  });

  describe('初始状态', () => {
    it('没有任何证据时判为在线', () => {
      monitor = new ReachabilityMonitor();
      expect(monitor.online).toBe(true);
    });

    // navigator.onLine === false 是可信的「一定离线」信号；=== true 不可信为「在线」。
    it('navigator.onLine === false 时以离线开局', () => {
      monitor = new ReachabilityMonitor({ navigatorOnLine: () => false });
      expect(monitor.online).toBe(false);
    });
  });

  describe('report', () => {
    it('网络错误判离线', () => {
      monitor = new ReachabilityMonitor();
      monitor.report(networkError());
      expect(monitor.online).toBe(false);
    });

    it('NetworkOfflineError 判离线', () => {
      monitor = new ReachabilityMonitor();
      monitor.report(new NetworkOfflineError(new Error('offline')));
      expect(monitor.online).toBe(false);
    });

    it('成功判在线', () => {
      monitor = new ReachabilityMonitor();
      monitor.report(networkError());
      monitor.report(null);
      expect(monitor.online).toBe(true);
    });

    // 拿到 HTTP 状态码说明连接是通的 —— 401 / 422 / 503 都是远端给的回答。
    it('业务错误不动状态', () => {
      monitor = new ReachabilityMonitor();
      monitor.report(Object.assign(new Error('unauthorized'), { status: 401 }));
      expect(monitor.online).toBe(true);

      monitor.report(networkError());
      monitor.report(Object.assign(new Error('unprocessable'), { status: 422 }));
      expect(monitor.online).toBe(false);
    });

    it('online$ 去重，不重复播报同一状态', async () => {
      monitor = new ReachabilityMonitor();
      const seen = firstValueFrom(monitor.online$.pipe(take(3), toArray()));

      monitor.report(networkError());
      monitor.report(networkError());
      monitor.report(null);
      monitor.report(null);

      expect(await seen).toEqual([true, false, true]);
    });
  });

  describe('wakeup$ 退避节拍', () => {
    it('在线时不发节拍', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 8000 });
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      vi.advanceTimersByTime(60_000);
      expect(ticks).toHaveLength(0);
    });

    it('离线后按 base * 2^(n-1) 退避发节拍', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 8000 });
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      monitor.report(networkError());

      vi.advanceTimersByTime(999);
      expect(ticks).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(ticks).toHaveLength(1); // 1000ms

      vi.advanceTimersByTime(2000);
      expect(ticks).toHaveLength(2); // +2000ms

      vi.advanceTimersByTime(4000);
      expect(ticks).toHaveLength(3); // +4000ms
    });

    it('退避封顶在 maxDelayMs', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 2000 });
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      monitor.report(networkError());
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(2000);
      vi.advanceTimersByTime(2000);
      expect(ticks).toHaveLength(4);
    });

    // 节拍本身不是在线证据：驱动方拿它去试一次真实同步，成功了才 report(null)。
    it('节拍不改变 online 状态', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 8000 });
      monitor.wakeup$.subscribe();

      monitor.report(networkError());
      vi.advanceTimersByTime(10_000);
      expect(monitor.online).toBe(false);
    });

    it('恢复在线后停止发节拍，且退避重新从 base 起算', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 8000 });
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      monitor.report(networkError());
      vi.advanceTimersByTime(1000);
      vi.advanceTimersByTime(2000);
      expect(ticks).toHaveLength(2);

      monitor.report(null);
      vi.advanceTimersByTime(60_000);
      expect(ticks).toHaveLength(2);

      // 再次离线：退避从 base 重新起算，而不是接着上次的指数
      monitor.report(networkError());
      vi.advanceTimersByTime(1000);
      expect(ticks).toHaveLength(3);
    });
  });

  describe('浏览器 online / offline 事件', () => {
    it('offline 事件直接判离线', () => {
      const listeners = new Map<string, () => void>();
      monitor = new ReachabilityMonitor({
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: type => listeners.delete(type)
      });

      listeners.get('offline')?.();
      expect(monitor.online).toBe(false);
    });

    // navigator 的 online 只说明「网卡有链路」，不说明后端可达 ——
    // 所以它只催一次尝试，不直接置为在线。
    it('online 事件发一次节拍但不置为在线', () => {
      const listeners = new Map<string, () => void>();
      const ticks: number[] = [];
      monitor = new ReachabilityMonitor({
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: type => listeners.delete(type)
      });
      monitor.wakeup$.subscribe(() => ticks.push(1));

      listeners.get('offline')?.();
      ticks.length = 0;

      listeners.get('online')?.();
      expect(ticks).toHaveLength(1);
      expect(monitor.online).toBe(false);
    });

    it('destroy 摘掉事件监听', () => {
      const listeners = new Map<string, () => void>();
      monitor = new ReachabilityMonitor({
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: type => listeners.delete(type)
      });

      expect(listeners.size).toBe(2);
      monitor.destroy();
      expect(listeners.size).toBe(0);
    });
  });

  describe('destroy', () => {
    it('停止发节拍', () => {
      monitor = new ReachabilityMonitor({ baseDelayMs: 1000, maxDelayMs: 8000 });
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      monitor.report(networkError());
      monitor.destroy();
      vi.advanceTimersByTime(60_000);
      expect(ticks).toHaveLength(0);
    });
  });
});
