import { computed, ref, type ComputedRef } from 'vue';

/**
 * 被包装后的异步操作。
 *
 * @typeParam Options - 调用参数类型；`void` 表示无参
 * @typeParam RT - 异步函数的返回类型
 *
 * @public
 */
export interface ActionResource<Options, RT> {
  /** 是否**还有**调用在途；按未完成调用计数，不是布尔标志。 */
  readonly isPending: ComputedRef<boolean>;
  /**
   * 调用被包装的异步函数。
   *
   * @param options - 原样透传给被包装函数
   * @returns 被包装函数的返回值，原样透传
   * @throws 被包装函数抛出的任何错误，原样冒泡（不吞、不归一化）
   */
  readonly execute: (options: Options) => Promise<RT>;
}

/**
 * 把一个异步函数包成带加载状态的可调用 action。
 *
 * @typeParam Options - 调用参数类型；默认 `void` 表示无参
 * @typeParam RT - 异步函数的返回类型
 * @param promiseFn - 被包装的异步函数；在 setup 期捕获一次，之后不再重新读取
 * @returns 见 {@link ActionResource}
 *
 * @example
 * ```ts
 * const save = useAction(async (todo: Todo) => repository.save(todo));
 *
 * // 模板里用 save.isPending 禁用按钮，用 save.execute(todo) 触发
 * ```
 *
 * @remarks
 * **并发语义**：内部按未完成调用计数（而非布尔标志），因此多次并发调用时
 * `isPending` 会保持为真直到**最后一个**完成 —— 先完成者不会提前把它置为 false。
 * action 本身不做去重也不取消在途调用；需要「同一时刻只跑一个」请由调用方在
 * `isPending` 为真时自行拦截。
 *
 * 被包装函数抛出的错误原样向上冒泡，计数在 `finally` 中恢复。
 *
 * 不依赖组件实例，可以在 setup 之外调用；返回的 `isPending` 是普通 `computed`，
 * 生命周期跟随持有它的作用域，没有需要清理的订阅。
 *
 * 三端等价实现：Angular `useAction`（`Signal<boolean>`）、React `useAction`（快照 `boolean`）。
 *
 * @public
 */
export const useAction = <Options = void, RT = unknown>(
  promiseFn: (options: Options) => Promise<RT>
): ActionResource<Options, RT> => {
  // 用计数器追踪在途请求数量，避免并发时先完成者提前把 isPending 置为 false
  const pendingCount = ref(0);

  return {
    isPending: computed(() => pendingCount.value > 0),
    execute: async (options: Options): Promise<RT> => {
      pendingCount.value += 1;
      try {
        return await promiseFn(options);
      } finally {
        pendingCount.value -= 1;
      }
    }
  };
};
