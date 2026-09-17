import {
  createWorkingTreeCommands,
  WORKING_TREE_INITIAL_ASYNC_STATES,
  type CommitCapabilityInfo,
  type CommitLogOptions,
  type CommitLogPage,
  type CommitOptions,
  type CommitResult,
  type WorkingTreeAsyncStates,
  type WorkingTreeCommandState,
  type WorkingTreeDiff,
  type WorkingTreeDiffOptions,
  type WorkingTreeDiscardOptions,
  type WorkingTreeDiscardResult,
  type WorkingTreeQueryState,
  type WorkingTreeRestoreOptions,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreSessionInfo,
  type WorkingTreeRestoreTarget,
  type WorkingTreeStatus,
  type WorkingTreeSwitchBranchOptions
} from '@aiao/rxdb-plugin-working-tree';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed, shallowRef, type ComputedRef } from 'vue';

/**
 * {@link useWorkingTree} 的返回值。
 *
 * @remarks
 * 十个状态字段与核心的 `WorkingTreeAsyncStates` 一一对应，只是每一项各自装进
 * `ComputedRef`：成员可以安全解构，模板只读了 `statusState` 时，一次 `diff()` 的相位变化
 * 不会让它重新求值。十个方法的签名与插件包 `WorkingTreeManager`（`switchBranch` 那一个是
 * `VersionManager`）上的同名方法完全一致 —— 入参与返回值用的都是
 * `@aiao/rxdb-plugin-working-tree` 那一份类型，本包**不重定义**（tri-framework-api.md §1）。
 *
 * 三端等价实现：Angular `useWorkingTree()`（`Signal`）、React `useWorkingTree()`
 * （渲染快照），字段名、方法名与语义完全一致，只是容器形态不同。
 *
 * `restore()` 的四个被拒成因走**返回值**而不是异常，`restoreState` 因此也**没有 empty**：
 * 「被拒」与「一条都没恢复」都是结果，不是「没有结果」。`restoreSessionState` 的空则只有一个
 * 含义 —— 当前分支没有未结束的恢复会话；`conflicted` 的会话照样**不是**空，它仍占着唯一索引、
 * 仍拦着下一次恢复。
 *
 * `switchBranch(branchId, options?)` 的 `WorkingTreeSwitchBranchOptions` 由 T123 接进来：
 * 不传第二参时与今天逐字节一致（无条件切换），`{ requireClean: true }` 在工作树非空时**抛**
 * `WorkingTreeDirtyError` —— 被拒不是返回值，因为那一刻分支根本没切。
 *
 * @public
 */
export interface WorkingTreeResource {
  /** 这个库启没启用提交能力；`boolean` 没有空形态，因此**没有 empty 相位** */
  readonly isEnabledState: ComputedRef<WorkingTreeCommandState<boolean>>;
  /** 上一次 `enable()` 的相位 */
  readonly enableState: ComputedRef<WorkingTreeCommandState<CommitCapabilityInfo>>;
  /** 工作树摘要的相位；干净工作树是 `empty`，**带着**那份 status */
  readonly statusState: ComputedRef<WorkingTreeQueryState<WorkingTreeStatus>>;
  /** 未提交改动的相位；零条目是 `empty` */
  readonly diffState: ComputedRef<WorkingTreeQueryState<WorkingTreeDiff>>;
  /** 提交历史的相位；空历史是 `empty` */
  readonly listCommitsState: ComputedRef<WorkingTreeQueryState<CommitLogPage>>;
  /** 上一次 `commit()` 的相位；**没有 empty** —— 零未提交变更是 `empty_commit` 错误 */
  readonly commitState: ComputedRef<WorkingTreeCommandState<CommitResult>>;
  /** 上一次 `discard()` 的相位；**没有 empty** —— `discardedCount: 0` 是成功的 no-op */
  readonly discardState: ComputedRef<WorkingTreeCommandState<WorkingTreeDiscardResult>>;
  /** 上一次 `restore()` 的相位；**没有 empty** —— 四个被拒成因与 `restoredCount: 0` 都是结果 */
  readonly restoreState: ComputedRef<WorkingTreeCommandState<WorkingTreeRestoreResult>>;
  /** 未结束恢复会话的相位；没有会话是 `empty`，**带着**那个 `null` */
  readonly restoreSessionState: ComputedRef<WorkingTreeQueryState<WorkingTreeRestoreSessionInfo | null>>;
  /** 上一次 `switchBranch()` 的相位；**没有 empty** —— 切到当前分支是成功的 no-op */
  readonly switchBranchState: ComputedRef<WorkingTreeCommandState<void>>;

  /** 读取这个库启没启用提交能力。 */
  readonly isEnabled: () => Promise<boolean>;
  /** 启用提交能力；成功后自动重读一次 status。 */
  readonly enable: () => Promise<CommitCapabilityInfo>;
  /** 读当前分支的工作树摘要。 */
  readonly status: () => Promise<WorkingTreeStatus>;
  /** 读当前分支相对 HEAD 的未提交改动。 */
  readonly diff: (options?: WorkingTreeDiffOptions) => Promise<WorkingTreeDiff>;
  /** 读当前分支的可达提交历史。 */
  readonly listCommits: (options?: CommitLogOptions) => Promise<CommitLogPage>;
  /** 提交工作树里的**全部**未提交单元；CAS 落败走返回值，不是异常。 */
  readonly commit: (message: string, options: CommitOptions) => Promise<CommitResult>;
  /** 把工作树整体退回 HEAD；成功后自动重读一次 status。 */
  readonly discard: (options: WorkingTreeDiscardOptions) => Promise<WorkingTreeDiscardResult>;
  /** 把一个可达历史 commit 的内容写回工作树；被拒走返回值，不是异常。成功与否都重读 status。 */
  readonly restore: (
    target: WorkingTreeRestoreTarget,
    options: WorkingTreeRestoreOptions
  ) => Promise<WorkingTreeRestoreResult>;
  /** 读当前分支那个未结束的恢复会话；没有就是 `null`。 */
  readonly restoreSession: () => Promise<WorkingTreeRestoreSessionInfo | null>;
  /** 切到另一条分支；被 `requireClean` 拒掉时抛 `WorkingTreeDirtyError`。成功后自动重读一次 status。 */
  readonly switchBranch: (branchId: string, options?: WorkingTreeSwitchBranchOptions) => Promise<void>;
}

/**
 * 读写当前数据库的工作树。
 *
 * @returns 见 {@link WorkingTreeResource}
 * @throws 没有 provider、数据库尚未就绪时各抛一条不同的文案；异步 source 创建失败时
 *   原样抛出创建异常（与 `useRxDB` 同语义）
 *
 * @example
 * ```vue
 * <script lang="ts" setup>
 * import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';
 *
 * const tree = useWorkingTree();
 * await tree.status();
 * </script>
 *
 * <template>
 *   <span v-if="tree.statusState.value.phase === 'empty'">没有未提交的改动</span>
 *   <span v-else-if="tree.statusState.value.phase === 'success'">
 *     {{ tree.statusState.value.value.entryCount }} 条未提交
 *   </span>
 * </template>
 * ```
 *
 * @remarks
 * **必须在 setup 中调用** —— 它经 `useRxDB()` 取库（`inject` 只在 setup 期可用）。
 *
 * **创建入口本身一次 IO 都不发**：十格初值全是 `idle`，只有真的调了方法才会去读库。
 * 挂上就查会让每个只想拿到 `commit()` 的组件在挂载时白发一轮查询。
 *
 * **没有变更流**：状态只在经本入口发出的命令之后更新，因此这里也没有需要退订的订阅。
 * 别的标签页写进来的改动、直接走 `entity.save()` 的写入，都不会推一份新的 status 过来
 * —— 需要最新值就再调一次 `status()`。这是核心侧至今没有工作树变更流的如实反映，
 * 不是这里省了一步。
 *
 * 状态装在 `shallowRef` 里：整份状态每次都是新对象，深响应只会让 Vue 白白遍历十棵
 * 结构固定的树。
 *
 * 数据库取不到时**抛错而不是**返回一份「一切干净」的默认值：那会把「入口没接上」
 * 伪装成「没有未提交变更」，恰好是最需要出声的时候不出声。
 *
 * @public
 */
export const useWorkingTree = (): WorkingTreeResource => {
  // 取整个库而不是解构 `workingTree`：清单第十项 `switchBranch` 挂在 `versionManager` 上，
  // 两个入口都由命令层去取（见 `createWorkingTreeCommands` 的同名注记）。
  const database = useRxDB();
  const states = shallowRef<WorkingTreeAsyncStates>(WORKING_TREE_INITIAL_ASYNC_STATES);
  const commands = createWorkingTreeCommands(database, (key, state) => {
    states.value = { ...states.value, [key]: state };
  });

  return {
    isEnabledState: computed(() => states.value.isEnabledState),
    enableState: computed(() => states.value.enableState),
    statusState: computed(() => states.value.statusState),
    diffState: computed(() => states.value.diffState),
    listCommitsState: computed(() => states.value.listCommitsState),
    commitState: computed(() => states.value.commitState),
    discardState: computed(() => states.value.discardState),
    restoreState: computed(() => states.value.restoreState),
    restoreSessionState: computed(() => states.value.restoreSessionState),
    switchBranchState: computed(() => states.value.switchBranchState),
    ...commands
  };
};
