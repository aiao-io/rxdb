import { describe, expect, it } from 'vitest';
import { performChunk } from '../../@browser/perform-chunk.js';

describe('performChunk', () => {
  it('should true', () => {
    // `configurable: true` 是必须的：原实现没写，于是这条用例会把 window 上的
    // requestIdleCallback 钉成不可重定义，**后面任何想换 stub 的用例都会报
    // `Cannot redefine property`** —— 一条用例污染整个文件。
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: (fn: IdleRequestCallback) => {
        fn({ didTimeout: false, timeRemaining: () => 10 } as unknown as IdleDeadline);
      }
    });

    return new Promise<void>(done => {
      performChunk([1, 2, 3], data => {
        if (data === 3) {
          done();
        }
      });
    });
  });
});

describe('performChunk —— 零预算与 didTimeout（UTL-003）', () => {
  const stubIdle = (
    frames: { didTimeout: boolean; timeRemaining: () => number }[],
    onSchedule?: () => void
  ): (() => void) => {
    const original = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback');
    let call = 0;
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: (fn: IdleRequestCallback) => {
        onSchedule?.();
        const frame = frames[Math.min(call, frames.length - 1)];
        call += 1;
        // 同步回调，避免测试依赖真实空闲时机
        fn(frame as unknown as IdleDeadline);
        return call;
      }
    });
    return () => {
      if (original) Object.defineProperty(window, 'requestIdleCallback', original);
    };
  };

  /**
   * UTL-003：循环条件是 `idle.timeRemaining() > 0 && i < array.length`，
   * **全文没有读过 `didTimeout`**。
   *
   * 浏览器在 `{ timeout: 100 }` 到期时会以 `didTimeout: true` + `timeRemaining() === 0`
   * 回调 —— 那正是「主线程一直很忙、必须强制推进」的信号。
   * 而当前实现在这一帧**一项都不消费**，直接 `_run()` 重排下一帧；
   * 只要繁忙状态持续，它就一直空转。
   *
   * 文件顶部的注释还写着「显式 timeout 保证最坏情况下的响应上限」——
   * **实现与它自己的注释相反**。
   */
  it('零预算 + didTimeout 时必须至少消费一项，而不是空转重排', () => {
    const consumed: number[] = [];
    let scheduled = 0;
    const restore = stubIdle([{ didTimeout: true, timeRemaining: () => 0 }], () => {
      scheduled += 1;
    });
    try {
      performChunk([1, 2, 3], item => consumed.push(item));
    } finally {
      restore();
    }

    expect(consumed).toEqual([1, 2, 3]);
    // 每帧至少推进一项：3 项最多 3 次调度 + 1 次收尾判断
    expect(scheduled).toBeLessThanOrEqual(4);
  });

  it('预算充足时仍然一帧跑完', () => {
    const consumed: number[] = [];
    const restore = stubIdle([{ didTimeout: false, timeRemaining: () => 10 }]);
    try {
      performChunk([1, 2, 3], item => consumed.push(item));
    } finally {
      restore();
    }

    expect(consumed).toEqual([1, 2, 3]);
  });

  it('consumer 抛错时不再继续调度，并把错误交给调用方', async () => {
    const restore = stubIdle([{ didTimeout: false, timeRemaining: () => 10 }]);
    try {
      const handle = performChunk([1, 2, 3], item => {
        if (item === 2) throw new Error('boom');
      });
      await expect(handle.done).rejects.toThrow('boom');
    } finally {
      restore();
    }
  });

  it('cancel() 之后不再消费剩余项', async () => {
    const consumed: number[] = [];
    // 这条用例必须**手动驱动帧**：上面的 stubIdle 是同步回调，
    // 整个数组会在 performChunk 返回前就跑完，cancel 根本没有插进去的时机。
    const frames: IdleRequestCallback[] = [];
    const original = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback');
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      writable: true,
      value: (fn: IdleRequestCallback) => {
        frames.push(fn);
        return frames.length;
      }
    });

    try {
      const handle = performChunk([1, 2, 3, 4], item => consumed.push(item));
      // 跑一帧：零预算 → 只消费一项
      frames.shift()?.({ didTimeout: true, timeRemaining: () => 0 } as unknown as IdleDeadline);
      expect(consumed).toEqual([1]);

      handle.cancel();
      // 再驱动剩下的帧，不应再消费
      while (frames.length > 0) {
        frames.shift()?.({ didTimeout: true, timeRemaining: () => 0 } as unknown as IdleDeadline);
      }

      expect(consumed).toEqual([1]);
      await expect(handle.done).resolves.toBeUndefined();
    } finally {
      if (original) Object.defineProperty(window, 'requestIdleCallback', original);
    }
  });
});
