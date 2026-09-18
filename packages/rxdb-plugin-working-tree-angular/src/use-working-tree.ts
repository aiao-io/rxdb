/**
 * @packageDocumentation
 * useWorkingTree Hook —— 工作树入口
 * 把「这个库启没启用、现在有多少未提交变更、改了什么、提交、丢弃、历史、把某个历史版本恢复
 * 回来」这些事接成 Angular signal，供 local-first 应用直接绑到模板上
 */
import { useRxDB } from '@aiao/rxdb-angular';
import {
  createWorkingTreeCommands,
  WORKING_TREE_INITIAL_ASYNC_STATES,
  type CommitCapabilityInfo,
  type CommitChangeSetPage,
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
import { computed, signal, Signal } from '@angular/core';

/**
 * {@link useWorkingTree} 的返回值。
 *
 * @remarks
 * 十一个状态字段与核心的 `WorkingTreeAsyncStates` 一一对应，只是每一项各自装进 `Signal`：
 * 模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。十一个方法的签名
 * 与插件包 `WorkingTreeManager`（`switchBranch` 那一个是 `VersionManager`）上的同名方法完全
 * 一致 —— 入参与返回值用的都是 `@aiao/rxdb-plugin-working-tree` 那一份类型，
 * 本包**不重定义**（tri-framework-api.md §1）。
 *
 * 三端等价实现：React `useWorkingTree()`（渲染快照）、Vue `useWorkingTree()`
 * （`ComputedRef`），字段名、方法名与语义完全一致，只是容器形态不同。
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
  readonly isEnabledState: Signal<WorkingTreeCommandState<boolean>>;
  /** 上一次 `enable()` 的相位 */
  readonly enableState: Signal<WorkingTreeCommandState<CommitCapabilityInfo>>;
  /** 工作树摘要的相位；干净工作树是 `empty`，**带着**那份 status */
  readonly statusState: Signal<WorkingTreeQueryState<WorkingTreeStatus>>;
  /** 未提交改动的相位；零条目是 `empty` */
  readonly diffState: Signal<WorkingTreeQueryState<WorkingTreeDiff>>;
  /** 提交历史的相位；空历史是 `empty` */
  readonly listCommitsState: Signal<WorkingTreeQueryState<CommitLogPage>>;
  /** 单个 commit 变更集的相位；零变更单元（基线节点）是 `empty` */
  readonly commitChangesState: Signal<WorkingTreeQueryState<CommitChangeSetPage>>;
  /** 上一次 `commit()` 的相位；**没有 empty** —— 零未提交变更是 `empty_commit` 错误 */
  readonly commitState: Signal<WorkingTreeCommandState<CommitResult>>;
  /** 上一次 `discard()` 的相位；**没有 empty** —— `discardedCount: 0` 是成功的 no-op */
  readonly discardState: Signal<WorkingTreeCommandState<WorkingTreeDiscardResult>>;
  /** 上一次 `restore()` 的相位；**没有 empty** —— 四个被拒成因与 `restoredCount: 0` 都是结果 */
  readonly restoreState: Signal<WorkingTreeCommandState<WorkingTreeRestoreResult>>;
  /** 未结束恢复会话的相位；没有会话是 `empty`，**带着**那个 `null` */
  readonly restoreSessionState: Signal<WorkingTreeQueryState<WorkingTreeRestoreSessionInfo | null>>;
  /** 上一次 `switchBranch()` 的相位；**没有 empty** —— 切到当前分支是成功的 no-op */
  readonly switchBranchState: Signal<WorkingTreeCommandState<void>>;

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
  /** 读一个 commit 的全部变更单元。 */
  readonly commitChanges: (commitId: string) => Promise<CommitChangeSetPage>;
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
 * @throws 没有 `provideRxDB`、数据库尚未就绪，或创建失败时抛错（与 `useRxDB` 同语义）
 *
 * @example
 * ```typescript
 * @Component({
 *   template: `
 *     @switch (tree.statusState().phase) {
 *       @case ('loading') { <span>读取中…</span> }
 *       @case ('empty') { <span>没有未提交的改动</span> }
 *       @case ('success') { <span>{{ tree.statusState().value.entryCount }} 条未提交</span> }
 *     }
 *     <button [disabled]="tree.commitState().phase === 'loading'" (click)="save()">提交</button>
 *   `
 * })
 * export class CommitBar {
 *   readonly tree = useWorkingTree();
 *   async save(): Promise<void> {
 *     const status = await this.tree.status();
 *     const result = await this.tree.commit('保存', {
 *       expectedBranch: {
 *         branchId: status.branchId,
 *         activationRevision: status.activationRevision
 *       },
 *       expectedHeadRevision: status.headRevision,
 *       expectedWorkingTreeRevision: status.workingTreeRevision,
 *       authorId: 'alice',
 *       operationId: crypto.randomUUID()
 *     });
 *     if (!result.ok) console.warn('别人先提交了，重试即可', result.conflict);
 *   }
 * }
 * ```
 *
 * @remarks
 * **必须在 Angular 注入上下文中调用** —— 它经 `useRxDB()` 取库。十格状态挂在本次调用
 * 自己的 signal 上，没有跨组件共享的单例缓存。
 *
 * **创建入口本身一次 IO 都不发**：十一格初值全是 `idle`，只有真的调了方法才会去读库。
 * 挂上就查会让每个只想拿到 `commit()` 的组件在挂载时白发一轮查询。
 *
 * **没有变更流**：状态只在经本入口发出的命令之后更新。别的标签页写进来的改动、
 * 直接走 `entity.save()` 的写入，都不会推一份新的 status 过来 —— 需要最新值就再调一次
 * `status()`。这是核心侧至今没有工作树变更流的如实反映，不是这里省了一步。
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
  const states = signal<WorkingTreeAsyncStates>(WORKING_TREE_INITIAL_ASYNC_STATES);
  const commands = createWorkingTreeCommands(database, (key, state) =>
    states.update(current => ({ ...current, [key]: state }))
  );

  return {
    isEnabledState: computed(() => states().isEnabledState),
    enableState: computed(() => states().enableState),
    statusState: computed(() => states().statusState),
    diffState: computed(() => states().diffState),
    listCommitsState: computed(() => states().listCommitsState),
    commitChangesState: computed(() => states().commitChangesState),
    commitState: computed(() => states().commitState),
    discardState: computed(() => states().discardState),
    restoreState: computed(() => states().restoreState),
    restoreSessionState: computed(() => states().restoreSessionState),
    switchBranchState: computed(() => states().switchBranchState),
    ...commands
  };
};
