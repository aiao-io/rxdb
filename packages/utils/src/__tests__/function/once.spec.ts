import { describe, expect, it, vi } from 'vitest';
import { once } from '../../function/once.js';

describe('once', () => {
  it('should call the function only once', () => {
    const func = vi.fn(() => 42);
    const onceFunc = once(func);

    expect(onceFunc()).toBe(42);
    expect(onceFunc()).toBe(42);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should work with functions returning undefined', () => {
    const func = vi.fn(() => undefined);
    const onceFunc = once(func);

    expect(onceFunc()).toBeUndefined();
    expect(onceFunc()).toBeUndefined();
    expect(func).toHaveBeenCalledTimes(1);
  });

  // 原实现先调用 func 再置 called：回调同步重入时仍看到「未执行」，func 被执行两次（RV-01a1bbb13a9f751381c856bbc6bd39e3）
  it('回调同步重入时不再执行，重入调用拿到的是尚未产生的结果', () => {
    let calls = 0;
    let reentered: unknown = 'not called';
    const init = once(() => {
      calls++;
      if (calls === 1) reentered = init();
      return 'done';
    });

    expect(init()).toBe('done');
    expect(calls).toBe(1);
    expect(reentered).toBeUndefined();
    expect(init()).toBe('done');
    expect(calls).toBe(1);
  });

  it('同步抛错后下一次调用重新执行（保留原有失败语义）', () => {
    let calls = 0;
    const flaky = once(() => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return calls;
    });

    expect(() => flaky()).toThrow('boom');
    expect(flaky()).toBe(2);
    expect(flaky()).toBe(2);
    expect(calls).toBe(2);
  });

  it('should handle functions with no return value', () => {
    const func = vi.fn(() => {
      //
    });
    const onceFunc = once(func);

    expect(onceFunc()).toBeUndefined();
    expect(onceFunc()).toBeUndefined();
    expect(func).toHaveBeenCalledTimes(1);
  });
});
