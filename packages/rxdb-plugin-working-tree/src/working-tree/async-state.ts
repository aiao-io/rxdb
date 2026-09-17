/**
 * @fileoverview 三端共用的异步状态契约（FR-023、contracts/tri-framework-api.md §4）。
 *
 * @remarks
 * 三端入口（`@aiao/rxdb-angular` / `-react` / `-vue` 的 `useWorkingTree()`）把工作树的
 * 十件事各自摊成一个可观测状态。摊的规则只有这一份：**命令是 loading / success / error，
 * 查询在无结果时额外一个 empty**。
 *
 * 两条不可让步的性质：
 *
 * 1. **不给无 empty 语义的命令伪造 empty。** `commit()` 没有「空成功」——零未提交变更时
 *    核心抛 `empty_commit`（见 `commit-command.ts`），到这里就是 `error`；`discard()` 的
 *    `discardedCount === 0` 是一次明确的 no-op **结果**，落在 `success`。两者都不是「这里
 *    没有内容」。把它们画成 empty，用户会看到一个空状态插画，而他刚刚按下的按钮什么都
 *    没做——最需要出声的时刻反而最安静。这条性质写在**类型**里而不是注释里：
 *    {@link WorkingTreeCommandState} 的 `phase` 取值域里根本没有 `'empty'`，实现想伪造
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
import type { CommitLogPage } from '../commit/commit-log.js';
import type { CommitResult } from './commit-command.js';
import type { WorkingTreeDiff } from './diff.js';
import type { WorkingTreeDiscardResult } from './discard-command.js';
import type { WorkingTreeRestoreResult, WorkingTreeRestoreSessionInfo } from './restore-command.js';
import type { WorkingTreeStatus } from './status.js';

/** 还没人发起过这次调用。 */
export interface WorkingTreeIdleState {
  /** 判别位 */
  readonly phase: 'idle';
}

/** 调用已经发出、还没落地。 */
export interface WorkingTreeLoadingState {
  /** 判别位 */
  readonly phase: 'loading';
}

/** 调用成功，`value` 是它的返回值。 */
export interface WorkingTreeSuccessState<T> {
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
export interface WorkingTreeEmptyState<T> {
  /** 判别位 */
  readonly phase: 'empty';

  /** 原样的返回值，只是它是空的 */
  readonly value: T;
}

/** 调用抛错；错误已归一化成 `Error`，原实例原样透传。 */
export interface WorkingTreeErrorState {
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
export type WorkingTreeCommandState<T> =
  WorkingTreeIdleState | WorkingTreeLoadingState | WorkingTreeSuccessState<T> | WorkingTreeErrorState;

/**
 * 查询的可观测状态：比命令**恰好多一个** empty（§4）。
 *
 * @remarks
 * 只有四件事有 empty 语义：`status()` 无未提交变更、`diff()` 无可展示改动、
 * `listCommits()` 无历史、`restoreSession()` 无未结束会话。判据分别是
 * {@link isWorkingTreeStatusEmpty}、{@link isWorkingTreeDiffEmpty}、
 * {@link isCommitLogPageEmpty}、{@link isWorkingTreeRestoreSessionEmpty}。
 */
export type WorkingTreeQueryState<T> =
  | WorkingTreeIdleState
  | WorkingTreeLoadingState
  | WorkingTreeSuccessState<T>
  | WorkingTreeEmptyState<T>
  | WorkingTreeErrorState;

/**
 * 三端入口持有的全部状态，一项能力一个字段。
 *
 * @remarks
 * 键集是 US-306 阶段 C 收口的六项，加上 T110 补进来的 `restore()` / `restoreSession()`，
 * 再加 T123 补进来的 `switchBranch()`——tri-framework-api.md §3 清单十项到齐。
 *
 * `switchBranchState` 走**命令**状态而不是查询：切分支没有「空」这一形态，成功就是切过去了
 * （`VersionManager.switchBranch()` 返回 `void`），被 `requireClean` 拒掉则是一次
 * `WorkingTreeDirtyError`，落在 `error` 相位。切到当前分支是一次 no-op **成功**，
 * 与 `discard()` 的 `discardedCount: 0` 同形，不是「这里没有内容」。
 *
 * 做成一个记录而不是十个独立容器：三端的响应式原语都按「一次写入触发一次通知」工作，
 * 十个容器就是十条通知路径，而一次 `commit()` 会同时改 `commitState` 与 `statusState`
 * （命令成功后刷新摘要）——两条路径先后到达时，UI 会看到「提交成功了但摘要还是旧的」
 * 这一帧。
 */
export interface WorkingTreeAsyncStates {
  /** `isEnabled()` 的状态 */
  readonly isEnabledState: WorkingTreeCommandState<boolean>;

  /** `enable()` 的状态 */
  readonly enableState: WorkingTreeCommandState<CommitCapabilityInfo>;

  /** `status()` 的状态；空即「没有未提交变更」 */
  readonly statusState: WorkingTreeQueryState<WorkingTreeStatus>;

  /** `diff()` 的状态；空即「没有可展示的改动」 */
  readonly diffState: WorkingTreeQueryState<WorkingTreeDiff>;

  /** `listCommits()` 的状态；空即「这个分支还没有历史」 */
  readonly listCommitsState: WorkingTreeQueryState<CommitLogPage>;

  /** `commit()` 的状态；**没有 empty** */
  readonly commitState: WorkingTreeCommandState<CommitResult>;

  /** `discard()` 的状态；**没有 empty** */
  readonly discardState: WorkingTreeCommandState<WorkingTreeDiscardResult>;

  /** `restore()` 的状态；**没有 empty** —— 四个被拒成因与 `restoredCount: 0` 都是结果 */
  readonly restoreState: WorkingTreeCommandState<WorkingTreeRestoreResult>;

  /** `restoreSession()` 的状态；空即「当前分支没有未结束的恢复会话」 */
  readonly restoreSessionState: WorkingTreeQueryState<WorkingTreeRestoreSessionInfo | null>;

  /** `switchBranch()` 的状态；**没有 empty** —— 切换只有「切过去了」与「被拒/出错」两种结局 */
  readonly switchBranchState: WorkingTreeCommandState<void>;
}

/** 十项全部「还没人问过」；三端入口的初值只有这一份。 */
export const WORKING_TREE_INITIAL_ASYNC_STATES: WorkingTreeAsyncStates = Object.freeze({
  isEnabledState: { phase: 'idle' },
  enableState: { phase: 'idle' },
  statusState: { phase: 'idle' },
  diffState: { phase: 'idle' },
  listCommitsState: { phase: 'idle' },
  commitState: { phase: 'idle' },
  discardState: { phase: 'idle' },
  restoreState: { phase: 'idle' },
  restoreSessionState: { phase: 'idle' },
  switchBranchState: { phase: 'idle' }
} satisfies WorkingTreeAsyncStates);

/** 状态的去处；三端各自把它接到本框架的响应式原语上。 */
export type WorkingTreeStateSink<S> = (state: S) => void;

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
export const trackWorkingTreeCommand = async <T>(
  emit: WorkingTreeStateSink<WorkingTreeCommandState<T>>,
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
export const trackWorkingTreeQuery = async <T>(
  emit: WorkingTreeStateSink<WorkingTreeQueryState<T>>,
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
export const isWorkingTreeStatusEmpty = (status: WorkingTreeStatus): boolean => status.entryCount === 0;

/**
 * `diff()` 的空：这一页没有可展示的改动。
 *
 * @remarks
 * **两个粒度各看各的那一边。** `diff.ts` 按 `granularity` 只填 `entries` 或 `transactions`，
 * 另一边恒为空数组；只判 `entries` 的话，事务粒度的 diff 永远是空——UI 在一个明明有改动的
 * 工作树上显示空状态插画，而 `commit()` 那边照常提交出一个非空的提交。
 */
export const isWorkingTreeDiffEmpty = (diff: WorkingTreeDiff): boolean =>
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
export const isWorkingTreeRestoreSessionEmpty = (session: WorkingTreeRestoreSessionInfo | null): boolean =>
  session === null;
