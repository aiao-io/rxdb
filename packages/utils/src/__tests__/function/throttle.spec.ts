import { describe, expect, it, vi } from 'vitest';
import { sleep } from '../../async/sleep.js';
import { throttle } from '../../function/throttle.js';

describe('throttle', () => {
  it('should throttle function calls', async () => {
    const func = vi.fn();
    const throttledFunc = throttle(func, 100);

    throttledFunc();
    throttledFunc();
    throttledFunc();

    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should execute the function immediately if not called within the wait time', async () => {
    const func = vi.fn();
    const throttleMs = 500;
    const throttledFunc = throttle(func, throttleMs);

    throttledFunc();
    await sleep(throttleMs / 2);
    throttledFunc();

    expect(func).toHaveBeenCalledTimes(1);

    await sleep(throttleMs / 2 + 1);
    throttledFunc();
    expect(func).toHaveBeenCalledTimes(2);
  });

  // 原实现先调用 func 再写 lastTime：回调同步重入时同一时间窗执行两次（RV-01a1bbb13a9f751381c856bbc6bd39e3）
  it('回调同步重入时同一时间窗内不再执行，this 与参数照常传递', () => {
    const calls: Array<{ self: unknown; value: number }> = [];
    const target = {
      handle: throttle(function (this: unknown, value: number) {
        calls.push({ self: this, value });
        if (calls.length === 1) target.handle(value + 1);
      }, 1_000_000)
    };

    target.handle(1);

    expect(calls).toEqual([{ self: target, value: 1 }]);
  });

  it('同步抛错不占用时间窗（保留原有失败语义）', () => {
    let calls = 0;
    const handler = throttle(() => {
      calls++;
      if (calls === 1) throw new Error('boom');
    }, 1_000_000);

    expect(() => handler()).toThrow('boom');
    handler();
    handler();

    expect(calls).toBe(2);
  });

  it('should call the function with correct arguments', async () => {
    const func = vi.fn();
    const throttleMs = 50;
    const throttledFunc = throttle(func, throttleMs);

    throttledFunc('test', 123);

    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('test', 123);
  });
});
