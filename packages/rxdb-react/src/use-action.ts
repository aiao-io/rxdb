import { useCallback, useInsertionEffect, useRef, useState } from 'react';

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
   * 同时调用的始终是**最新一次已提交渲染**传入的 `promiseFn`：从这次提交的 layout effect
   * （含父组件的）或提交途中同步派发的事件里调用也是如此；挂起或被丢弃、没有提交的并发渲染
   * 不会改写它。
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

  // 不在渲染期赋值：并发渲染可能被挂起、丢弃或重放，只有真正提交的那次渲染才该改写它。
  // 也不放被动 effect：同一次提交里的 layout effect（含父组件的）与提交途中同步派发的事件
  // （如 autoFocus 触发的 onFocus）都先于被动 effect 运行，那时调用 execute 会落到上一次
  // 提交的旧闭包上。insertion effect 在提交的 mutation 阶段运行，早于以上全部。
  useInsertionEffect(() => {
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
