/**
 * `useAction` —— Vue 侧（RVU-010）。
 *
 * @remarks
 * 与 `packages/rxdb-angular/src/__tests__/use-action.spec.ts` 逐条对齐：
 * 容器从 `Signal<boolean>` 换成 `ComputedRef<boolean>`，其余语义（计数式并发、
 * 错误原样冒泡、`finally` 恢复）必须完全一致，否则就是新的单端差异。
 */
import { describe, expect, it, vi } from 'vitest';
import { useAction } from '../use-action';

describe('useAction（RVU-010）', () => {
  it('返回 isPending 与 execute，初始不在途', () => {
    const action = useAction(async () => 'result');

    expect(action.execute).toBeTypeOf('function');
    expect(action.isPending.value).toBe(false);
  });

  it('执行期间 isPending 为 true，完成后归零', async () => {
    let resolvePromise: (value: string) => void = () => undefined;
    const action = useAction(
      () =>
        new Promise<string>(resolve => {
          resolvePromise = resolve;
        })
    );

    const executing = action.execute();
    expect(action.isPending.value).toBe(true);

    resolvePromise('result');
    await executing;

    expect(action.isPending.value).toBe(false);
  });

  it('参数原样透传，返回值原样返回', async () => {
    const promiseFn = vi.fn(async (options: { id: number }) => `result-${options.id}`);
    const action = useAction(promiseFn);

    const result = await action.execute({ id: 123 });

    expect(promiseFn).toHaveBeenCalledWith({ id: 123 });
    expect(result).toBe('result-123');
  });

  it('被包装函数抛出的错误原样冒泡，isPending 仍归零', async () => {
    const failure = new Error('test error');
    const action = useAction(async () => {
      throw failure;
    });

    await expect(action.execute()).rejects.toBe(failure);
    expect(action.isPending.value).toBe(false);
  });

  // 计数器而非布尔标志：并发时先完成者不得提前把 isPending 置为 false
  it('并发调用时 isPending 保持到最后一个完成', async () => {
    const resolvers: Array<(value: string) => void> = [];
    const action = useAction(
      () =>
        new Promise<string>(resolve => {
          resolvers.push(resolve);
        })
    );

    const first = action.execute();
    const second = action.execute();
    expect(action.isPending.value).toBe(true);

    resolvers[0]('a');
    await first;
    expect(action.isPending.value).toBe(true);

    resolvers[1]('b');
    await second;
    expect(action.isPending.value).toBe(false);
  });

  it('并发中有一个失败也不影响其余的计数恢复', async () => {
    const resolvers: Array<{ resolve: (value: string) => void; reject: (cause: unknown) => void }> = [];
    const action = useAction(
      () =>
        new Promise<string>((resolve, reject) => {
          resolvers.push({ resolve, reject });
        })
    );

    const first = action.execute();
    const second = action.execute();

    resolvers[0].reject(new Error('boom'));
    await expect(first).rejects.toThrow('boom');
    expect(action.isPending.value).toBe(true);

    resolvers[1].resolve('ok');
    await second;
    expect(action.isPending.value).toBe(false);
  });

  it('不做去重也不取消在途调用：每次 execute 都真的调用一次', async () => {
    const promiseFn = vi.fn(async () => 'x');
    const action = useAction(promiseFn);

    await Promise.all([action.execute(), action.execute(), action.execute()]);

    expect(promiseFn).toHaveBeenCalledTimes(3);
  });
});
