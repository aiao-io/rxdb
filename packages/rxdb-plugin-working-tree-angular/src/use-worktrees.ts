import type { WorktreeTableSet } from '@aiao/rxdb';
import { useRxDB } from '@aiao/rxdb-angular';
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
import { computed, signal, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * {@link useWorktrees} 返回的检出位入口（只读检出位 US-313、可写检出位 US-314）。
 *
 * @remarks
 * 十格状态与核心的 `WorktreeAsyncStates` 一一对应，各包一层 `Signal`；方法签名与插件包 `WorktreeManager`
 * 上的同名方法一致。三端同名、同字段、同签名：React `useWorktrees()`（渲染快照）、Vue `useWorktrees()`（`ComputedRef`）。
 * 入口绑定创建时注入的库：注入器里的库不会换，换库就是重建组件（React 版在 Provider 换库时自己回到初态）。
 *
 * `mounted` 是本实例此刻挂的那套表（`rxdb.worktreeTableSet$`，换挂收尾、实体缓存清空之后才变）：`mounted().isMain` 即挂在主检出位，
 * 可写检出位的登记行里 `tableSetSuffix === mounted().suffix` 的那一行就是挂着的；当前分支是 `activeKey === mounted().holderKey` 的那条。
 * 换挂之后 `useWorkingTree()` 的各格不会自己重读，要跟着换的组件订阅 `mounted` 再重读。
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
  /** 上一次 `add()` 的相位：建好的可写检出位的登记行 */
  readonly addState: Signal<WorkingTreeCommandState<Worktree>>;
  /** 上一次 `mount()` 的相位 */
  readonly mountState: Signal<WorkingTreeCommandState<void>>;
  /** 上一次 `mountMain()` 的相位 */
  readonly mountMainState: Signal<WorkingTreeCommandState<void>>;
  /** 上一次 `release()` 的相位 */
  readonly releaseState: Signal<WorkingTreeCommandState<void>>;
  /** 上一次 `remove()` 的相位 */
  readonly removeState: Signal<WorkingTreeCommandState<void>>;
  /** 上一次 `rename()` 的相位：改名之后的登记行 */
  readonly renameState: Signal<WorkingTreeCommandState<Worktree>>;
  /** 本实例此刻挂的那套表；换挂收尾之后才变，重建之后是同后缀的新实例 */
  readonly mounted: Signal<WorktreeTableSet>;
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
 * 读写当前数据库的检出位（只读检出位与可写检出位）；在注入上下文里调用。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 注入上下文里取不到数据库、库没装工作树插件、或挂载流没在订阅当下交出当前那一套时抛错
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：十格初值全是 `idle`，只有调了方法才读库；`mounted` 读的是内存里的流，
 * 注入器销毁时退订。
 *
 * @public
 */
export const useWorktrees = (): WorktreesResource => {
  const database = useRxDB();
  const states = signal<WorktreeAsyncStates>(WORKTREE_INITIAL_ASYNC_STATES);
  const commands = createWorktreeCommands(database, (key, state) =>
    states.update(current => ({ ...current, [key]: state }))
  );
  // 先确认流在订阅当下交出当前那一套（三端同一句报错），`requireSync` 于是不会再报 Angular 自己的 NG0601
  readMountedWorktreeTableSet(database);
  const mounted = toSignal(database.worktreeTableSet$, { requireSync: true });

  return {
    listState: computed(() => states().listState),
    openState: computed(() => states().openState),
    attachState: computed(() => states().attachState),
    pruneState: computed(() => states().pruneState),
    addState: computed(() => states().addState),
    mountState: computed(() => states().mountState),
    mountMainState: computed(() => states().mountMainState),
    releaseState: computed(() => states().releaseState),
    removeState: computed(() => states().removeState),
    renameState: computed(() => states().renameState),
    mounted,
    ...commands
  };
};
