import type { SyncConflict, SyncState } from '@aiao/rxdb';
import type { Subscription } from 'rxjs';
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue';
import { useRxDB } from './rxdb-vue';

/**
 * {@link useSyncState} 的返回值。
 *
 * @remarks
 * 字段与核心的 `SyncState` 一一对应，只是每一项各自装进 `ComputedRef`：
 * 成员可以安全解构，模板只读了 `online` 时 `pendingCount` 的变化不会让它重新求值。
 *
 * 三端等价实现：Angular `useSyncState`（`Signal`）、React `useSyncState`（渲染快照），
 * 字段名与语义完全一致，只是容器形态不同。
 *
 * @public
 */
export interface SyncStateResource {
  /** 远端当前是否可达。 */
  readonly online: ComputedRef<boolean>;
  /** 两条推送路径合计仍未推到远端的变更数（changelog 待推 + QueryCache 出站）。 */
  readonly pendingCount: ComputedRef<number>;
  /** 是否有一轮回推正在进行。 */
  readonly syncing: ComputedRef<boolean>;
  /** 上一次回推失败；成功一轮后清空。 */
  readonly lastError: ComputedRef<Error | null>;
  /** 上一次冲突判定；**不会**被后续成功清空，它是历史事实。 */
  readonly lastConflict: ComputedRef<SyncConflict | null>;
}

/**
 * 读取当前数据库的同步状态。
 *
 * @returns 见 {@link SyncStateResource}
 * @throws 没有 provider、数据库尚未就绪时各抛一条不同的文案；异步 source 创建失败时
 *   原样抛出创建异常（与 `useRxDB` 同语义）
 *
 * @example
 * ```vue
 * <script lang="ts" setup>
 * import { useSyncState } from '@aiao/rxdb-vue';
 *
 * const sync = useSyncState();
 * </script>
 *
 * <template>
 *   <span v-if="!sync.online.value">离线 · 待推 {{ sync.pendingCount }} 条</span>
 * </template>
 * ```
 *
 * @remarks
 * **必须在 setup 中调用** —— 它经 `useRxDB()` 取库（`inject` 只在 setup 期可用），
 * 订阅随当前作用域销毁自动退订。
 *
 * 数据库取不到时**抛错而不是**返回一份「一切正常」的默认值：那会把「面板没接上」
 * 伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
 *
 * 上游是 `BehaviorSubject` 支撑的流，订阅当场就会覆盖初值，因此这里给的
 * `snapshot` 初值实际上观察不到 —— 它仍取自同一份快照，不引入第二个初值口径。
 *
 * @public
 */
export const useSyncState = (): SyncStateResource => {
  const { syncState } = useRxDB();
  const state = shallowRef<SyncState>(syncState.snapshot);

  const subscription: Subscription = syncState.state$.subscribe(next => {
    state.value = next;
  });
  onScopeDispose(() => subscription.unsubscribe());

  return {
    online: computed(() => state.value.online),
    pendingCount: computed(() => state.value.pendingCount),
    syncing: computed(() => state.value.syncing),
    lastError: computed(() => state.value.lastError),
    lastConflict: computed(() => state.value.lastConflict)
  };
};
