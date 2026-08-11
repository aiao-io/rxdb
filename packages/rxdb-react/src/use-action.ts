import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * {@link useAction} 的返回值。
 *
 * @typeParam Options - `execute` 的入参类型；无入参时为 `void`
 * @typeParam RT - 异步函数的返回值类型
 *
 * @public
 */
export interface ActionResource<Options, RT> {
  /** 是否还有在途调用；并发时按**计数**判断，最后一个 settle 后才回到 `false`。 */
  readonly isPending: boolean;
  /**
   * 触发一次调用。
   *
   * @remarks
   * 函数 identity 跨渲染稳定，可以直接进 `useEffect` / `useCallback` 的依赖数组，
   * 同时调用的始终是**最新一次渲染**传入的 `promiseFn`。
   */
  readonly execute: (options: Options) => Promise<RT>;
}

/**
 * 把一个异步函数包装成带在途状态的 action。
 *
 * @typeParam Options - `execute` 的入参类型
 * @typeParam RT - 异步函数的返回值类型
 * @param promiseFn - 真正执行的异步函数；每次渲染可以传新的
 * @returns 见 {@link ActionResource}
 *
 * @example
 * ```tsx
 * const save = useAction((todo: Todo) => repository.save(todo));
 *
 * return (
 *   <button disabled={save.isPending} onClick={() => save.execute(todo)}>
 *     {save.isPending ? '保存中…' : '保存'}
 *   </button>
 * );
 * ```
 *
 * @remarks
 * `isPending` 是**并发计数**而不是布尔开关：N 次调用同时在途时它一直是 `true`，
 * 直到最后一个 settle。计数在 `finally` 里回退，因此**失败也会正确复位**。
 *
 * 有意**不做**去重与取消：重复点击会真的执行多次，错误原样 reject 给调用方。
 * 需要防抖、串行化或取消，请在 `promiseFn` 内部或调用点自行处理 ——
 * 把策略藏进 hook 会让「按钮点了没反应」变成无法排查的黑箱。
 *
 * 三端等价实现：Angular `useAction`（`Signal`）、Vue `useAction`（`ComputedRef`），
 * 语义完全一致，只是 `isPending` 的容器形态不同。
 *
 * @public
 */
export const useAction = <Options = void, RT = unknown>(
  promiseFn: (options: Options) => Promise<RT>
): ActionResource<Options, RT> => {
  const [pendingCount, setPendingCount] = useState(0);
  const latest = useRef(promiseFn);

  // 在 effect 里同步而不是渲染期赋值：渲染期写 ref 在并发渲染下可能被丢弃或重放。
  // execute 只会从事件回调 / effect 里调用，那时 effect 早已提交，读到的必然是最新值。
  useEffect(() => {
    latest.current = promiseFn;
  });

  const execute = useCallback(async (options: Options): Promise<RT> => {
    setPendingCount(current => current + 1);
    try {
      return await latest.current(options);
    } finally {
      setPendingCount(current => current - 1);
    }
  }, []);

  return { isPending: pendingCount > 0, execute };
};
