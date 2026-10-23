import type { RxDB, WorktreeTableSet } from '@aiao/rxdb';
import {
  createWorktreeCommands,
  readMountedWorktreeTableSet,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorktreeAsyncStates,
  type WorktreeCommands
} from '@aiao/rxdb-plugin-working-tree';
import { useRxDB } from '@aiao/rxdb-react';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';

/** 十格状态连同产生它的库：换库后旧库的写回凭 `database` 识别并丢弃。 */
interface WorktreesSlot {
  readonly database: ReturnType<typeof useRxDB>;
  readonly states: WorktreeAsyncStates;
}

/** 本实例挂着的那套表，给 `useSyncExternalStore` 的外部 store。 */
interface MountedStore {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => WorktreeTableSet;
}

/**
 * 建一个跟着 `worktreeTableSet$` 走的外部 store：快照是流最近一次发出的那一套。
 *
 * @param database - 当前的库
 * @returns store
 * @throws 流没在订阅当下交出当前那一套（见 `readMountedWorktreeTableSet`）
 */
const createMountedStore = (database: RxDB): MountedStore => {
  let snapshot = readMountedWorktreeTableSet(database);
  return {
    subscribe: onChange => {
      const subscription = database.worktreeTableSet$.subscribe(tableSet => {
        if (tableSet === snapshot) return;
        snapshot = tableSet;
        onChange();
      });
      return () => subscription.unsubscribe();
    },
    getSnapshot: () => snapshot
  };
};

/**
 * {@link useWorktrees} 在当前 render 返回的检出位入口（只读检出位 US-313、可写检出位 US-314）。
 *
 * @remarks
 * 十个状态字段与核心的 `WorktreeAsyncStates` 一一对应，方法签名与插件包 `WorktreeManager` 上的同名方法一致。
 * 方法引用稳定（同一个库跨 render 复用同一组闭包），状态字段随相位变化产生新对象。
 * 三端同名、同字段、同签名：Angular `useWorktrees()`（`Signal`）、Vue `useWorktrees()`（`ComputedRef`）。
 * `RxDBProvider` 换了库时十格回到初态、`mounted` 换成新库的，旧库迟到的结果丢弃；Angular / Vue 的入口绑定创建时的库，
 * 换库靠重建组件。
 *
 * `mounted` 是本实例此刻挂的那套表（`rxdb.worktreeTableSet$`，换挂收尾、实体缓存清空之后才变）：`mounted.isMain` 即挂在主检出位，
 * 可写检出位的登记行里 `tableSetSuffix === mounted.suffix` 的那一行就是挂着的；当前分支是 `activeKey === mounted.holderKey` 的那条。
 * 换挂之后 `useWorkingTree()` 的各格不会自己重读，要跟着换的组件订阅 `mounted` 再重读。
 *
 * 打开得到的视图把 `view.rxdb` 交给 `RxDBProvider`，现有的查询 hook 照用；查询要用 `view.entityOf()` 换过的类。
 *
 * @public
 */
export type WorktreesResource = Readonly<WorktreeAsyncStates> &
  WorktreeCommands & {
    /** 本实例此刻挂的那套表；换挂收尾之后才变，重建之后是同后缀的新实例 */
    readonly mounted: WorktreeTableSet;
  };

/**
 * 读写当前数据库的检出位：只读检出位与可写检出位。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 组件树中没有 Provider、库没装工作树插件、或挂载流没在订阅当下交出当前那一套时抛错
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：十格初值全是 `idle`，只有调了方法才读库；`mounted` 读的是内存里的流。
 *
 * @example
 * ```tsx
 * const worktrees = useWorktrees();
 * const row = await worktrees.add('feature');
 * await worktrees.mount(row.id);
 * return <span>{worktrees.mounted.isMain ? 'Main Worktree' : row.name}</span>;
 * ```
 * @public
 */
export const useWorktrees = (): WorktreesResource => {
  const database = useRxDB();
  const [slot, setSlot] = useState<WorktreesSlot>(() => ({ database, states: WORKTREE_INITIAL_ASYNC_STATES }));
  if (slot.database !== database) setSlot({ database, states: WORKTREE_INITIAL_ASYNC_STATES });

  // 函数式更新：命令的闭包活得比某一次 render 长，读 `states` 会读到发起那一刻的旧值
  const patch = useCallback<Parameters<typeof createWorktreeCommands>[1]>(
    (key, state) =>
      setSlot(current =>
        current.database === database ? { database, states: { ...current.states, [key]: state } } : current
      ),
    [database]
  );
  const commands = useMemo(() => createWorktreeCommands(database, patch), [database, patch]);
  const mountedStore = useMemo(() => createMountedStore(database), [database]);
  const mounted = useSyncExternalStore(mountedStore.subscribe, mountedStore.getSnapshot, mountedStore.getSnapshot);

  return useMemo(() => ({ ...slot.states, ...commands, mounted }), [slot.states, commands, mounted]);
};
