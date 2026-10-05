/**
 * @fileoverview 取 observable 的第一个值，代替 rxjs 的 `firstValueFrom`。
 *
 * 页面静态引用的模块不能 import rxjs：支付宝构建要求 RxDB 栈（含 rxjs）只经动态 `import()` 可达
 * （`config/lazy-chunk-vite-plugin.ts`），这里只按结构约束 observable。
 */

/** 订阅句柄的最小结构。 */
export interface SubscriptionLike {
  unsubscribe(): void;
}

/** observable 的最小结构，RxDB 查询返回的 `Observable` 满足它。 */
export interface ObservableLike<T> {
  subscribe(observer: { next(value: T): void; error(reason: unknown): void; complete(): void }): SubscriptionLike;
}

/**
 * 订阅并在第一个值到达时 resolve、随后取消订阅。
 *
 * @param source - observable
 * @returns 第一个值
 * @throws observable 报错，或没有任何值就完成
 */
export function firstValue<T>(source: ObservableLike<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    // 同步 observable 会在 `subscribe()` 返回之前就触发 `next`，那一刻订阅句柄还没交回来，
    // 所以取消订阅延到微任务，句柄也只能放进可变容器里（先声明后赋值的 `let` 过不了 prefer-const）。
    const handle: { subscription?: SubscriptionLike } = {};
    const unsubscribe = () => Promise.resolve().then(() => handle.subscription?.unsubscribe());

    handle.subscription = source.subscribe({
      next(value) {
        if (settled) return;
        settled = true;
        resolve(value);
        unsubscribe();
      },
      error(reason) {
        if (settled) return;
        settled = true;
        reject(reason);
      },
      complete() {
        if (settled) return;
        settled = true;
        reject(new Error('RxDB 查询没有返回结果'));
      }
    });
  });
}
