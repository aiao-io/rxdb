import type { WorktreeTableSet } from '@aiao/rxdb';
import {
  createWorktreeCommands,
  readMountedWorktreeTableSet,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorkingTreeCommandState,
  type WorkingTreeQueryState,
  type Worktree,
  type WorktreeAddOptions,
  type WorktreeAsyncStates,
  type WorktreeOpenOptions,
  type WorktreeTarget,
  type WorktreeView
} from '@aiao/rxdb-plugin-working-tree';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed, onScopeDispose, shallowRef, type ComputedRef } from 'vue';

/**
 * {@link useWorktrees} 返回的检出位入口（只读检出位 US-313、可写检出位 US-314）。
 *
 * @remarks
 * 十格状态与核心的 `WorktreeAsyncStates` 一一对应，各包一层 `ComputedRef`；方法签名与插件包 `WorktreeManager`
 * 上的同名方法一致。三端同名、同字段、同签名：React `useWorktrees()`（渲染快照）、Angular `useWorktrees()`（`Signal`）。
 * 入口绑定 `setup()` 时注入的库：`provideRxDB()` 的源换了库，这里仍指着旧库——要跟着换，给用它的组件加 `:key`
 * 随库重建（React 版在 Provider 换库时自己回到初态）。
 *
 * 打开得到的视图把 `view.rxdb` 交给 `provideRxDB()`，现有的组合函数照用；查询要用 `view.entityOf()` 换过的类。
 *
 * `mounted` 是本实例此刻挂的那套表（`rxdb.worktreeTableSet$`，换挂收尾、实体缓存清空之后才变）：`mounted.value.isMain` 即挂在主检出位，
 * 可写检出位的登记行里 `tableSetSuffix === mounted.value.suffix` 的那一行就是挂着的；当前分支是 `activeKey === mounted.value.holderKey`
 * 的那条。换挂之后 `useWorkingTree()` 的各格不会自己重读，要跟着换的组件 `watch(mounted)` 再重读。
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
  /** 上一次 `add()` 的相位：建好的可写检出位的登记行 */
  readonly addState: ComputedRef<WorkingTreeCommandState<Worktree>>;
  /** 上一次 `mount()` 的相位 */
  readonly mountState: ComputedRef<WorkingTreeCommandState<void>>;
  /** 上一次 `mountMain()` 的相位 */
  readonly mountMainState: ComputedRef<WorkingTreeCommandState<void>>;
  /** 上一次 `release()` 的相位 */
  readonly releaseState: ComputedRef<WorkingTreeCommandState<void>>;
  /** 上一次 `remove()` 的相位 */
  readonly removeState: ComputedRef<WorkingTreeCommandState<void>>;
  /** 上一次 `rename()` 的相位：改名之后的登记行 */
  readonly renameState: ComputedRef<WorkingTreeCommandState<Worktree>>;
  /** 本实例此刻挂的那套表；换挂收尾之后才变，重建之后是同后缀的新实例 */
  readonly mounted: ComputedRef<WorktreeTableSet>;
  /** 读登记着的检出位。 */
  readonly list: () => Promise<readonly Worktree[]>;
  /** 打开一个只读检出位；之后自动重读登记表。 */
  readonly open: (target: WorktreeTarget, options?: WorktreeOpenOptions) => Promise<WorktreeView>;
  /** 再打开一个持久归属的检出位；之后自动重读登记表。 */
  readonly attach: (id: string) => Promise<WorktreeView>;
  /** 回收没人在用的检出位（含没有登记行的孤儿表集）；之后自动重读登记表。 */
  readonly prune: () => Promise<readonly string[]>;
  /** 开一个可写检出位（建好不挂，本上下文认领它）；之后自动重读登记表。 */
  readonly add: (branchId: string, options?: WorktreeAddOptions) => Promise<Worktree>;
  /** 让主实例挂上一个可写检出位；之后自动重读登记表。 */
  readonly mount: (id: string) => Promise<void>;
  /** 让主实例挂回主检出位。 */
  readonly mountMain: () => Promise<void>;
  /** 交出对一个可写检出位的认领。 */
  readonly release: (id: string) => Promise<void>;
  /** 删掉一个可写检出位（未提交的改动留在它持有的分支上）；之后自动重读登记表。 */
  readonly remove: (id: string) => Promise<void>;
  /** 给一个可写检出位改名；之后自动重读登记表。 */
  readonly rename: (id: string, name: string) => Promise<Worktree>;
}

/**
 * 读写当前数据库的检出位（只读检出位与可写检出位）；在 `setup()` 或 `effectScope` 里调用。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 没有注入数据库、库没装工作树插件、或挂载流没在订阅当下交出当前那一套时抛错
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：十格初值全是 `idle`，只有调了方法才读库；`mounted` 读的是内存里的流，
 * 所在作用域销毁时退订。`mounted` 用 `shallowRef` 装：表集有私有字段，深层代理会让它的方法失灵。
 *
 * @public
 */
export const useWorktrees = (): WorktreesResource => {
  const database = useRxDB();
  const states = shallowRef<WorktreeAsyncStates>(WORKTREE_INITIAL_ASYNC_STATES);
  const commands = createWorktreeCommands(database, (key, state) => {
    states.value = { ...states.value, [key]: state };
  });
  const mounted = shallowRef<WorktreeTableSet>(readMountedWorktreeTableSet(database));
  const subscription = database.worktreeTableSet$.subscribe(tableSet => (mounted.value = tableSet));
  onScopeDispose(() => subscription.unsubscribe());

  return {
    listState: computed(() => states.value.listState),
    openState: computed(() => states.value.openState),
    attachState: computed(() => states.value.attachState),
    pruneState: computed(() => states.value.pruneState),
    addState: computed(() => states.value.addState),
    mountState: computed(() => states.value.mountState),
    mountMainState: computed(() => states.value.mountMainState),
    releaseState: computed(() => states.value.releaseState),
    removeState: computed(() => states.value.removeState),
    renameState: computed(() => states.value.renameState),
    mounted: computed(() => mounted.value),
    ...commands
  };
};
