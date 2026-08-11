/**
 * @packageDocumentation
 * useAction Hook - 异步操作状态管理
 * 提供带加载状态的异步操作封装,支持 pending 状态追踪
 */
import { computed, signal, Signal } from '@angular/core';

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
  readonly isPending: Signal<boolean>;
  /** 触发一次调用；错误原样冒泡给调用方。 */
  readonly execute: (options: Options) => Promise<RT>;
}

const action = <Options = void, RT = unknown>(
  promiseFn: (options: Options) => Promise<RT>
): ActionResource<Options, RT> => {
  // 用计数器追踪在途请求数量，避免并发时先完成者提前把 isPending 置为 false
  const pendingCount = signal<number>(0);
  const isPending = computed<boolean>(() => pendingCount() > 0);
  return {
    isPending,
    execute: async (options: Options) => {
      pendingCount.update(n => n + 1);
      try {
        const d = await promiseFn(options);
        return d;
      } finally {
        pendingCount.update(n => n - 1);
      }
    }
  };
};

/**
 * 把一个异步函数包成带加载状态的可调用 action。
 *
 * @typeParam Options - 调用参数类型；默认 `void` 表示无参
 * @typeParam RT - 异步函数的返回类型
 * @param promiseFn - 被包装的异步函数
 * @returns 见 {@link ActionResource}
 *
 * @remarks
 * **并发语义**：内部按未完成调用计数（而非布尔标志），因此多次并发调用时
 * `isPending` 会保持为真直到**最后一个**完成。action 本身不做去重也不取消在途调用 ——
 * 需要「同一时刻只跑一个」请由调用方在 `isPending` 为真时自行拦截。
 *
 * 被包装函数抛出的错误原样向上冒泡，`isPending` 在 `finally` 中恢复（RAN-015）。
 *
 * 三端等价实现：Vue `useAction`（`ComputedRef`）、React `useAction`（渲染快照），
 * 语义完全一致，只是 `isPending` 的容器形态不同。
 *
 * @public
 */
export const useAction = <Options = void, RT = unknown>(
  promiseFn: (options: Options) => Promise<RT>
): ActionResource<Options, RT> => action<Options, RT>(promiseFn);
