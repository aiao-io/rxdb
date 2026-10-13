// 只取这四个：React 侧的容器就是「普通只读值」，于是 `WorktreeResource` 能直接由核心的
// 两个类型交出来，不必逐字段重抄一遍签名。Angular / Vue 各自把每一格套进 `Signal` /
// `ComputedRef`，只能展开写 —— 那是容器形态的差异，不是 API 的差异。
//
// 这条差异兑现过两次：T110 的 `restore()` / `restoreSession()` 与 US-310 的四个 worktree 命令进核心之后，
// 本端一个字段都不用加，另外两端各要补对应的状态格、方法声明与 computed。
import {
  createWorktreeCommands,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorktreeAsyncStates,
  type WorktreeCommands
} from '@aiao/rxdb-plugin-worktree';
import { useRxDB } from '@aiao/rxdb-react';
import { useCallback, useMemo, useState } from 'react';

/** 十六格状态连同产生它的库：换库后旧库的写回凭 `database` 识别并丢弃。 */
interface WorktreeSlot {
  readonly database: ReturnType<typeof useRxDB>;
  readonly states: WorktreeAsyncStates;
}

/**
 * {@link useWorktree} 在当前 render 返回的工作树入口。
 *
 * @remarks
 * 十六个状态字段与核心的 `WorktreeAsyncStates` 一一对应，取值就是普通只读值，可以直接
 * 解构。十六个方法的签名与插件包 `WorktreeManager`（`switchBranch` 那一个是 `VersionManager`）
 * 上的同名方法完全一致 —— 入参与返回值用的都是 `@aiao/rxdb-plugin-worktree` 那一份类型，
 * 本包**不重定义**（tri-framework-api.md §1）。
 *
 * 方法**引用稳定**（同一个库跨 render 复用同一组闭包），因此可以安全地放进 `useEffect`
 * / `useMemo` 的依赖数组；状态字段则随每一次相位变化产生新对象，这正是重渲染的触发源。
 *
 * 三端等价实现：Angular `useWorktree()`（`Signal`）、Vue `useWorktree()`
 * （`ComputedRef`），字段名、方法名与语义完全一致，只是容器形态不同。
 *
 * `restore()` 的四个被拒成因走**返回值**而不是异常，`restoreState` 因此也**没有 empty**：
 * 「被拒」与「一条都没恢复」都是结果，不是「没有结果」。`restoreSessionState` 的空则只有一个
 * 含义 —— 当前分支没有未结束的恢复会话；`conflicted` 的会话照样**不是**空，它仍占着唯一索引、
 * 仍拦着下一次恢复。
 *
 * `switchBranch(branchId, options?)` 的 `WorktreeSwitchBranchOptions` 由 T123 接进来：
 * 不传第二参时与今天逐字节一致（无条件切换），`{ requireClean: true }` 在工作树非空时**抛**
 * `WorktreeDirtyError` —— 被拒不是返回值，因为那一刻分支根本没切。
 *
 * @public
 */
export type WorktreeResource = Readonly<WorktreeAsyncStates> & WorktreeCommands;

/**
 * 读写当前数据库的工作树。
 *
 * @returns 见 {@link WorktreeResource}
 * @throws 组件树中没有 Provider、Provider 没拿到 `db`、异步 source 尚未就绪时各抛一条
 *   不同的文案；异步 source 创建失败时原样抛出创建异常（与 `useRxDB` 同语义）
 *
 * @example
 * ```tsx
 * const tree = useWorktree();
 *
 * useEffect(() => void tree.status().catch(() => undefined), [tree.status]);
 *
 * if (tree.statusState.phase === 'empty') return <span>没有未提交的改动</span>;
 * if (tree.statusState.phase === 'success') {
 *   return <span>{tree.statusState.value.entryCount} 条未提交</span>;
 * }
 * return null;
 * ```
 *
 * @remarks
 * **创建入口本身一次 IO 都不发**：十六格初值全是 `idle`，只有真的调了方法才会去读库。
 * 挂上就查会让每个只想拿到 `commit()` 的组件在挂载时白发一轮查询 —— 而 React 下这还会
 * 在 `StrictMode` 里变成两轮。
 *
 * **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、直接走
 * `entity.save()` 的写入，都不会触发重渲染 —— 需要最新值就再调一次 `status()`。这是核心
 * 侧至今没有工作树变更流的如实反映，不是这里省了一步。
 *
 * 状态用 `useState` 而不是 `useSyncExternalStore`：状态源就在 React 里（本 hook 自己的
 * 命令产生它），不是外部 store，没有撕裂可言。
 *
 * 数据库取不到时**抛错而不是**返回一份「一切干净」的默认值：那会把「入口没接上」
 * 伪装成「没有未提交变更」，恰好是最需要出声的时候不出声。
 *
 * @public
 */
export const useWorktree = (): WorktreeResource => {
  // 取整个库而不是解构 `worktree`：清单第十一项 `switchBranch` 挂在 `versionManager` 上，
  // 两个入口都由命令层去取（见 `createWorktreeCommands` 的同名注记）。
  const database = useRxDB();
  // RV-069：状态与产生它的库绑在同一份 state 里。库身份变了就在本次 render 收回初态
  // （React 认可的「渲染期调整状态」写法，不会闪一帧旧库状态）；旧库命令晚到的写回在
  // updater 里比对归属，不是当前库就原样丢弃。不用 ref 记「最新库」：渲染期写 ref 在
  // 并发渲染被丢弃时会与已提交的库错位，旧库命令的结果从此全被吞掉。
  const [slot, setSlot] = useState<WorktreeSlot>(() => ({ database, states: WORKTREE_INITIAL_ASYNC_STATES }));
  if (slot.database !== database) setSlot({ database, states: WORKTREE_INITIAL_ASYNC_STATES });

  // 函数式更新：命令的闭包活得比某一次 render 长，读 `states` 会读到发起那一刻的旧值，
  // 于是两个并发的命令里后写的那个会把先写的那格覆盖回去。
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
