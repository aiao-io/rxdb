/**
 * @packageDocumentation
 * useWorkingTree Hook —— 工作树入口
 * 把「这个库启没启用、现在有多少未提交变更、改了什么、提交、丢弃、历史」六件事接成
 * Angular signal，供 local-first 应用直接绑到模板上
 */
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
  type WorkingTreeStatus
} from '@aiao/rxdb';
import { computed, signal, Signal } from '@angular/core';
import { useRxDB } from './rxdb.provider';

/**
 * {@link useWorkingTree} 的返回值。
 *
 * @remarks
 * 七个状态字段与核心的 `WorkingTreeAsyncStates` 一一对应，只是每一项各自装进 `Signal`：
 * 模板只读了 `statusState` 时，一次 `diff()` 的相位变化不会让它重新求值。七个方法的签名
 * 与核心 `WorkingTreeManager` 上的同名方法完全一致 —— 入参与返回值用的都是
 * `@aiao/rxdb` 那一份类型，本包**不重定义**（tri-framework-api.md §1）。
 *
 * 三端等价实现：React `useWorkingTree()`（渲染快照）、Vue `useWorkingTree()`
 * （`ComputedRef`），字段名、方法名与语义完全一致，只是容器形态不同。
 *
 * `restore()` / `restoreSession()` / `switchBranch` 的 `WorkingTreeSwitchBranchOptions`
 * 尚未在此出现：它们的核心实现属于后续阶段，三端入口一起补，不单端抢跑。
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
  /** 上一次 `commit()` 的相位；**没有 empty** —— 零未提交变更是 `empty_commit` 错误 */
  readonly commitState: Signal<WorkingTreeCommandState<CommitResult>>;
  /** 上一次 `discard()` 的相位；**没有 empty** —— `discardedCount: 0` 是成功的 no-op */
  readonly discardState: Signal<WorkingTreeCommandState<WorkingTreeDiscardResult>>;

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
 *       expectedBranchId: status.branchId,
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
 * **必须在 Angular 注入上下文中调用** —— 它经 `useRxDB()` 取库。七格状态挂在本次调用
 * 自己的 signal 上，没有跨组件共享的单例缓存。
 *
 * **创建入口本身一次 IO 都不发**：七格初值全是 `idle`，只有真的调了方法才会去读库。
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
  const { workingTree } = useRxDB();
  const states = signal<WorkingTreeAsyncStates>(WORKING_TREE_INITIAL_ASYNC_STATES);
  const commands = createWorkingTreeCommands(workingTree, (key, state) =>
    states.update(current => ({ ...current, [key]: state }))
  );

  return {
    isEnabledState: computed(() => states().isEnabledState),
    enableState: computed(() => states().enableState),
    statusState: computed(() => states().statusState),
    diffState: computed(() => states().diffState),
    listCommitsState: computed(() => states().listCommitsState),
    commitState: computed(() => states().commitState),
    discardState: computed(() => states().discardState),
    ...commands
  };
};
