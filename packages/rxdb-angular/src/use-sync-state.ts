/**
 * @packageDocumentation
 * useSyncState Hook - 同步状态面板
 * 把库的「网通不通、还有多少没推上去、这会儿在不在推、上一次错在哪、上一次谁判负」
 * 五件事接成 Angular signal，供 local-first 应用直接绑到模板上
 */
import type { SyncConflict } from '@aiao/rxdb';
import { computed, Signal } from '@angular/core';
import { toLazySignal } from 'ngxtension/to-lazy-signal';
import { useRxDB } from './rxdb.provider';

/**
 * {@link useSyncState} 的返回值。
 *
 * @remarks
 * 字段与核心的 `SyncState` 一一对应，只是每一项各自装进 `Signal`：
 * 模板只读了 `online` 时，`pendingCount` 的变化不会让它重新求值。
 *
 * 三端等价实现：React `useSyncState`（渲染快照）、Vue `useSyncState`（`ComputedRef`），
 * 字段名与语义完全一致，只是容器形态不同。
 *
 * @public
 */
export interface SyncStateResource {
  /** 远端当前是否可达。 */
  readonly online: Signal<boolean>;
  /** 两条推送路径合计仍未推到远端的变更数（changelog 待推 + QueryCache 出站）。 */
  readonly pendingCount: Signal<number>;
  /** 是否有一轮回推正在进行。 */
  readonly syncing: Signal<boolean>;
  /** 上一次回推失败；成功一轮后清空。 */
  readonly lastError: Signal<Error | null>;
  /** 上一次冲突判定；**不会**被后续成功清空，它是历史事实。 */
  readonly lastConflict: Signal<SyncConflict | null>;
}

/**
 * 读取当前数据库的同步状态。
 *
 * @returns 见 {@link SyncStateResource}
 * @throws 没有 `provideRxDB`、数据库尚未就绪，或创建失败时抛错（与 `useRxDB` 同语义）
 *
 * @example
 * ```typescript
 * @Component({
 *   template: `
 *     @if (!sync.online()) {
 *       <span>离线 · 待推 {{ sync.pendingCount() }} 条</span>
 *     }
 *   `
 * })
 * export class SyncBanner {
 *   readonly sync = useSyncState();
 * }
 * ```
 *
 * @remarks
 * **必须在 Angular 注入上下文中调用** —— 它经 `useRxDB()` 取库，订阅也挂在当前
 * `DestroyRef` 上，注入器销毁时自动退订。
 *
 * 数据库取不到时**抛错而不是**返回一份「一切正常」的默认值：那会把「面板没接上」
 * 伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
 *
 * 上游是 `BehaviorSubject` 支撑的流，首次读取即拿到当前值，因此 `initialValue`
 * 实际上观察不到 —— 它仍取自同一份快照，不引入第二个初值口径。
 *
 * @public
 */
export const useSyncState = (): SyncStateResource => {
  const { syncState } = useRxDB();
  const state = toLazySignal(syncState.state$, { initialValue: syncState.snapshot });

  return {
    online: computed(() => state().online),
    pendingCount: computed(() => state().pendingCount),
    syncing: computed(() => state().syncing),
    lastError: computed(() => state().lastError),
    lastConflict: computed(() => state().lastConflict)
  };
};
