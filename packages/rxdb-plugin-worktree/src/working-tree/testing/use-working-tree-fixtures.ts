/**
 * 三端 `useWorktree` spec 共用的夹具。
 *
 * @remarks
 * Angular / React / Vue 三份 `use-worktree.spec` 要断言的是**同一份**契约
 * （contracts/tri-framework-api.md §3 的那份清单）：同名方法、同名状态字段、同一组相位、
 * 同一份「哪些结果算 empty」的答案。三端不同的只有容器形态 —— `Signal` / 渲染快照 /
 * `ComputedRef` —— 以及挂载方式。
 *
 * 载荷和桩因此属于契约那一半，不属于容器那一半：逐字三拷贝的时候，核心里改一个字段名
 * 要在三个文件里各改一遍，漏掉一个的代价是那一端继续拿一份早已过期的载荷调用桩，
 * 而桩什么都不校验 —— 于是这一端在「还对不对」这件事上永远绿。下沉到这里之后，
 * 形状只有一处，三端一起红。
 *
 * 各端**自己**的那一半留在各自 spec 里：Angular 的 `TestBed`、React 的 `renderHook`
 * 与跨 render 稳定性、Vue 的 `mount()` 与显式卸载 —— 那些是三端真正不同的地方，
 * 合并它们只会把差异藏起来。
 */
import { EntityLocalUpdatedEvent, type RxDB } from '@aiao/rxdb';
import { NEVER, type Observable } from 'rxjs';
import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import type { CommitChangeSetPage } from '../../commit/commit-changes.js';
import type { CommitLogPage } from '../../commit/commit-log.js';
import type { WorktreeInfo } from '../../worktree/worktree-command.js';
import type { CommitResult } from '../commit-command.js';
import type { WorktreeCredentials } from '../commit-conflict.js';
import type { WorktreeDiff } from '../diff.js';
import type { WorktreeDiscardResult } from '../discard-command.js';
import type { WorktreeRestoreResult, WorktreeRestoreSessionInfo } from '../restore-command.js';
import type { WorktreeRestoreTarget } from '../restore-precheck.js';
import type { WorktreeStatus } from '../status.js';
import type { WorktreeSwitchBranchOptions } from '../switch-branch-options.js';
import type { WorktreeCommitEvent } from '../working-tree-commit-event.js';
import type { WorktreeEnableIfEmptyResult, WorktreeManager } from '../working-tree-facade.js';

/**
 * 一个由调用方决定何时兑现的 promise。
 *
 * @typeParam T - 兑现值的类型。
 */
export interface Deferred<T> {
  /** 交给被测代码的 promise。 */
  readonly promise: Promise<T>;
  /** 手动兑现。 */
  readonly resolve: (value: T) => void;
  /** 手动拒绝。 */
  readonly reject: (reason: unknown) => void;
}

/**
 * 手控的 promise：不控住它，`loading` 在第一个 await 之前就已经翻过去了。
 *
 * @typeParam T - 兑现值的类型。
 * @returns 一个尚未兑现、由调用方决定何时兑现的 {@link Deferred}。
 */
export const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/**
 * 一份工作树状态；`entryCount` 为 0 即 `clean`。
 *
 * @param entryCount - 未提交条目数。
 * @returns 对应条目数的 {@link WorktreeStatus}。
 */
export const statusWith = (entryCount: number): WorktreeStatus => ({
  branchId: 'main',
  entryCount,
  clean: entryCount === 0,
  restoring: false,
  conflicted: false,
  byOrigin: { local: entryCount, remote_sync: 0 },
  activationRevision: 1,
  headRevision: 2,
  workingTreeRevision: 3
});

/**
 * 一份实体粒度的工作树差异。
 *
 * @param entryCount - 差异条目数。
 * @returns 对应条目数的 {@link WorktreeDiff}。
 */
export const diffWith = (entryCount: number): WorktreeDiff => ({
  branchId: 'main',
  baseHeadCommitId: 'commit-1',
  workingTreeRevision: 3,
  granularity: 'entity',
  entries: Array.from({ length: entryCount }, (_, index) => ({
    unitId: `unit-${index}`,
    transactionId: null,
    namespace: 'app',
    entity: 'Note',
    entityId: `note-${index}`,
    operation: 'update' as const,
    patch: { title: '改后' },
    inversePatch: { title: '改前' },
    origin: 'local' as const
  })),
  transactions: [],
  nextCursor: null
});

/**
 * 一页提交日志；`entryCount` 为 0 时 `headCommitId` 也为 `null`。
 *
 * @param entryCount - 日志条目数。
 * @returns 对应条目数的 {@link CommitLogPage}。
 */
export const logWith = (entryCount: number): CommitLogPage => ({
  branchId: 'main',
  headCommitId: entryCount === 0 ? null : 'commit-1',
  entries: Array.from({ length: entryCount }, (_, index) => ({
    commitId: `commit-${index}`,
    parentIds: [],
    firstParentId: null,
    kind: 'normal' as const,
    message: `提交 ${index}`,
    authorId: 'alice',
    createdAt: new Date(0),
    changeSetCount: 1
  }))
});

/**
 * 一行未结束的恢复会话。
 *
 * @param status - 会话状态，由调用方给。
 * @returns 对应状态的 {@link WorktreeRestoreSessionInfo}。
 *
 * @remarks
 * `status` 由调用方给：`conflicted` 也是「还在」的一种，而它必须照样落在 `success`——
 * 那种会话仍占着 `activeKey` 的唯一索引、仍拦着下一次 restore、仍要用户处理掉。
 */
export const sessionWith = (status: WorktreeRestoreSessionInfo['status']): WorktreeRestoreSessionInfo => ({
  id: 'session-1',
  branchId: 'main',
  targetCommitId: 'commit-1',
  status
});

/** 一次写进三条条目的成功恢复。 */
export const RESTORE_OK = {
  ok: true,
  restoredCount: 3,
  sessionId: 'session-1',
  workingTreeRevision: 4
} satisfies WorktreeRestoreResult;

/**
 * 四个被拒出口各一份**完整**载荷。
 *
 * @remarks
 * 四种全列而不是挑一种代表：`reason` 是判别位，而 `conflict` / `incompatible` 只挂在其中两个
 * 分支上。只测 `dirty_working_tree` 的话，「带载荷的那两种有没有被原样带到 `success` 相位里」
 * 在本端永远没人问过——而界面要显示的恰恰是那两份载荷。
 */
export const REJECTED_RESTORES = [
  {
    ok: false,
    reason: 'conflict',
    conflict: { kind: 'working_tree_revision', expected: 3, actual: 4, branchId: 'main' }
  },
  { ok: false, reason: 'dirty_working_tree' },
  {
    ok: false,
    reason: 'incompatible_schema',
    incompatible: {
      commitId: 'commit-1',
      direction: 'reverse',
      namespace: 'app',
      entity: 'Note',
      manifest: { codecVersion: 1, entityResolved: false }
    }
  },
  { ok: false, reason: 'unreachable_target' }
] as const satisfies readonly WorktreeRestoreResult[];

/**
 * 一组调用方捕获的凭据。
 *
 * @remarks
 * `satisfies` 不是装饰：三个捕获位的形状一旦在核心里变了，这里必须先红。写成裸对象
 * 字面量的话，spec 会继续拿一份早已过期的凭据调用桩，而桩什么都不校验 —— 于是
 * 「三端传的凭据还对不对」这件事在本文件里永远绿。
 *
 * `expectedBranch` 是**令牌**而不是一个 `branchId` 字符串：`main → feature → main`
 * 一个来回之后分支 id 又「对上了」，而工作树已经换过两轮（`ActiveBranchToken`）。
 */
export const CREDENTIALS = {
  expectedBranch: { branchId: 'main', activationRevision: 1 },
  expectedHeadRevision: 2,
  expectedWorktreeRevision: 3
} satisfies WorktreeCredentials;

/** 整份恢复：`entities` 缺省即目标 commit 的全部单元。 */
export const RESTORE_TARGET: WorktreeRestoreTarget = { commitId: 'commit-1' };

/**
 * 一个命名 worktree 的视图（US-310）。
 *
 * @param branchId - 所钉分支；id 由它派生（`wt-<branchId>`），三端断言因此不必另记一份 id
 * @param active - 是不是当前 checkout
 * @returns 对应的 {@link WorktreeInfo}；`label` 为 `null`
 */
export const worktreeWith = (branchId: string, active: boolean): WorktreeInfo => ({
  id: `wt-${branchId}`,
  branchId,
  label: null,
  active,
  createdAt: new Date(0)
});

/**
 * 桩到 `RxDB.worktree` 那一层；再往下是核心自己的事，不在三端重测。
 *
 * @remarks
 * 每个方法都是裸 `Mock`，spec 自己决定这一次给什么：`mockResolvedValue` 给结果、
 * `mockReturnValue(pending.promise)` 把相位停在 `loading`、`mockRejectedValue` 走错误分支。
 */
export interface WorktreeManagerStub {
  /** 提交能力是否已启用。 */
  readonly isEnabled: Mock<() => Promise<boolean>>;
  /** 启用提交能力。 */
  readonly enable: Mock<() => Promise<CommitCapabilityInfo>>;
  /** 库为空时自动启用。 */
  readonly enableIfEmpty: Mock<() => Promise<WorktreeEnableIfEmptyResult>>;
  /** 读工作树状态。 */
  readonly status: Mock<() => Promise<WorktreeStatus>>;
  /** 读工作树差异。 */
  readonly diff: Mock<() => Promise<WorktreeDiff>>;
  /** 读提交日志。 */
  readonly listCommits: Mock<() => Promise<CommitLogPage>>;
  /** 读单个提交的变更集。 */
  readonly commitChanges: Mock<() => Promise<CommitChangeSetPage>>;
  /** 提交。 */
  readonly commit: Mock<() => Promise<CommitResult>>;
  /** 丢弃工作树改动。 */
  readonly discard: Mock<() => Promise<WorktreeDiscardResult>>;
  /** 恢复到某个提交。 */
  readonly restore: Mock<() => Promise<WorktreeRestoreResult>>;
  /** 读当前未结束的恢复会话。 */
  readonly restoreSession: Mock<() => Promise<WorktreeRestoreSessionInfo | null>>;
  /** 读全部命名 worktree。 */
  readonly listWorktrees: Mock<() => Promise<readonly WorktreeInfo[]>>;
  /** 钉住一条分支并切过去。 */
  readonly createWorktree: Mock<(branchId: string, label?: string) => Promise<WorktreeInfo>>;
  /** 切到一个 worktree；`options` 由调用方原样带下去。 */
  readonly switchWorktree: Mock<(id: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>;
  /** 移除一个 worktree。 */
  readonly removeWorktree: Mock<(id: string) => Promise<void>>;
  /** 提交后事件流；桩上永不发值——三端入口目前都不订阅它。 */
  readonly commits$: Observable<WorktreeCommitEvent>;
}

/**
 * 桩到 `RxDB.versionManager` 那一层 —— 清单里的 `switchBranch` 挂在这里，不在 `worktree`
 * 上（contracts/core-api.md §6）。
 *
 * @remarks
 * 两个门面分开桩而不是合成一个对象：合起来之后「入口从哪个门面取这个方法」在三端就没人
 * 问过了，而那正是 T123 唯一改动的接线。
 */
export interface VersionManagerStub {
  /** 切换分支；`options` 由调用方原样带下去。 */
  readonly switchBranch: Mock<(branchId: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>;
}

/**
 * 一套 `useWorktree` 入口所需的桩，外加把它们装好的 `RxDB`。
 */
export interface WorktreeHookStubs {
  /** `RxDB.worktree` 这一层的桩。 */
  readonly worktree: WorktreeManagerStub;
  /** `RxDB.versionManager` 这一层的桩。 */
  readonly versionManager: VersionManagerStub;
  /** 装好两个桩、可以直接喂给各端 provider 的库。 */
  readonly rxdb: RxDB;
  /**
   * 往桩库上派发一个实体事件（同步调用当前挂着的监听器）。
   *
   * @remarks
   * worktree 列表读过一次之后会跟随实体事件；三端用它验「挂着时跟、卸载后不跟」。
   */
  readonly emitEntityEvent: (event: { readonly type: string }) => void;
  /** 桩库上此刻挂着的事件监听器总数。 */
  readonly listenerCount: () => number;
}

/**
 * 一条「分支激活变了」的实体事件：worktree 列表的跟随源之一。
 *
 * @returns 形状与适配器给 `rxdb_branch` 发的系统事件相同
 */
export const branchActivatedEvent = (): EntityLocalUpdatedEvent =>
  new EntityLocalUpdatedEvent([
    {
      type: 'UPDATE',
      namespace: 'rxdb',
      entity: 'RxDBBranch',
      id: 'feature',
      patch: {},
      inversePatch: {},
      recordAt: new Date(0)
    }
  ]);

/**
 * 建一套桩并装成一个可以喂给 provider 的 `RxDB`。
 *
 * @returns 两个门面的桩，以及装着它们的 {@link WorktreeHookStubs.rxdb}。
 *
 * @remarks
 * `status` 预置成「干净」、`listWorktrees` 预置成「只有当前那一个」：十六格初始相位那一组用例要证明的是
 * 「创建入口本身一次 IO 都不发」，而不是「第一次读状态返回什么」——没有预置值的话，任何一条走到
 * 重读的路径都会在桩返回 `undefined` 时炸在状态机里面，而错误信息与那条用例真正关心的事毫无关系。
 *
 * 这里的两次 `as unknown as` 是**故意**的：桩只桩到门面那一层，不实现 `WorktreeManager`
 * 的全部成员，也不实现 `RxDB` 的其余部分 —— 补全它们等于在三端各重写一遍核心。
 */
export const createWorktreeHookStubs = (): WorktreeHookStubs => {
  const worktree: WorktreeManagerStub = {
    isEnabled: vi.fn<() => Promise<boolean>>(),
    enable: vi.fn<() => Promise<CommitCapabilityInfo>>(),
    enableIfEmpty: vi.fn<() => Promise<WorktreeEnableIfEmptyResult>>(),
    status: vi.fn<() => Promise<WorktreeStatus>>(),
    diff: vi.fn<() => Promise<WorktreeDiff>>(),
    listCommits: vi.fn<() => Promise<CommitLogPage>>(),
    commitChanges: vi.fn<() => Promise<CommitChangeSetPage>>(),
    commit: vi.fn<() => Promise<CommitResult>>(),
    discard: vi.fn<() => Promise<WorktreeDiscardResult>>(),
    restore: vi.fn<() => Promise<WorktreeRestoreResult>>(),
    restoreSession: vi.fn<() => Promise<WorktreeRestoreSessionInfo | null>>(),
    listWorktrees: vi.fn<() => Promise<readonly WorktreeInfo[]>>(),
    createWorktree: vi.fn<(branchId: string, label?: string) => Promise<WorktreeInfo>>(),
    switchWorktree: vi.fn<(id: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>(),
    removeWorktree: vi.fn<(id: string) => Promise<void>>(),
    commits$: NEVER
  };
  worktree.status.mockResolvedValue(statusWith(0));
  worktree.listWorktrees.mockResolvedValue([worktreeWith('main', true)]);

  const versionManager: VersionManagerStub = {
    switchBranch: vi.fn<(branchId: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>()
  };
  versionManager.switchBranch.mockResolvedValue(undefined);

  // 实体事件总线的替身：只有挂、摘、派发三个动作。
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const listenersOf = (type: string): Set<(event: unknown) => void> => {
    const existing = listeners.get(type);
    if (existing) return existing;
    const created = new Set<(event: unknown) => void>();
    listeners.set(type, created);
    return created;
  };

  const rxdb = {
    worktree: worktree as unknown as WorktreeManager,
    versionManager,
    addEventListener: (type: string, listener: (event: unknown) => void) => listenersOf(type).add(listener),
    removeEventListener: (type: string, listener: (event: unknown) => void) => listenersOf(type).delete(listener)
  } as unknown as RxDB;

  return {
    worktree,
    versionManager,
    rxdb,
    emitEntityEvent: event => listenersOf(event.type).forEach(listener => listener(event)),
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0)
  };
};
