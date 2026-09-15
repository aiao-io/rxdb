// 只取这四个：React 侧的容器就是「普通只读值」，于是 `WorkingTreeResource` 能直接由核心的
// 两个类型交出来，不必逐字段重抄一遍签名。Angular / Vue 各自把七格套进 `Signal` /
// `ComputedRef`，只能展开写 —— 那是容器形态的差异，不是 API 的差异。
import {
  createWorkingTreeCommands,
  WORKING_TREE_INITIAL_ASYNC_STATES,
  type WorkingTreeAsyncStates,
  type WorkingTreeCommands
} from '@aiao/rxdb';
import { useCallback, useMemo, useState } from 'react';
import { useRxDB } from './rxdb-react.js';

/**
 * {@link useWorkingTree} 在当前 render 返回的工作树入口。
 *
 * @remarks
 * 七个状态字段与核心的 `WorkingTreeAsyncStates` 一一对应，取值就是普通只读值，可以直接
 * 解构。七个方法的签名与核心 `WorkingTreeManager` 上的同名方法完全一致 —— 入参与返回值
 * 用的都是 `@aiao/rxdb` 那一份类型，本包**不重定义**（tri-framework-api.md §1）。
 *
 * 方法**引用稳定**（同一个库跨 render 复用同一组闭包），因此可以安全地放进 `useEffect`
 * / `useMemo` 的依赖数组；状态字段则随每一次相位变化产生新对象，这正是重渲染的触发源。
 *
 * 三端等价实现：Angular `useWorkingTree()`（`Signal`）、Vue `useWorkingTree()`
 * （`ComputedRef`），字段名、方法名与语义完全一致，只是容器形态不同。
 *
 * `restore()` / `restoreSession()` / `switchBranch` 的 `WorkingTreeSwitchBranchOptions`
 * 尚未在此出现：它们的核心实现属于后续阶段，三端入口一起补，不单端抢跑。
 *
 * @public
 */
export type WorkingTreeResource = Readonly<WorkingTreeAsyncStates> & WorkingTreeCommands;

/**
 * 读写当前数据库的工作树。
 *
 * @returns 见 {@link WorkingTreeResource}
 * @throws 组件树中没有 Provider、Provider 没拿到 `db`、异步 source 尚未就绪时各抛一条
 *   不同的文案；异步 source 创建失败时原样抛出创建异常（与 `useRxDB` 同语义）
 *
 * @example
 * ```tsx
 * const tree = useWorkingTree();
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
 * **创建入口本身一次 IO 都不发**：七格初值全是 `idle`，只有真的调了方法才会去读库。
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
export const useWorkingTree = (): WorkingTreeResource => {
  const { workingTree } = useRxDB();
  const [states, setStates] = useState<WorkingTreeAsyncStates>(WORKING_TREE_INITIAL_ASYNC_STATES);

  // 函数式更新：命令的闭包活得比某一次 render 长，读 `states` 会读到发起那一刻的旧值，
  // 于是两个并发的命令里后写的那个会把先写的那格覆盖回去。
  const patch = useCallback<Parameters<typeof createWorkingTreeCommands>[1]>(
    (key, state) => setStates(current => ({ ...current, [key]: state })),
    []
  );
  const commands = useMemo(() => createWorkingTreeCommands(workingTree, patch), [workingTree, patch]);

  return useMemo(() => ({ ...states, ...commands }), [states, commands]);
};
