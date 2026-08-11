/**
 * `useAction` —— React 侧（RVU-010）。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/use-action.spec.ts`、
 * `packages/rxdb-vue/src/__tests__/use-action.spec.ts` 逐条对齐：三端共用同一份语义
 * （并发按计数、错误原样冒泡、不做去重不做取消），只是 `isPending` 的容器形态不同 ——
 * Angular 是 `Signal`，Vue 是 `ComputedRef`，React 是渲染快照。
 *
 * 末尾两条是 React 独有的：`execute` 的函数 identity 必须跨渲染稳定，
 * 否则它没法安全地进 `useEffect` / `useCallback` 的依赖数组。
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAction } from '../use-action';

afterEach(cleanup);

/** 由测试决定 settle 时机的 promise。 */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useAction（RVU-010）', () => {
  it('初始状态不是 pending', () => {
    const { result } = renderHook(() => useAction(async () => 'done'));

    expect(result.current.isPending).toBe(false);
  });

  it('执行期间 isPending 为 true，settle 后复位', async () => {
    const gate = deferred<string>();
    const { result } = renderHook(() => useAction(() => gate.promise));

    let pending!: Promise<string>;
    act(() => {
      pending = result.current.execute();
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      gate.resolve('done');
      await pending;
    });
    expect(result.current.isPending).toBe(false);
  });

  it('入参与返回值原样透传', async () => {
    const promiseFn = vi.fn(async (options: { id: string }) => `got:${options.id}`);
    const { result } = renderHook(() => useAction(promiseFn));

    let value!: string;
    await act(async () => {
      value = await result.current.execute({ id: 'todo-1' });
    });

    expect(promiseFn).toHaveBeenCalledWith({ id: 'todo-1' });
    expect(value).toBe('got:todo-1');
  });

  it('错误原样冒泡，且 pending 计数复位', async () => {
    const failure = new Error('boom');
    const { result } = renderHook(() =>
      useAction(async () => {
        throw failure;
      })
    );

    await act(async () => {
      await expect(result.current.execute()).rejects.toBe(failure);
    });

    expect(result.current.isPending).toBe(false);
  });

  it('并发执行期间保持 pending，直到最后一个 settle', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const promiseFn = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAction(promiseFn));

    let a!: Promise<string>;
    let b!: Promise<string>;
    act(() => {
      a = result.current.execute();
      b = result.current.execute();
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      first.resolve('a');
      await a;
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      second.resolve('b');
      await b;
    });
    expect(result.current.isPending).toBe(false);
  });

  it('并发中有一个 reject 也能把计数还原', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const promiseFn = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useAction(promiseFn));

    let a!: Promise<string>;
    let b!: Promise<string>;
    act(() => {
      a = result.current.execute();
      b = result.current.execute();
    });

    await act(async () => {
      first.reject(new Error('boom'));
      await expect(a).rejects.toThrow('boom');
      second.resolve('b');
      await b;
    });

    expect(result.current.isPending).toBe(false);
  });

  // 有意为之：去重 / 取消由调用方决定，hook 只负责如实反映在途数量
  it('不做去重：连续调用会执行同样多次', async () => {
    const promiseFn = vi.fn(async () => 'done');
    const { result } = renderHook(() => useAction(promiseFn));

    await act(async () => {
      await Promise.all([result.current.execute(), result.current.execute(), result.current.execute()]);
    });

    expect(promiseFn).toHaveBeenCalledTimes(3);
  });

  it('execute 的 identity 跨渲染稳定，可安全进依赖数组', () => {
    const { result, rerender } = renderHook(({ promiseFn }) => useAction(promiseFn), {
      initialProps: { promiseFn: async () => 'a' }
    });
    const first = result.current.execute;

    rerender({ promiseFn: async () => 'b' });

    expect(result.current.execute).toBe(first);
  });

  it('identity 稳定但调用的始终是最新一次渲染传入的函数', async () => {
    const { result, rerender } = renderHook(({ promiseFn }) => useAction(promiseFn), {
      initialProps: { promiseFn: async () => 'a' }
    });

    rerender({ promiseFn: async () => 'b' });
    let value!: string;
    await act(async () => {
      value = await result.current.execute();
    });

    expect(value).toBe('b');
  });
});
