import { EntityType, RxDB } from '@aiao/rxdb';
import { inject, Signal } from '@angular/core';
import { InfiniteScrollingList, InfiniteScrollOptions } from './InfiniteScrollingList';

/**
 * Angular 无限滚动资源。
 *
 * @remarks
 * 字段语义与 React 侧的 `InfiniteScrollResource`（`@aiao/rxdb-react`）逐项对齐，
 * 差别只在于这里每个字段都是 Signal —— 三框架同功能同 API（RAN-015）。
 *
 * RAN-009：`isLoading` / `error` / `hasMore` 早先声明为 `WritableSignal`，
 * 把内部状态机的写入口暴露给了消费者 —— 外部把 `isLoading` 强改成 `false`
 * 就能绕过 `loadMore` 的并发 guard，把 `hasMore` 改成 `true` 就能越过终页。
 * 现已收窄为只读 `Signal`，状态只能经 `loadMore` / `refresh` 改变，
 * 与 React 侧「返回纯值」的只读语义对称。
 *
 * @public
 */
export interface InfiniteScrollResource<T> {
  /** 已加载页面合并后的实体。 */
  readonly value: Signal<T[]>;
  /** 已完成首次加载且结果为空。首次加载完成前恒为 `false`。 */
  readonly isEmpty: Signal<boolean>;
  /** 当前是否正在加载新页面。 */
  readonly isLoading: Signal<boolean>;
  /** 最近一次加载错误；下一次成功加载会清空它。 */
  readonly error: Signal<Error | undefined>;
  /** 是否仍可能存在下一页。返回不足一页即置 `false`。 */
  readonly hasMore: Signal<boolean>;
  /** 加载下一页。`isLoading` 为真或 `hasMore` 为假时为 no-op。 */
  readonly loadMore: () => void;
  /** 清空当前页面并重新加载第一页。 */
  readonly refresh: () => void;
}

/**
 * 从当前 Angular 注入上下文创建无限滚动资源。
 *
 * @param EntityType - 实体构造器
 * @param options - 游标分页选项（`limit` / `orderBy` / `where` 等）
 * @returns 随注入上下文自动释放的 {@link InfiniteScrollResource}
 *
 * @remarks
 * **必须在注入上下文中调用**（组件/指令构造器或 `runInInjectionContext` 内）——
 * 它经 `inject(DestroyRef)` 注册销毁钩子，宿主销毁时自动退订，调用方无需手动清理。
 *
 * @public
 */
export function useInfiniteScroll<T extends EntityType>(
  EntityType: T,
  options: InfiniteScrollOptions<T>
): InfiniteScrollResource<InstanceType<T>> {
  return new InfiniteScrollingList(inject(RxDB), EntityType, options);
}
