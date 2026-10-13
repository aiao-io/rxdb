/**
 * @fileoverview 三端共用的异步状态契约（FR-023、contracts/tri-framework-api.md §4）。
 *
 * @remarks
 * 三端入口（`@aiao/rxdb-angular` / `-react` / `-vue` 的 `useWorktree()`）把工作树的
 * 十六件事各自摊成一个可观测状态。摊的规则只有这一份：**命令是 loading / success / error，
 * 查询在无结果时额外一个 empty**。
 *
 * 两条不可让步的性质：
 *
 * 1. **不给无 empty 语义的命令伪造 empty。** `commit()` 没有「空成功」——零未提交变更时
 *    核心抛 `empty_commit`（见 `commit-command.ts`），到这里就是 `error`；`discard()` 的
 *    `discardedCount === 0` 是一次明确的 no-op **结果**，落在 `success`。两者都不是「这里
 *    没有内容」。把它们画成 empty，用户会看到一个空状态插画，而他刚刚按下的按钮什么都
 *    没做——最需要出声的时刻反而最安静。这条性质写在**类型**里而不是注释里：
 *    {@link WorktreeCommandState} 的 `phase` 取值域里根本没有 `'empty'`，实现想伪造
 *    也没有可用的取值。
 * 2. **`CommitConflict` 不翻译成 error。** 它是可重试的**返回值**（§4）：调用本身成功了，
 *    结果是 `ok: false`。翻成 error 会让三端把一次正常的并发仲裁渲染成崩溃，而正确的
 *    出路是重新 `status()` 再提交一次。
 *
 * **`idle` 不是多余的第四个取值。** 入口创建时不偷偷发查询——三个框架的挂载时机各不相同，
 * 在 hook 里起一次数据库读会让「组件渲染」与「事务开始」绑定。于是「还没人问过」
 * （idle）、「正在问」（loading）、「问过了，没有」（empty）是三件不同的事；合并任意两件，
 * UI 就会在挂载瞬间转一次没有对应查询的圈。
 *
 * 判空谓词也在这里，理由同上：三端各写一遍 `entries.length === 0`，迟早有一端改成
 * 「`entryCount === 0`」，于是同一个库在 Angular 上是空、在 Vue 上不是。
 */

import type { CommitCapabilityInfo } from '../commit/commit-capability.js';
import type { CommitChangeSetPage } from '../commit/commit-changes.js';
import type { CommitLogPage } from '../commit/commit-log.js';
import type { WorktreeInfo } from '../worktree/worktree-command.js';
import type { CommitResult } from './commit-command.js';
import type { WorktreeDiff } from './diff.js';
import type { WorktreeDiscardResult } from './discard-command.js';
import type { WorktreeRestoreResult, WorktreeRestoreSessionInfo } from './restore-command.js';
import type { WorktreeStatus } from './status.js';
import type { WorktreeEnableIfEmptyResult } from './working-tree-facade.js';

/** 还没人发起过这次调用。 */
export interface WorktreeIdleState {
  /** 判别位 */
  readonly phase: 'idle';
}

/** 调用已经发出、还没落地。 */
export interface WorktreeLoadingState {
  /** 判别位 */
  readonly phase: 'loading';
}

/** 调用成功，`value` 是它的返回值。 */
export interface WorktreeSuccessState<T> {
  /** 判别位 */
  readonly phase: 'success';

  /** 原样的返回值；`CommitResult.ok === false` 的冲突也走这里 */
  readonly value: T;
}

/**
 * 调用成功，且结果是**有语义的空**。
 *
 * @remarks
 * `value` 照样在：empty 是 success 的细化，不是替代。丢掉值的话，一次空的 `status()`
 * 里那三个 revision 就读不到了，调用方为了拿它们必须再查一次——而那一次拿到的可能已经
 * 不是同一时刻的库。
 */
export interface WorktreeEmptyState<T> {
  /** 判别位 */
  readonly phase: 'empty';

  /** 原样的返回值，只是它是空的 */
  readonly value: T;
}

/** 调用抛错；错误已归一化成 `Error`，原实例原样透传。 */
export interface WorktreeErrorState {
  /** 判别位 */
  readonly phase: 'error';

  /** 抛出来的错误；`instanceof` 与 `code` 都保留 */
  readonly error: Error;
}

/**
 * 命令的可观测状态：**没有 empty**（§4）。
 *
 * @remarks
 * `enable()` / `commit()` / `discard()` / `restore()` 与 `isEnabled()` 用它。`isEnabled()`
 * 是一次读，却不用查询状态：`boolean` 没有「空」这一形态，给它一个 empty 只能是伪造。
 * `restore()` 同理走命令：`restoredCount: 0` 是一次什么都没写的 **no-op 结果**（FR-042），
 * 与 `discard()` 的 `discardedCount: 0` 同形，不是「这里没有内容」。
 */
export type WorktreeCommandState<T> =
  WorktreeIdleState | WorktreeLoadingState | WorktreeSuccessState<T> | WorktreeErrorState;

/**
 * 查询的可观测状态：比命令**恰好多一个** empty（§4）。
 *
 * @remarks
 * 只有六件事有 empty 语义：`status()` 无未提交变更、`diff()` 无可展示改动、
 * `listCommits()` 无历史、`commitChanges()` 无变更单元（基线节点）、`restoreSession()`
 * 无未结束会话、`listWorktrees()` 无 worktree。判据分别是 {@link isWorktreeStatusEmpty}、
 * {@link isWorktreeDiffEmpty}、{@link isCommitLogPageEmpty}、`isCommitChangeSetPageEmpty()`、
 * {@link isWorktreeRestoreSessionEmpty}、{@link isWorktreeListEmpty}。
 */
export type WorktreeQueryState<T> =
  WorktreeIdleState | WorktreeLoadingState | WorktreeSuccessState<T> | WorktreeEmptyState<T> | WorktreeErrorState;

/**
 * 三端入口持有的全部状态，一项能力一个字段。
 *
 * @remarks
 * 键集是 US-306 阶段 C 收口的六项，加上 T110 补进来的 `restore()` / `restoreSession()`，
 * 再加 T123 补进来的 `switchBranch()`，加上 commit 明细侧的 `commitChanges()`，
 * 与 auto-enable 补进来的 `enableIfEmpty()`——tri-framework-api.md §3 清单十二项；US-310 再加命名
 * worktree 的四项（`listWorktrees()` 查询与 create / switch / remove 三个命令），共十六项。
 *
 * `switchBranchState` 走**命令**状态而不是查询：切分支没有「空」这一形态，成功就是切过去了
 * （`VersionManager.switchBranch()` 返回 `void`），被 `requireClean` 拒掉则是一次
 * `WorktreeDirtyError`，落在 `error` 相位。切到当前分支是一次 no-op **成功**，
 * 与 `discard()` 的 `discardedCount: 0` 同形，不是「这里没有内容」。
 *
 * 做成一个记录而不是十六个独立容器：三端的响应式原语都按「一次写入触发一次通知」工作，
 * 十六个容器就是十六条通知路径，而一次 `commit()` 会同时改 `commitState` 与 `statusState`
 * （命令成功后刷新摘要）——两条路径先后到达时，UI 会看到「提交成功了但摘要还是旧的」
 * 这一帧。
 */
export interface WorktreeAsyncStates {
  /** `isEnabled()` 的状态 */
  readonly isEnabledState: WorktreeCommandState<boolean>;

  /** `enable()` 的状态 */
  readonly enableState: WorktreeCommandState<CommitCapabilityInfo>;

  /** `enableIfEmpty()` 的状态；**没有 empty** —— `not_empty` 是结果，不是「没有内容」 */
  readonly enableIfEmptyState: WorktreeCommandState<WorktreeEnableIfEmptyResult>;

  /** `status()` 的状态；空即「没有未提交变更」 */
  readonly statusState: WorktreeQueryState<WorktreeStatus>;

  /** `diff()` 的状态；空即「没有可展示的改动」 */
  readonly diffState: WorktreeQueryState<WorktreeDiff>;

  /** `listCommits()` 的状态；空即「这个分支还没有历史」 */
  readonly listCommitsState: WorktreeQueryState<CommitLogPage>;

  /** `commitChanges()` 的状态；空即「这个 commit 没有任何变更单元」（基线节点） */
  readonly commitChangesState: WorktreeQueryState<CommitChangeSetPage>;

  /** `commit()` 的状态；**没有 empty** */
  readonly commitState: WorktreeCommandState<CommitResult>;

  /** `discard()` 的状态；**没有 empty** */
  readonly discardState: WorktreeCommandState<WorktreeDiscardResult>;

  /** `restore()` 的状态；**没有 empty** —— 四个被拒成因与 `restoredCount: 0` 都是结果 */
  readonly restoreState: WorktreeCommandState<WorktreeRestoreResult>;

  /** `restoreSession()` 的状态；空即「当前分支没有未结束的恢复会话」 */
  readonly restoreSessionState: WorktreeQueryState<WorktreeRestoreSessionInfo | null>;

  /** `switchBranch()` 的状态；**没有 empty** —— 切换只有「切过去了」与「被拒/出错」两种结局 */
  readonly switchBranchState: WorktreeCommandState<void>;

  /** `listWorktrees()` 的状态；空即「一个 worktree 都没有」（零行是合法态） */
  readonly listWorktreesState: WorktreeQueryState<readonly WorktreeInfo[]>;

  /** `createWorktree()` 的状态；**没有 empty** —— 成功就是钉住并切过去了 */
  readonly createWorktreeState: WorktreeCommandState<WorktreeInfo>;

  /** `switchWorktree()` 的状态；**没有 empty** —— 与 `switchBranch()` 同形 */
  readonly switchWorktreeState: WorktreeCommandState<void>;

  /** `removeWorktree()` 的状态；**没有 empty** —— 被拒（当前所在 / 有未提交改动）是 `error` */
  readonly removeWorktreeState: WorktreeCommandState<void>;
}

/** 十六项全部「还没人问过」；三端入口的初值只有这一份。 */
export const WORKTREE_INITIAL_ASYNC_STATES: WorktreeAsyncStates = Object.freeze({
  isEnabledState: { phase: 'idle' },
  enableState: { phase: 'idle' },
  enableIfEmptyState: { phase: 'idle' },
  statusState: { phase: 'idle' },
  diffState: { phase: 'idle' },
  listCommitsState: { phase: 'idle' },
  commitChangesState: { phase: 'idle' },
  commitState: { phase: 'idle' },
  discardState: { phase: 'idle' },
  restoreState: { phase: 'idle' },
  restoreSessionState: { phase: 'idle' },
  switchBranchState: { phase: 'idle' },
  listWorktreesState: { phase: 'idle' },
  createWorktreeState: { phase: 'idle' },
  switchWorktreeState: { phase: 'idle' },
  removeWorktreeState: { phase: 'idle' }
} satisfies WorktreeAsyncStates);

/** 状态的去处；三端各自把它接到本框架的响应式原语上。 */
export type WorktreeStateSink<S> = (state: S) => void;

/** 把任意 throw 载荷归一化成 `Error`；`Error` 实例原样透传，保留子类、`code` 与堆栈。 */
const toError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));

/**
 * 跑一次命令，沿途发出 loading → success | error。
 *
 * @param emit - 状态去处
 * @param run - 真正的调用
 * @returns `run` 的返回值
 * @throws `run` 抛出的**原样**错误
 *
 * @remarks
 * **`loading` 在 `run()` 之前同步发出**，不是等到第一个 `await` 之后：`commit()` 期间
 * 不得静默（§4），而「等结果回来再补一个 loading」等于整个等待期都没有状态。
 *
 * **错误照样往上抛**，不吞成一个只有状态没有异常的调用：调用方的 `await commit()`
 * 必须能 reject，否则「提交失败」这件事只有订阅了状态的那部分 UI 知道。
 */
export const trackWorktreeCommand = async <T>(
  emit: WorktreeStateSink<WorktreeCommandState<T>>,
  run: () => Promise<T>
): Promise<T> => {
  emit({ phase: 'loading' });
  try {
    const value = await run();
    emit({ phase: 'success', value });
    return value;
  } catch (cause) {
    emit({ phase: 'error', error: toError(cause) });
    throw cause;
  }
};

/**
 * 跑一次查询，沿途发出 loading → success | empty | error。
 *
 * @param emit - 状态去处
 * @param isEmpty - 判空谓词；只在成功结果上求值
 * @param run - 真正的调用
 * @returns `run` 的返回值
 * @throws `run` 抛出的**原样**错误
 *
 * @remarks
 * 判空**只跑在成功结果上**：一次失败的查询不知道自己空不空，先发 empty 再发 error
 * 会让 UI 闪一下空状态插画。
 */
export const trackWorktreeQuery = async <T>(
  emit: WorktreeStateSink<WorktreeQueryState<T>>,
  isEmpty: (value: T) => boolean,
  run: () => Promise<T>
): Promise<T> => {
  emit({ phase: 'loading' });
  try {
    const value = await run();
    emit(isEmpty(value) ? { phase: 'empty', value } : { phase: 'success', value });
    return value;
  } catch (cause) {
    emit({ phase: 'error', error: toError(cause) });
    throw cause;
  }
};

/**
 * `status()` 的空：没有未提交变更。
 *
 * @remarks
 * 判的是 `entryCount` 而不是 `clean`：两者在健康的库上等价，而 `clean` 还要求
 * 「不在恢复中、无冲突」——一个正在恢复的空工作树按 `clean` 判会显示成「有内容」。
 */
export const isWorktreeStatusEmpty = (status: WorktreeStatus): boolean => status.entryCount === 0;

/**
 * `diff()` 的空：这一页没有可展示的改动。
 *
 * @remarks
 * **两个粒度各看各的那一边。** `diff.ts` 按 `granularity` 只填 `entries` 或 `transactions`，
 * 另一边恒为空数组；只判 `entries` 的话，事务粒度的 diff 永远是空——UI 在一个明明有改动的
 * 工作树上显示空状态插画，而 `commit()` 那边照常提交出一个非空的提交。
 */
export const isWorktreeDiffEmpty = (diff: WorktreeDiff): boolean =>
  diff.entries.length === 0 && diff.transactions.length === 0;

/** `listCommits()` 的空：这个分支还没有历史。 */
export const isCommitLogPageEmpty = (page: CommitLogPage): boolean => page.entries.length === 0;

/**
 * `restoreSession()` 的空：当前分支没有未结束的恢复会话。
 *
 * @remarks
 * 判的是**这一行在不在**，不是它健不健康。按 `status === 'active'` 判的话，`conflicted`
 * 的会话会在面板上凭空消失——而它仍占着 `activeKey` 的唯一索引、仍拦着下一次 restore、
 * 仍要用户处理掉。「还成不成立」的唯一出口是 `status()` 的 `restoring` / `conflicted`
 * 两位（见 `status.ts`），不在这里重算一遍。
 *
 * 一行 `=== null` 也值得一个名字：三端各写一遍的话，迟早有一端写成上面那个版本，
 * 于是同一个库在 Angular 上显示「恢复中」、在 Vue 上显示「没有恢复」。
 */
export const isWorktreeRestoreSessionEmpty = (session: WorktreeRestoreSessionInfo | null): boolean => session === null;

/**
 * `listWorktrees()` 的空：一个 worktree 都没有。
 *
 * @remarks
 * 零行是合法态：`0005-worktrees` 在零 active 的老库上不落主行，用户也可能把非当前的 worktree 全删了
 * （当前所在的那个删不掉，但当前 checkout 本来就可以没钉住）。
 */
export const isWorktreeListEmpty = (worktrees: readonly WorktreeInfo[]): boolean => worktrees.length === 0;
