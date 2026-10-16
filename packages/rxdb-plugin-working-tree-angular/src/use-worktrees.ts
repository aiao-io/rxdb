import { useRxDB } from '@aiao/rxdb-angular';
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
import { computed, signal, Signal } from '@angular/core';

/**
 * {@link useWorktrees} 返回的只读检出位入口（US-313）。
 *
 * @remarks
 * 四格状态与核心的 `WorktreeAsyncStates` 一一对应，各包一层 `Signal`；方法签名与插件包 `WorktreeManager`
 * 上的同名方法一致。三端等价实现：React `useWorktrees()`（渲染快照）、Vue `useWorktrees()`（`ComputedRef`）。
 *
 * 打开得到的视图把 `view.rxdb` 经组件级 `{ provide: RxDB, useValue: view.rxdb }` 交给子树，现有的查询照用；
 * 查询要用 `view.entityOf()` 换过的类。
 *
 * @public
 */
export interface WorktreesResource {
  /** 上一次 `list()` 的相位；没有登记着的检出位是 `empty` */
  readonly listState: Signal<WorkingTreeQueryState<readonly Worktree[]>>;
  /** 上一次 `open()` 的相位；**没有 empty** */
  readonly openState: Signal<WorkingTreeCommandState<WorktreeView>>;
  /** 上一次 `attach()` 的相位；**没有 empty** */
  readonly attachState: Signal<WorkingTreeCommandState<WorktreeView>>;
  /** 上一次 `prune()` 的相位；回收零个也是结果 */
  readonly pruneState: Signal<WorkingTreeCommandState<readonly string[]>>;
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
 * 读写当前数据库的只读检出位；在注入上下文里调用。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 注入上下文里取不到数据库、或库没装工作树插件时抛错（与 `useWorkingTree()` 同语义）
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：四格初值全是 `idle`，只有调了方法才读库。
 *
 * @public
 */
export const useWorktrees = (): WorktreesResource => {
  const database = useRxDB();
  const states = signal<WorktreeAsyncStates>(WORKTREE_INITIAL_ASYNC_STATES);
  const commands = createWorktreeCommands(database, (key, state) =>
    states.update(current => ({ ...current, [key]: state }))
  );

  return {
    listState: computed(() => states().listState),
    openState: computed(() => states().openState),
    attachState: computed(() => states().attachState),
    pruneState: computed(() => states().pruneState),
    ...commands
  };
};
