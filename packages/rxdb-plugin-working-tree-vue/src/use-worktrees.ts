import {
  createWorktreeCommands,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorkingTreeCommandState,
  type WorkingTreeQueryState,
  type Worktree,
  type WorktreeAsyncStates,
  type WorktreeOpenOptions,
  type WorktreeTarget,
  type WorktreeView
} from '@aiao/rxdb-plugin-working-tree';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed, shallowRef, type ComputedRef } from 'vue';

/**
 * {@link useWorktrees} 返回的只读检出位入口（US-313）。
 *
 * @remarks
 * 四格状态与核心的 `WorktreeAsyncStates` 一一对应，各包一层 `ComputedRef`；方法签名与插件包 `WorktreeManager`
 * 上的同名方法一致。三端同名、同字段、同签名：React `useWorktrees()`（渲染快照）、Angular `useWorktrees()`（`Signal`）。
 * 入口绑定 `setup()` 时注入的库：`provideRxDB()` 的源换了库，这里仍指着旧库——要跟着换，给用它的组件加 `:key`
 * 随库重建（React 版在 Provider 换库时自己回到初态）。
 *
 * 打开得到的视图把 `view.rxdb` 交给 `provideRxDB()`，现有的组合函数照用；查询要用 `view.entityOf()` 换过的类。
 *
 * @public
 */
export interface WorktreesResource {
  /** 上一次 `list()` 的相位；没有登记着的检出位是 `empty` */
  readonly listState: ComputedRef<WorkingTreeQueryState<readonly Worktree[]>>;
  /** 上一次 `open()` 的相位；**没有 empty** */
  readonly openState: ComputedRef<WorkingTreeCommandState<WorktreeView>>;
  /** 上一次 `attach()` 的相位；**没有 empty** */
  readonly attachState: ComputedRef<WorkingTreeCommandState<WorktreeView>>;
  /** 上一次 `prune()` 的相位；回收零个也是结果 */
  readonly pruneState: ComputedRef<WorkingTreeCommandState<readonly string[]>>;
  /** 读登记着的检出位。 */
  readonly list: () => Promise<readonly Worktree[]>;
  /** 打开一个只读检出位；之后自动重读登记表。 */
  readonly open: (target: WorktreeTarget, options?: WorktreeOpenOptions) => Promise<WorktreeView>;
  /** 再打开一个持久归属的检出位；之后自动重读登记表。 */
  readonly attach: (id: string) => Promise<WorktreeView>;
  /** 回收没人在用的检出位；之后自动重读登记表。 */
  readonly prune: () => Promise<readonly string[]>;
}

/**
 * 读写当前数据库的只读检出位。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 没有注入数据库、或库没装工作树插件时抛错（与 `useWorkingTree()` 同语义）
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：四格初值全是 `idle`，只有调了方法才读库。
 *
 * @public
 */
export const useWorktrees = (): WorktreesResource => {
  const database = useRxDB();
  const states = shallowRef<WorktreeAsyncStates>(WORKTREE_INITIAL_ASYNC_STATES);
  const commands = createWorktreeCommands(database, (key, state) => {
    states.value = { ...states.value, [key]: state };
  });

  return {
    listState: computed(() => states.value.listState),
    openState: computed(() => states.value.openState),
    attachState: computed(() => states.value.attachState),
    pruneState: computed(() => states.value.pruneState),
    ...commands
  };
};
