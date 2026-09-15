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
import { ReachabilityMonitor, type ReachabilityOptions } from '../../network/reachability.js';

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

  describe('浏览器 online / offline 事件（要先 watch()）', () => {
    /**
     * 造一台带观察窗的监视器。
     *
     * @remarks
     * `listeners` 是「往宿主上挂了什么」的观察窗，`addEventListener` / `removeEventListener`
     * 的调用次数则用来分辨「挂了一次」和「挂了两次」—— 只看 Map 的大小，重复注册会被
     * 同键覆盖掉，正是引用计数最容易错的那一处。
     */
    const withListeners = (options: ReachabilityOptions = {}) => {
      const listeners = new Map<string, () => void>();
      const add = vi.fn((type: string, listener: () => void) => listeners.set(type, listener));
      const remove = vi.fn((type: string) => listeners.delete(type));
      monitor = new ReachabilityMonitor({ addEventListener: add, removeEventListener: remove, ...options });
      return { listeners, add, remove };
    };

    // US-025 D2：没有订阅者的时候，构造一个 `RxDB` 不该在宿主上留下任何东西。
    // 核心自己不消费这两个事件 —— 消费者是 `@aiao/rxdb-plugin-sync` 的同步监听器。
    it('不 watch() 就不挂监听：构造本身对宿主零副作用', () => {
      const { listeners, add } = withListeners();

      expect(add).not.toHaveBeenCalled();
      expect(listeners.size).toBe(0);
    });

    it('offline 事件直接判离线', () => {
      const { listeners } = withListeners();
      monitor.watch();

      listeners.get('offline')?.();
      expect(monitor.online).toBe(false);
    });

    // navigator 的 online 只说明「网卡有链路」，不说明后端可达 ——
    // 所以它只催一次尝试，不直接置为在线。
    it('online 事件发一次节拍但不置为在线', () => {
      const { listeners } = withListeners();
      monitor.watch();
      const ticks: number[] = [];
      monitor.wakeup$.subscribe(() => ticks.push(1));

      listeners.get('offline')?.();
      ticks.length = 0;

      listeners.get('online')?.();
      expect(ticks).toHaveLength(1);
      expect(monitor.online).toBe(false);
    });

    it('destroy 摘掉事件监听', () => {
      const { listeners } = withListeners();
      monitor.watch();

      expect(listeners.size).toBe(2);
      monitor.destroy();
      expect(listeners.size).toBe(0);
    });

    describe('watch() 引用计数', () => {
      it('第一位订阅者挂上，后来的不重复挂', () => {
        const { listeners, add } = withListeners();

        monitor.watch();
        monitor.watch();

        expect(add).toHaveBeenCalledTimes(2); // online + offline，各一次
        expect(listeners.size).toBe(2);
      });

      it('最后一位撤走才摘掉', () => {
        const { listeners } = withListeners();
        const first = monitor.watch();
        const second = monitor.watch();

        first();
        expect(listeners.size).toBe(2);

        second();
        expect(listeners.size).toBe(0);
      });

      // 插件作用域可能既 release 又 destroy，撤销必须幂等 —— 否则计数被同一个句柄减两次，
      // 另一位还在听的订阅者就被连坐摘掉了。
      it('同一个句柄重复撤销只算一次', () => {
        const { listeners } = withListeners();
        const first = monitor.watch();
        monitor.watch();

        first();
        first();
        expect(listeners.size).toBe(2);
      });

      // 挂监听的时机晚于构造（插件装在 `connect()` 里），这中间网络可能已经断了。
      it('watch() 时重读一次 navigator.onLine', () => {
        let online = true;
        withListeners({ navigatorOnLine: () => online });
        expect(monitor.online).toBe(true);

        online = false;
        monitor.watch();
        expect(monitor.online).toBe(false);
      });

      it('destroy() 之后 watch() 是空操作', () => {
        const { listeners, add } = withListeners();
        monitor.destroy();
        add.mockClear();

        const release = monitor.watch();
        expect(add).not.toHaveBeenCalled();
        expect(listeners.size).toBe(0);
        expect(() => release()).not.toThrow();
      });
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
