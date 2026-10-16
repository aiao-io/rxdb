import {
  createWorktreeCommands,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorktreeAsyncStates,
  type WorktreeCommands
} from '@aiao/rxdb-plugin-working-tree';
import { useRxDB } from '@aiao/rxdb-react';
import { useCallback, useMemo, useState } from 'react';

/** 四格状态连同产生它的库：换库后旧库的写回凭 `database` 识别并丢弃。 */
interface WorktreesSlot {
  readonly database: ReturnType<typeof useRxDB>;
  readonly states: WorktreeAsyncStates;
}

/**
 * {@link useWorktrees} 在当前 render 返回的只读检出位入口（US-313）。
 *
 * @remarks
 * 四个状态字段与核心的 `WorktreeAsyncStates` 一一对应，方法签名与插件包 `WorktreeManager` 上的同名方法一致。
 * 方法引用稳定（同一个库跨 render 复用同一组闭包），状态字段随相位变化产生新对象。
 * 三端同名、同字段、同签名：Angular `useWorktrees()`（`Signal`）、Vue `useWorktrees()`（`ComputedRef`）。
 * `RxDBProvider` 换了库时四格回到初态，旧库迟到的结果丢弃；Angular / Vue 的入口绑定创建时的库，换库靠重建组件。
 *
 * 打开得到的视图把 `view.rxdb` 交给 `RxDBProvider`，现有的查询 hook 照用；查询要用 `view.entityOf()` 换过的类。
 *
 * @public
 */
export type WorktreesResource = Readonly<WorktreeAsyncStates> & WorktreeCommands;

/**
 * 读写当前数据库的只读检出位。
 *
 * @returns 见 {@link WorktreesResource}
 * @throws 组件树中没有 Provider、或库没装工作树插件时抛错（与 `useWorkingTree()` 同语义）
 *
 * @remarks
 * 创建入口本身一次 IO 都不发：四格初值全是 `idle`，只有调了方法才读库。
 *
 * @example
 * ```tsx
 * const worktrees = useWorktrees();
 * const view = await worktrees.open({ branchId: 'feature' });
 * return <RxDBProvider db={view.rxdb}>{children}</RxDBProvider>;
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

  return useMemo(() => ({ ...slot.states, ...commands }), [slot.states, commands]);
};
