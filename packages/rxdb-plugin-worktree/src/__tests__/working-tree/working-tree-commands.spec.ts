/**
 * @fileoverview 三端入口共用的**命令层**（`createWorktreeCommands`）——
 * contracts/tri-framework-api.md §1/§4 里「不是形态、是语义」的那一半。
 *
 * @remarks
 * 这份实现归本包所有，从前却只被 `@aiao/rxdb-{angular,react,vue}` 的三个
 * `use-worktree.spec` 覆盖到。那个格局有两个毛病：拥有它的包自己一行都没测；
 * 而三端那三份 spec 各自还要过一层框架容器（`Signal` / 渲染快照 / `ComputedRef`），
 * 于是「哪一步发 loading」「谁之后要重读 status」这些**与框架无关**的判定，
 * 每验一次就要连带把 TestBed / renderHook / `nextTick` 一起拖进来。
 *
 * 本文件把那一层剥掉：`patch` 就是一个往普通对象里写格子的函数，桩只桩到
 * {@link WorktreeManager}（与 `switchBranch` 所在的 `VersionManager`）那一层。
 * 剥掉之后能问出三端问不了的一个问题——
 * **「除了这一格，别的格子动没动」**（见 {@link untouchedKeys}）。框架容器下
 * 这个问题会退化成「渲染有没有多跑一次」，而那是框架的事，不是本层的事。
 *
 * 本文件不碰数据库：谁能落库、落成什么样归 `commit-atomicity.spec.ts` /
 * `discard.spec.ts` / `status.spec.ts`；相位机本身归 `async-state.spec.ts`。
 * 这里只测**接线**：每个方法各自接哪一格、哪几个之后要重读 status、错误往哪走。
 *
 * 桩的形状从 T123 起是 `{ worktree, versionManager }` 而不再是裸 `worktree`：
 * 清单里的 `switchBranch` 挂在 `versionManager` 上（contracts/core-api.md §6），
 * 命令层因此收整个库。桩到两个门面**而不是**让 spec 自己造一份 `RxDB`——
 * 本层只用得到这两个属性，多桩出来的每一个都会变成一处与真库无关的约束。
 */

import {
  CapabilityEnabledEvent,
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  RxDBError,
  type RxDB,
  type RxDBEntityLocalEventData
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import type { CommitChangeSetPage } from '../../commit/commit-changes.js';
import type { CommitLogOptions, CommitLogPage } from '../../commit/commit-log.js';
import { CommitValidationError } from '../../commit/write-commit.js';
import { WORKTREE_INITIAL_ASYNC_STATES, type WorktreeAsyncStates } from '../../working-tree/async-state.js';
import type { CommitOptions, CommitResult } from '../../working-tree/commit-command.js';
import type { WorktreeCredentials } from '../../working-tree/commit-conflict.js';
import type { WorktreeDiff, WorktreeDiffOptions } from '../../working-tree/diff.js';
import type { WorktreeDiscardOptions, WorktreeDiscardResult } from '../../working-tree/discard-command.js';
import type {
  WorktreeRestoreOptions,
  WorktreeRestoreResult,
  WorktreeRestoreSessionInfo,
  WorktreeRestoreTarget
} from '../../working-tree/restore-command.js';
import type { WorktreeStatus } from '../../working-tree/status.js';
import { WorktreeDirtyError, type WorktreeSwitchBranchOptions } from '../../working-tree/switch-branch-options.js';
import {
  createWorktreeCommands,
  disposeWorktreeCommands,
  type WorktreeCommands,
  type WorktreeStatePatch
} from '../../working-tree/working-tree-commands.js';
import type { WorktreeEnableIfEmptyResult, WorktreeManager } from '../../working-tree/working-tree-facade.js';
import type { WorktreeInfo } from '../../worktree/worktree-command.js';
import { WorktreeActiveError, WorktreeBranchPinnedError } from '../../worktree/worktree-errors.js';

/** 手控的 promise：不控住它，`loading` 在第一个 await 之前就已经翻过去了。 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const statusWith = (entryCount: number): WorktreeStatus => ({
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

const diffWith = (entryCount: number): WorktreeDiff => ({
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

const logWith = (entryCount: number): CommitLogPage => ({
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

const changesWith = (entryCount: number): CommitChangeSetPage => ({
  commitId: 'commit-1',
  entries: Array.from({ length: entryCount }, (_, index) => ({
    unitId: `u-${index}`,
    transactionId: null,
    namespace: 'app',
    entity: 'Note',
    entityId: `note-${index}`,
    operation: 'update' as const,
    patch: { title: `改后 ${index}` },
    inversePatch: { title: `改前 ${index}` },
    origin: 'local' as const
  }))
});

const CAPABILITY: CommitCapabilityInfo = {
  enabled: true,
  enabledAt: new Date(0),
  protocolVersion: 1,
  schemaVersion: 1,
  codecVersion: 1
};

/**
 * 一组调用方捕获的凭据。
 *
 * @remarks
 * `satisfies` 不是装饰：三个捕获位的形状一旦变了，这里必须先红。裸对象字面量的话，
 * spec 会继续拿一份早已过期的凭据调用桩，而桩什么都不校验。
 */
const CREDENTIALS = {
  expectedBranch: { branchId: 'main', activationRevision: 1 },
  expectedHeadRevision: 2,
  expectedWorktreeRevision: 3
} satisfies WorktreeCredentials;

const COMMIT_OPTIONS: CommitOptions = { ...CREDENTIALS, authorId: 'alice', operationId: 'op-1' };
const DISCARD_OPTIONS: WorktreeDiscardOptions = CREDENTIALS;
const RESTORE_OPTIONS: WorktreeRestoreOptions = CREDENTIALS;
const RESTORE_TARGET: WorktreeRestoreTarget = { commitId: 'commit-1' };

const WORKTREE_MAIN: WorktreeInfo = {
  id: 'wt-main',
  branchId: 'main',
  label: null,
  active: true,
  createdAt: new Date(0)
};
const WORKTREE_FEATURE: WorktreeInfo = {
  id: 'wt-feature',
  branchId: 'feature',
  label: 'Feature',
  active: true,
  createdAt: new Date(1)
};

const SESSION: WorktreeRestoreSessionInfo = {
  id: 'session-1',
  branchId: 'main',
  targetCommitId: 'commit-1',
  status: 'active'
};

/** 全部状态格的可写副本；本层不持有状态，状态在调用方那边，这里替调用方存一份。 */
type MutableAsyncStates = { -readonly [K in keyof WorktreeAsyncStates]: WorktreeAsyncStates[K] };

/**
 * 除了点名的那几格，还有哪些格子离开了 `idle`。
 *
 * @remarks
 * 这是本文件相对三端 spec 多出来的那一问。`WorktreeStatePatch` 按 key 分格正是
 * 为了「`commit()` 进行中不该让 `statusState` 也变成 loading」；而一个整份替换的实现
 * 在三端 spec 下只表现为多一次渲染——看不出来。这里它表现为多一个键，看得出来。
 */
const untouchedKeys = (
  states: WorktreeAsyncStates,
  ...touched: readonly (keyof WorktreeAsyncStates)[]
): (keyof WorktreeAsyncStates)[] =>
  (Object.keys(states) as (keyof WorktreeAsyncStates)[]).filter(
    key => !touched.includes(key) && states[key].phase !== 'idle'
  );

/**
 * 桩到 `RxDB.worktree` / `RxDB.versionManager` 那一层；再往下是命令自己的事，不在本文件重测。
 *
 * @param options - `history: false` 模拟没装 `rxDBPluginHistory`（`versionManager` 不存在）
 */
const createFixture = (options: { readonly history?: boolean } = {}) => {
  const states: MutableAsyncStates = { ...WORKTREE_INITIAL_ASYNC_STATES };
  // 相位流水账：既记「进了哪一格」也记「什么相位」，用来钉住**次序**——
  // 「命令先落地、再重读 status」只能靠次序证明，靠终值证明不了。
  const transitions: string[] = [];
  const patch: WorktreeStatePatch = (key, state) => {
    states[key] = state;
    transitions.push(`${key}:${state.phase}`);
  };

  const worktree = {
    isEnabled: vi.fn<() => Promise<boolean>>(),
    enable: vi.fn<() => Promise<CommitCapabilityInfo>>(),
    enableIfEmpty: vi.fn<() => Promise<WorktreeEnableIfEmptyResult>>(),
    status: vi.fn<() => Promise<WorktreeStatus>>(),
    diff: vi.fn<(options?: WorktreeDiffOptions) => Promise<WorktreeDiff>>(),
    listCommits: vi.fn<(options?: CommitLogOptions) => Promise<CommitLogPage>>(),
    commitChanges: vi.fn<(commitId: string) => Promise<CommitChangeSetPage>>(),
    commit: vi.fn<(message: string, options: CommitOptions) => Promise<CommitResult>>(),
    discard: vi.fn<(options: WorktreeDiscardOptions) => Promise<WorktreeDiscardResult>>(),
    restore:
      vi.fn<(target: WorktreeRestoreTarget, options: WorktreeRestoreOptions) => Promise<WorktreeRestoreResult>>(),
    restoreSession: vi.fn<() => Promise<WorktreeRestoreSessionInfo | null>>(),
    listWorktrees: vi.fn<() => Promise<readonly WorktreeInfo[]>>(),
    createWorktree: vi.fn<(branchId: string, label?: string) => Promise<WorktreeInfo>>(),
    switchWorktree: vi.fn<(id: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>(),
    removeWorktree: vi.fn<(id: string) => Promise<void>>()
  };
  worktree.status.mockResolvedValue(statusWith(0));
  worktree.listWorktrees.mockResolvedValue([WORKTREE_MAIN]);

  const versionManager = {
    switchBranch: vi.fn<(branchId: string, options?: WorktreeSwitchBranchOptions) => Promise<void>>()
  };
  versionManager.switchBranch.mockResolvedValue(undefined);

  // `versionManager` 由历史插件在连接纪元内 `defineProperty` 装上，这里用取值器桩住它，
  // 顺带把「命令层是不是每次现取」问出来：构造时存一份的实现下 `versionManagerReads`
  // 会停在 1，而真库里那一份在释放后就没了。
  let versionManagerReads = 0;
  // 实体事件总线的替身：只有挂、摘、派发三个动作，派发即同步调用——实时列表只用得到这些。
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const listenersOf = (type: string): Set<(event: unknown) => void> => {
    const existing = listeners.get(type);
    if (existing) return existing;
    const created = new Set<(event: unknown) => void>();
    listeners.set(type, created);
    return created;
  };
  const database = {
    worktree: worktree as unknown as WorktreeManager,
    get versionManager() {
      versionManagerReads += 1;
      return options.history === false ? undefined : versionManager;
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => listenersOf(type).add(listener),
    removeEventListener: (type: string, listener: (event: unknown) => void) => listenersOf(type).delete(listener)
  } as unknown as RxDB;

  const commands = createWorktreeCommands(database, patch);
  return {
    commands,
    states,
    transitions,
    worktree,
    versionManager,
    versionManagerReadCount: () => versionManagerReads,
    /** 往替身总线上派发一个事件 */
    emit: (event: { readonly type: string }) => listenersOf(event.type).forEach(listener => listener(event)),
    /** 替身总线上此刻挂着的监听器总数 */
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0)
  };
};

/** 一条实体事件的载荷；只填判据用得到的那几项。 */
const eventData = (
  type: RxDBEntityLocalEventData['type'],
  entity: string,
  id: string,
  extra: Partial<RxDBEntityLocalEventData> = {}
) => ({ type, namespace: 'rxdb', entity, id, recordAt: new Date(0), ...extra });

const branchActivated = (origin?: 'cross-tab') =>
  new EntityLocalUpdatedEvent([
    { ...eventData('UPDATE', 'RxDBBranch', 'feature', origin ? { origin } : {}), patch: {}, inversePatch: {} }
  ]);
const worktreeRemoved = () =>
  new EntityLocalRemovedEvent([{ ...eventData('DELETE', 'Worktree', 'wt-feature'), patch: null, inversePatch: {} }]);
const noteCreated = () =>
  new EntityLocalCreatedEvent([
    { ...eventData('INSERT', 'Note', 'note-1'), namespace: 'app', patch: {}, inversePatch: null }
  ]);

/** 让排进微任务的那一次重读跑完。 */
const flushRequeries = () => new Promise(resolve => setTimeout(resolve, 0));

describe('十六个命令各自只驱动自己那一格（§4）', () => {
  it('isEnabled 走命令状态，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.isEnabled.mockResolvedValue(true);

    await expect(commands.isEnabled()).resolves.toBe(true);

    expect(states.isEnabledState).toEqual({ phase: 'success', value: true });
    expect(untouchedKeys(states, 'isEnabledState')).toEqual([]);
  });

  it('enableIfEmpty 走命令状态，其余格子只有 statusState 跟着动', async () => {
    const { commands, states, worktree } = createFixture();
    const result: WorktreeEnableIfEmptyResult = { kind: 'not_empty' };
    worktree.enableIfEmpty.mockResolvedValue(result);

    await expect(commands.enableIfEmpty()).resolves.toBe(result);

    // 与 enable 同一条尾巴：自动启用（或被跳过）之后重读一次 status，
    // 其余格子仍是一格都不许动。
    expect(states.enableIfEmptyState).toEqual({ phase: 'success', value: result });
    expect(untouchedKeys(states, 'enableIfEmptyState', 'statusState')).toEqual([]);
  });

  it('status 走查询状态，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    const dirty = statusWith(3);
    worktree.status.mockResolvedValue(dirty);

    await expect(commands.status()).resolves.toBe(dirty);

    expect(states.statusState).toEqual({ phase: 'success', value: dirty });
    expect(untouchedKeys(states, 'statusState')).toEqual([]);
  });

  it('diff 走查询状态，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    const diff = diffWith(2);
    worktree.diff.mockResolvedValue(diff);

    await expect(commands.diff()).resolves.toBe(diff);

    expect(states.diffState).toEqual({ phase: 'success', value: diff });
    expect(untouchedKeys(states, 'diffState')).toEqual([]);
  });

  it('listCommits 走查询状态，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    const page = logWith(2);
    worktree.listCommits.mockResolvedValue(page);

    await expect(commands.listCommits()).resolves.toBe(page);

    expect(states.listCommitsState).toEqual({ phase: 'success', value: page });
    expect(untouchedKeys(states, 'listCommitsState')).toEqual([]);
  });

  it('commitChanges 走查询状态，零变更单元是 empty，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    const empty = changesWith(0);
    worktree.commitChanges.mockResolvedValue(empty);

    await expect(commands.commitChanges('commit-1')).resolves.toBe(empty);

    expect(states.commitChangesState).toEqual({ phase: 'empty', value: empty });
    expect(untouchedKeys(states, 'commitChangesState')).toEqual([]);
  });

  it('restoreSession 走查询状态，其余各格纹丝不动', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.restoreSession.mockResolvedValue(SESSION);

    await expect(commands.restoreSession()).resolves.toBe(SESSION);

    expect(states.restoreSessionState).toEqual({ phase: 'success', value: SESSION });
    expect(untouchedKeys(states, 'restoreSessionState')).toEqual([]);
  });

  // restore 进行中时**只有** restoreState 在 loading：恢复要写满一整个 commit 的条目，
  // 是这些方法里最慢的一个，此刻若 statusState 也被推成 loading，面板上那份还完全有效的
  // 摘要会在整段恢复期间变成一个转圈——而它根本没有被重读。
  it('restore 进行中时只有 restoreState 是 loading，statusState 照旧 idle', async () => {
    const { commands, states, worktree } = createFixture();
    const pending = deferred<WorktreeRestoreResult>();
    worktree.restore.mockReturnValue(pending.promise);

    const call = commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);
    expect(states.restoreState).toEqual({ phase: 'loading' });
    expect(untouchedKeys(states, 'restoreState')).toEqual([]);

    pending.resolve({ ok: true, restoredCount: 3, sessionId: 'session-1', workingTreeRevision: 4 });
    await call;
  });

  // 「进行中」必须先于结果发出（§4），而且此刻**只有**这一格在 loading。
  it('commit 进行中时只有 commitState 是 loading，statusState 照旧 idle', async () => {
    const { commands, states, worktree } = createFixture();
    const pending = deferred<CommitResult>();
    worktree.commit.mockReturnValue(pending.promise);

    const call = commands.commit('第一次提交', COMMIT_OPTIONS);
    expect(states.commitState).toEqual({ phase: 'loading' });
    expect(untouchedKeys(states, 'commitState')).toEqual([]);

    pending.resolve({ ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 });
    await call;
  });

  // 切分支要重放目标分支的整段历史，是这些方法里第二慢的一个。此刻若 statusState 也被推成
  // loading，面板上那份**当前**分支的摘要会在整段切换期间变成转圈——而它此刻仍然完全有效，
  // 真正该重读它的时刻在切换**之后**。
  it('switchBranch 进行中时只有 switchBranchState 是 loading，statusState 照旧 idle', async () => {
    const { commands, states, versionManager } = createFixture();
    const pending = deferred<void>();
    versionManager.switchBranch.mockReturnValue(pending.promise);

    const call = commands.switchBranch('feature');
    expect(states.switchBranchState).toEqual({ phase: 'loading' });
    expect(untouchedKeys(states, 'switchBranchState')).toEqual([]);

    pending.resolve();
    await call;
  });
});

describe('四个查询各自的空判据（§4）', () => {
  it('干净工作树落在 empty 而不是 success', async () => {
    const { commands, states, worktree } = createFixture();
    const clean = statusWith(0);
    worktree.status.mockResolvedValue(clean);

    await commands.status();

    expect(states.statusState).toEqual({ phase: 'empty', value: clean });
  });

  it('零条目的 diff 落在 empty', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.diff.mockResolvedValue(diffWith(0));

    await commands.diff();

    expect(states.diffState.phase).toBe('empty');
  });

  it('没有历史的分支落在 empty', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.listCommits.mockResolvedValue(logWith(0));

    await commands.listCommits();

    expect(states.listCommitsState.phase).toBe('empty');
  });

  // 「没有未结束的恢复会话」是这个查询唯一的空形态，而且是**绝大多数**时刻的形态。
  // 把 `null` 画成 success 的话，模板要么给「没有会话」渲染一块恢复中的横幅，
  // 要么每处绑定各写一遍 `=== null`——而那份判据迟早有一端写成 `status !== 'active'`。
  it('没有未结束会话时落在 empty，且照样带着那个 null', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.restoreSession.mockResolvedValue(null);

    await expect(commands.restoreSession()).resolves.toBeNull();

    expect(states.restoreSessionState).toEqual({ phase: 'empty', value: null });
  });

  // 有会话就是 success，无论它是 active 还是 conflicted：这个查询只回答
  // 「有没有、来自哪个 commit」，「还成不成立」是 status() 那两位的事。
  it('conflicted 的会话照样是 success，不因为「不健康」被算成空', async () => {
    const { commands, states, worktree } = createFixture();
    const conflicted: WorktreeRestoreSessionInfo = { ...SESSION, status: 'conflicted' };
    worktree.restoreSession.mockResolvedValue(conflicted);

    await commands.restoreSession();

    expect(states.restoreSessionState).toEqual({ phase: 'success', value: conflicted });
  });
});

describe('入参原样透传，签名不做框架化改写（§1）', () => {
  it('diff 与 listCommits 的可选入参原样传下去；不传就是不传', async () => {
    const { commands, worktree } = createFixture();
    worktree.diff.mockResolvedValue(diffWith(1));
    worktree.listCommits.mockResolvedValue(logWith(1));
    const diffOptions: WorktreeDiffOptions = { limit: 10 };
    const logOptions: CommitLogOptions = { limit: 5 };

    await commands.diff(diffOptions);
    await commands.listCommits(logOptions);
    await commands.diff();

    expect(worktree.diff).toHaveBeenNthCalledWith(1, diffOptions);
    expect(worktree.listCommits).toHaveBeenCalledWith(logOptions);
    expect(worktree.diff).toHaveBeenNthCalledWith(2, undefined);
  });

  // 三个捕获位由调用方给，入口内部**不**代读：内部读到的恒等于当前值，
  // CAS 永远命中，FR-031 当场失效。所以这里钉的是「原样两个位置参数」。
  it('commit 的 message 与 options 原样两个位置参数传下去', async () => {
    const { commands, worktree } = createFixture();
    worktree.commit.mockResolvedValue({ ok: true, commitId: 'c-1', changeSetCount: 1, headRevision: 3 });

    await commands.commit('第一次提交', COMMIT_OPTIONS);

    expect(worktree.commit).toHaveBeenCalledWith('第一次提交', COMMIT_OPTIONS);
  });

  // 与 commit 同形的「恰好两个位置参数」：`options` 若可缺省，「缺省时由入口内部读 revision」
  // 就成了合法用法，而内部读到的恒等于当前值、CAS 永远命中——FR-034 对 restore 的那半句当场失效。
  it('restore 的 target 与 options 原样两个位置参数传下去', async () => {
    const { commands, worktree } = createFixture();
    worktree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    });

    await commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);

    expect(worktree.restore).toHaveBeenCalledWith(RESTORE_TARGET, RESTORE_OPTIONS);
  });

  // `entities` 的缺省语义是「整个 commit」，与「传了一个空数组」不是一回事。
  // 入口替调用方补一个 `entities: []` 会把「整个 commit」悄悄改成「一个实体都不恢复」。
  it('restore 的 entities 子集原样带下去，不被补齐也不被抹掉', async () => {
    const { commands, worktree } = createFixture();
    worktree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 1,
      sessionId: 'session-2',
      workingTreeRevision: 5
    });
    const subset: WorktreeRestoreTarget = {
      commitId: 'commit-1',
      entities: [{ namespace: 'app', entity: 'Note', entityId: 'note-1' }]
    };

    await commands.restore(subset, RESTORE_OPTIONS);

    expect(worktree.restore).toHaveBeenCalledWith(subset, RESTORE_OPTIONS);
  });

  it('restoreSession 不带任何入参：会话恒属当前 active 分支（FR-048）', async () => {
    const { commands, worktree } = createFixture();
    worktree.restoreSession.mockResolvedValue(null);

    await commands.restoreSession();

    expect(worktree.restoreSession).toHaveBeenCalledWith();
  });

  // `options` 缺省与传 `{ requireClean: false }` 在核心是同一件事，但「入口替调用方补一个
  // 空对象」不是：`assertSwitchBranchPreconditions` 靠「一个条件都没提」来决定**一条语句都不发**，
  // 补出来的空对象会让每一次切换白读一次 active 分支令牌。
  it('switchBranch 的 branchId 与 options 原样传下去；不传就是不传', async () => {
    const { commands, versionManager } = createFixture();
    const options: WorktreeSwitchBranchOptions = { requireClean: true, expectedActivationRevision: 1 };

    await commands.switchBranch('feature', options);
    await commands.switchBranch('main');

    expect(versionManager.switchBranch).toHaveBeenNthCalledWith(1, 'feature', options);
    expect(versionManager.switchBranch).toHaveBeenNthCalledWith(2, 'main', undefined);
  });

  // `versionManager` 由历史插件在**连接纪元内** `defineProperty` 装上、释放时删掉。
  // 命令层若在构造时存一份，入口会一直攥着上一个纪元那个已经作废的门面——重连之后
  // 每一次切换都打在一个没人再看的对象上，而这里除了「读了几次」看不出别的症状。
  it('每次调用都现取一次 versionManager，不在构造时存一份', async () => {
    const { commands, versionManagerReadCount } = createFixture();

    expect(versionManagerReadCount()).toBe(0);

    await commands.switchBranch('feature');
    await commands.switchBranch('main');

    expect(versionManagerReadCount()).toBe(2);
  });

  it('没装历史插件：switchBranch 报明确的 RxDBError 而不是裸 TypeError，并落进 switchBranchState', async () => {
    const { commands, states } = createFixture({ history: false });

    const error = await commands.switchBranch('feature').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RxDBError);
    expect((error as Error).message).toMatch(/rxDBPluginHistory/);
    expect(states.switchBranchState).toEqual({ phase: 'error', error });
  });

  it('discard 的三个捕获位原样传下去', async () => {
    const { commands, worktree } = createFixture();
    worktree.discard.mockResolvedValue({ ok: true, discardedCount: 0, workingTreeRevision: 3 });

    await commands.discard(DISCARD_OPTIONS);

    expect(worktree.discard).toHaveBeenCalledWith(DISCARD_OPTIONS);
  });
});

describe('改动之后重读一次 status，查询之后不重读', () => {
  // 工作树没有变更流：不重读的话，用户刚提交完，面板上仍写着「3 条未提交变更」。
  it('enable 成功之后重读 status，且重读排在 enableState 落地之后', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    worktree.enable.mockResolvedValue(CAPABILITY);
    worktree.status.mockResolvedValue(statusWith(0));

    await expect(commands.enable()).resolves.toBe(CAPABILITY);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(states.enableState).toEqual({ phase: 'success', value: CAPABILITY });
    expect(transitions).toEqual([
      'enableState:loading',
      'enableState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  it('enableIfEmpty 成功之后重读 status，且重读排在 enableIfEmptyState 落地之后', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    const result: WorktreeEnableIfEmptyResult = { kind: 'enabled', capability: CAPABILITY };
    worktree.enableIfEmpty.mockResolvedValue(result);
    worktree.status.mockResolvedValue(statusWith(0));

    await expect(commands.enableIfEmpty()).resolves.toBe(result);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(states.enableIfEmptyState).toEqual({ phase: 'success', value: result });
    expect(transitions).toEqual([
      'enableIfEmptyState:loading',
      'enableIfEmptyState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  // not_empty 也是一次**成功**的调用：库里有内容时跳过自动启用，但面板仍然要拿到
  // 一份诚实的 status（未启用状态下的拒绝会落进 statusState 的 error 相位）。
  it('enableIfEmpty 返回 not_empty 时照样重读 status', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    const result: WorktreeEnableIfEmptyResult = { kind: 'not_empty' };
    worktree.enableIfEmpty.mockResolvedValue(result);
    worktree.status.mockResolvedValue(statusWith(0));

    await expect(commands.enableIfEmpty()).resolves.toBe(result);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(states.enableIfEmptyState).toEqual({ phase: 'success', value: result });
    expect(transitions).toEqual([
      'enableIfEmptyState:loading',
      'enableIfEmptyState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  it('commit 成功之后重读 status', async () => {
    const { commands, transitions, worktree } = createFixture();
    const result: CommitResult = { ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 };
    worktree.commit.mockResolvedValue(result);
    worktree.status.mockResolvedValue(statusWith(0));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(result);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual([
      'commitState:loading',
      'commitState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  // 只要有一端忘了在 discard() 之后重读，那一端的用户就会在丢弃之后仍看到
  // 「3 条未提交变更」，而另外两端是对的——这种分歧只在用户那里暴露。
  it('discard 成功之后重读 status', async () => {
    const { commands, transitions, worktree } = createFixture();
    worktree.discard.mockResolvedValue({ ok: true, discardedCount: 3, workingTreeRevision: 4 });
    worktree.status.mockResolvedValue(statusWith(0));

    await commands.discard(DISCARD_OPTIONS);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual([
      'discardState:loading',
      'discardState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  // `discardedCount: 0` 是一次明确的 no-op **结果**，落在 success，不是 empty。
  it('discardedCount 为零照样是 success，也照样重读', async () => {
    const { commands, states, worktree } = createFixture();
    const noop: WorktreeDiscardResult = { ok: true, discardedCount: 0, workingTreeRevision: 3 };
    worktree.discard.mockResolvedValue(noop);

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(noop);

    expect(states.discardState).toEqual({ phase: 'success', value: noop });
    expect(worktree.status).toHaveBeenCalledTimes(1);
  });

  // restore 把一整个 commit 的内容写成未提交条目，工作树从 clean 变脏——不重读的话，
  // 用户刚恢复完 100 个单元，面板上仍写着「没有未提交的改动」，而下一次 commit()
  // 会带走这 100 条。
  it('restore 成功之后重读 status，且重读排在 restoreState 落地之后', async () => {
    const { commands, transitions, worktree } = createFixture();
    const result: WorktreeRestoreResult = {
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    };
    worktree.restore.mockResolvedValue(result);
    worktree.status.mockResolvedValue(statusWith(3));

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(result);

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual([
      'restoreState:loading',
      'restoreState:success',
      'statusState:loading',
      'statusState:success'
    ]);
  });

  // `restoredCount: 0` 加 `sessionId: null` 是一次什么都没写的 no-op **结果**（FR-042），
  // 与 discard 的 `discardedCount: 0` 同形：落在 success，不是 empty，也照样重读。
  it('restoredCount 为零照样是 success，也照样重读', async () => {
    const { commands, states, worktree } = createFixture();
    const noop: WorktreeRestoreResult = {
      ok: true,
      restoredCount: 0,
      sessionId: null,
      workingTreeRevision: 3
    };
    worktree.restore.mockResolvedValue(noop);

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(noop);

    expect(states.restoreState).toEqual({ phase: 'success', value: noop });
    expect(worktree.status).toHaveBeenCalledTimes(1);
  });

  // 恢复成功之后**不**顺手重读会话：`restoreSession()` 只回答「有没有、来自哪个 commit」，
  // 而刚刚那次恢复的 `sessionId` 已经在返回值里；「这个会话还成不成立」的唯一出口是
  // `status()` 的 restoring / conflicted 两位，而那一份摘要上一行已经重读过了。
  // 顺手读一次等于给每次恢复多发一轮查询，换来一份调用方已经拿在手里的 id。
  it('restore 之后不顺手重读会话，restoreSessionState 停在 idle', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    });

    await commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);

    expect(worktree.restoreSession).not.toHaveBeenCalled();
    expect(states.restoreSessionState).toEqual({ phase: 'idle' });
  });

  // 切过去之后面板上那份摘要属于**另一条**分支：条目数、三个捕获位、restoring 位全是旧分支的。
  // 不重读的话，用户切到一条干净分支后仍看着「3 条未提交变更」，而下一次 commit() 会带着
  // 一份对不上的 `expectedWorktreeRevision` 撞 CAS。
  it('switchBranch 成功之后重读 status，且重读排在 switchBranchState 落地之后', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    worktree.status.mockResolvedValue(statusWith(0));

    await expect(commands.switchBranch('feature')).resolves.toBeUndefined();

    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(states.switchBranchState).toEqual({ phase: 'success', value: undefined });
    expect(transitions).toEqual([
      'switchBranchState:loading',
      'switchBranchState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  // 切到当前分支是一次成功的 no-op，不是空：`switchBranchState` 因此**没有 empty**。
  // 照样重读——核心不保证它是恒等变换，而「什么都没发生」本身也要有个出处。
  it('切到当前分支照样是 success，也照样重读', async () => {
    const { commands, states, worktree } = createFixture();

    await commands.switchBranch('main');

    expect(states.switchBranchState).toEqual({ phase: 'success', value: undefined });
    expect(worktree.status).toHaveBeenCalledTimes(1);
  });

  it('isEnabled / status / diff / listCommits / restoreSession 都不额外重读 status', async () => {
    const { commands, worktree } = createFixture();
    worktree.isEnabled.mockResolvedValue(false);
    worktree.diff.mockResolvedValue(diffWith(1));
    worktree.listCommits.mockResolvedValue(logWith(1));
    worktree.restoreSession.mockResolvedValue(null);

    await commands.isEnabled();
    await commands.diff();
    await commands.listCommits();
    await commands.restoreSession();

    expect(worktree.status).not.toHaveBeenCalled();

    // status() 自己那一次不算「重读」：它就是那一次读。
    await commands.status();
    expect(worktree.status).toHaveBeenCalledTimes(1);
  });
});

describe('错误既进状态，也继续往上抛（§1）', () => {
  // 只记进状态、不抛，会让 `await entry.commit(msg, opts)` 在提交失败时静静往下走——
  // 调用方拿到一个已经 resolve 的 promise，而工作树一个字节都没动。
  it('commit 抛错时 commitState 进 error，且原样的错误继续抛', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new CommitValidationError('empty_commit', 'normal');
    worktree.commit.mockRejectedValue(failure);

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).rejects.toBe(failure);

    expect(states.commitState).toEqual({ phase: 'error', error: failure });
  });

  // 什么都没提交，也就没有什么可重读的；顺手重读会让一次失败的提交多发一轮查询。
  it('commit 抛错时不重读 status，statusState 停在 idle', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.commit.mockRejectedValue(new CommitValidationError('empty_commit', 'normal'));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).rejects.toThrow();

    expect(worktree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'commitState')).toEqual([]);
  });

  it('enable 抛错时不重读 status', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new Error('迁移中断');
    worktree.enable.mockRejectedValue(failure);

    await expect(commands.enable()).rejects.toBe(failure);

    expect(states.enableState).toEqual({ phase: 'error', error: failure });
    expect(worktree.status).not.toHaveBeenCalled();
  });

  it('discard 抛错时不重读 status', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new Error('工作树正在恢复');
    worktree.discard.mockRejectedValue(failure);

    await expect(commands.discard(DISCARD_OPTIONS)).rejects.toBe(failure);

    expect(states.discardState).toEqual({ phase: 'error', error: failure });
    expect(worktree.status).not.toHaveBeenCalled();
  });

  // 抛出来只可能是能力未启用或提交图损坏（FR-051）——两者都意味着一个字节都没写进工作树，
  // 没有什么可重读的。
  it('restore 抛错时进 error、继续抛，且不重读 status', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new Error('提交图已损坏');
    worktree.restore.mockRejectedValue(failure);

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).rejects.toBe(failure);

    expect(states.restoreState).toEqual({ phase: 'error', error: failure });
    expect(worktree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'restoreState')).toEqual([]);
  });

  it('restoreSession 抛错时进 error 并继续抛，且不发 empty', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    const failure = new Error('能力未启用');
    worktree.restoreSession.mockRejectedValue(failure);

    await expect(commands.restoreSession()).rejects.toBe(failure);

    expect(states.restoreSessionState).toEqual({ phase: 'error', error: failure });
    expect(transitions).toEqual(['restoreSessionState:loading', 'restoreSessionState:error']);
  });

  // 被 `requireClean` 拒掉与「切换本身炸了」在本层是同一件事：两者都**抛**，与 commit() 的
  // CAS 落败（返回值）不同。因为被拒的那一刻分支根本没切，没有任何「结果」可以交给调用方——
  // 翻成返回值的话，`await tree.switchBranch(id, { requireClean: true })` 之后那行
  // 「已经切过去了」的代码会照跑。
  it('switchBranch 撞上脏工作树时进 error、继续抛，且不重读 status', async () => {
    const { commands, states, versionManager, worktree } = createFixture();
    const failure = new WorktreeDirtyError('main', 2);
    versionManager.switchBranch.mockRejectedValue(failure);

    await expect(commands.switchBranch('feature', { requireClean: true })).rejects.toBe(failure);

    expect(states.switchBranchState).toEqual({ phase: 'error', error: failure });
    // 一个字节都没动，分支也没换：重读只会把同一份摘要再取一遍。
    expect(worktree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'switchBranchState')).toEqual([]);
  });

  it('isEnabled 抛错时进 error 并继续抛', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new Error('连接已断开');
    worktree.isEnabled.mockRejectedValue(failure);

    await expect(commands.isEnabled()).rejects.toBe(failure);

    expect(states.isEnabledState).toEqual({ phase: 'error', error: failure });
  });

  it('查询抛错时进 error 并继续抛，且不发 empty', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    const failure = new Error('提交图损坏');
    worktree.listCommits.mockRejectedValue(failure);

    await expect(commands.listCommits()).rejects.toBe(failure);

    expect(states.listCommitsState).toEqual({ phase: 'error', error: failure });
    expect(transitions).toEqual(['listCommitsState:loading', 'listCommitsState:error']);
  });
});

describe('CommitConflict 是返回值，不是崩溃（§4）', () => {
  it('ok:false 落在 success 相位，并且照样重读 status', async () => {
    const { commands, states, worktree } = createFixture();
    const conflicted: CommitResult = {
      ok: false,
      conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: 'main' }
    };
    worktree.commit.mockResolvedValue(conflicted);
    worktree.status.mockResolvedValue(statusWith(3));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(conflicted);

    expect(states.commitState).toEqual({ phase: 'success', value: conflicted });
    // 冲突的出路是「重新 status() 再提交一次」，所以这一次重读恰恰是必须发生的：
    // 别人动过工作树，面板上那份摘要已经是旧的了。
    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(states.statusState).toEqual({ phase: 'success', value: statusWith(3) });
  });

  // restore 的四个被拒成因全都是**返回值**：脏工作树与不兼容要用户去处理，不可达是问错了
  // 节点，冲突要重来一次——四者都不是崩溃。翻成 error 会让 UI 把一次正常的仲裁渲染成故障。
  it.each(['conflict', 'dirty_working_tree', 'incompatible_schema', 'unreachable_target'] as const)(
    'restore 被拒（%s）落在 success 相位，并且照样重读 status',
    async reason => {
      const { commands, states, worktree } = createFixture();
      const rejected = { ok: false, reason } as WorktreeRestoreResult;
      worktree.restore.mockResolvedValue(rejected);
      worktree.status.mockResolvedValue(statusWith(3));

      await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(rejected);

      expect(states.restoreState).toEqual({ phase: 'success', value: rejected });
      // 被拒本身就说明面板上那份摘要与库里对不上了：`dirty_working_tree` 是它显示的
      // 「没有未提交改动」不成立，`conflict` 是三个捕获位已经过期。
      expect(worktree.status).toHaveBeenCalledTimes(1);
    }
  );

  it('discard 的 ok:false 同样落在 success 相位', async () => {
    const { commands, states, worktree } = createFixture();
    const conflicted: WorktreeDiscardResult = {
      ok: false,
      conflict: { kind: 'working_tree_revision', expected: 3, actual: 4, branchId: 'main' }
    };
    worktree.discard.mockResolvedValue(conflicted);

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(conflicted);

    expect(states.discardState).toEqual({ phase: 'success', value: conflicted });
  });
});

describe('重读失败被吞掉：一次成功的提交不能因为重读而变成失败', () => {
  it('commit 成功但 status 重读失败时，commit 仍然 resolve', async () => {
    const { commands, states, worktree } = createFixture();
    const result: CommitResult = { ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 };
    worktree.commit.mockResolvedValue(result);
    const readFailure = new Error('读 status 时连接断了');
    worktree.status.mockRejectedValue(readFailure);

    // 提交确实成功了：再抛一次会把它在调用方那里变成失败。
    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(result);

    // 但它并没有被藏起来——重读的失败照样落进 statusState 的 error 相位，面板看得见。
    expect(states.commitState).toEqual({ phase: 'success', value: result });
    expect(states.statusState).toEqual({ phase: 'error', error: readFailure });
  });

  it('restore 成功但 status 重读失败时，restore 仍然 resolve', async () => {
    const { commands, states, worktree } = createFixture();
    const result: WorktreeRestoreResult = {
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    };
    worktree.restore.mockResolvedValue(result);
    worktree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    // 100 个条目确实已经写进工作树了：再抛一次会让调用方以为恢复没发生，
    // 而它接下来大概率会重试一次——那一次会撞上 `dirty_working_tree`。
    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(result);

    expect(states.restoreState).toEqual({ phase: 'success', value: result });
    expect(states.statusState.phase).toBe('error');
  });

  it('enable 成功但 status 重读失败时，enable 仍然 resolve', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.enable.mockResolvedValue(CAPABILITY);
    worktree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    await expect(commands.enable()).resolves.toBe(CAPABILITY);

    expect(states.enableState).toEqual({ phase: 'success', value: CAPABILITY });
    expect(states.statusState.phase).toBe('error');
  });

  it('switchBranch 成功但 status 重读失败时，switchBranch 仍然 resolve', async () => {
    const { commands, states, worktree } = createFixture();
    const readFailure = new Error('读 status 时连接断了');
    worktree.status.mockRejectedValue(readFailure);

    // 分支确实已经切过去了：再抛一次会让调用方以为还停在原处，而它接下来那次「重试切换」
    // 会从新分支切回去——恰好是相反的动作。
    await expect(commands.switchBranch('feature')).resolves.toBeUndefined();

    expect(states.switchBranchState).toEqual({ phase: 'success', value: undefined });
    expect(states.statusState).toEqual({ phase: 'error', error: readFailure });
  });

  it('discard 成功但 status 重读失败时，discard 仍然 resolve', async () => {
    const { commands, states, worktree } = createFixture();
    const result: WorktreeDiscardResult = { ok: true, discardedCount: 3, workingTreeRevision: 4 };
    worktree.discard.mockResolvedValue(result);
    worktree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(result);

    expect(states.discardState).toEqual({ phase: 'success', value: result });
    expect(states.statusState.phase).toBe('error');
  });
});

describe('同一格上的并发请求：只有最新那一次能写终态', () => {
  // 面板上的筛选器一改就重发一次 diff（三端都这么接），而慢的那一次没有任何东西会取消它。
  // 没有代次守卫时，先发后到的那一份会把更晚的结果盖掉，用户看到的列表与筛选器对不上——
  // 而屏幕上没有任何迹象说明这一格是旧的。
  it('先发的 diff 后完成时，写不进状态——终态属于后发那一次', async () => {
    const { commands, states, worktree } = createFixture();
    const slow = deferred<WorktreeDiff>();
    const fast = deferred<WorktreeDiff>();
    worktree.diff.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const stale = diffWith(9);
    const latest = diffWith(2);

    const first = commands.diff({ entities: ['Old'] });
    const second = commands.diff({ entities: ['New'] });
    fast.resolve(latest);
    await expect(second).resolves.toBe(latest);
    slow.resolve(stale);
    await expect(first).resolves.toBe(stale);

    expect(states.diffState).toEqual({ phase: 'success', value: latest });
  });

  // 失败那一侧更要拦：一次已经被取代的请求报错，会在用户面前把一份**刚刚读成功**的列表
  // 换成错误提示，而那次失败问的是另一个问题。
  it('先发的 status 失败后完成时，盖不掉后发那次的成功', async () => {
    const { commands, states, worktree } = createFixture();
    const slow = deferred<WorktreeStatus>();
    const fast = deferred<WorktreeStatus>();
    worktree.status.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const latest = statusWith(3);

    const first = commands.status();
    const second = commands.status();
    fast.resolve(latest);
    await expect(second).resolves.toBe(latest);
    slow.reject(new CommitValidationError('empty_commit', 'normal'));
    await expect(first).rejects.toBeInstanceOf(CommitValidationError);

    expect(states.statusState).toEqual({ phase: 'success', value: latest });
  });

  // 状态里丢掉它，不等于调用方不知道它失败了：两条出口在 §1 里不是二选一。
  it('被丢弃的那一次仍把异常抛给它自己的调用方', async () => {
    const { commands, transitions, worktree } = createFixture();
    const slow = deferred<boolean>();
    const fast = deferred<boolean>();
    worktree.isEnabled.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const failure = new CommitValidationError('empty_commit', 'normal');

    const first = commands.isEnabled();
    const second = commands.isEnabled();
    fast.resolve(true);
    await expect(second).resolves.toBe(true);
    slow.reject(failure);
    await expect(first).rejects.toBe(failure);

    expect(transitions).toEqual(['isEnabledState:loading', 'isEnabledState:loading', 'isEnabledState:success']);
  });

  // 代次按格子分，不是全局一个计数器：一次 diff 不该把正在飞的 status 判成过期。
  it('代次按格子分——另一格上的新请求不会让本格在飞的那次失效', async () => {
    const { commands, states, worktree } = createFixture();
    const pendingStatus = deferred<WorktreeStatus>();
    worktree.status.mockReturnValueOnce(pendingStatus.promise);
    const diff = diffWith(1);
    worktree.diff.mockResolvedValue(diff);
    const status = statusWith(4);

    const statusCall = commands.status();
    await expect(commands.diff()).resolves.toBe(diff);
    pendingStatus.resolve(status);
    await expect(statusCall).resolves.toBe(status);

    expect(states.statusState).toEqual({ phase: 'success', value: status });
    expect(states.diffState).toEqual({ phase: 'success', value: diff });
  });
});

describe('库上没装工作树插件时，建入口这一步就抛', () => {
  it('`worktree` 缺席时抛在建入口这一步，而不是等第一次 status() 炸在命令层里面', () => {
    // 类型这一层拦不住：`declare module` 把 `worktree` 声明成非可选，而模块增强是**全局**的——
    // 程序里任何一个包 import 过本插件，整个程序里的 `RxDB.worktree` 就都非可选了，
    // 包括那些从没 `use(rxDBPluginWorktree)` 过的库。编译期一声不吭，运行时给 `undefined`。
    const database = { versionManager: {} } as unknown as RxDB;

    expect(() => createWorktreeCommands(database, () => undefined)).toThrow(/rxDBPluginWorktree/);
  });

  it('装了插件时照常建出十六个命令', () => {
    // 守卫写成无条件抛的话这条会红。
    const { commands } = createFixture();

    expect(Object.keys(commands)).toHaveLength(16);
  });
});

describe('US-310 四个 worktree 命令', () => {
  it('listWorktrees 走查询状态：零行是 empty、有行是 success，别的格子不动', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.listWorktrees.mockResolvedValueOnce([]);

    await expect(commands.listWorktrees()).resolves.toEqual([]);
    expect(states.listWorktreesState).toEqual({ phase: 'empty', value: [] });

    await commands.listWorktrees();
    expect(states.listWorktreesState).toEqual({ phase: 'success', value: [WORKTREE_MAIN] });
    expect(untouchedKeys(states, 'listWorktreesState')).toEqual([]);
  });

  // 钉住并切过去：摘要换了分支，列表多了一行、active 勾选也挪了位置——两份都要重读，次序在命令落地之后。
  it('createWorktree 成功：先落 createWorktreeState，再依次重读 status 与列表', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    worktree.createWorktree.mockResolvedValue(WORKTREE_FEATURE);

    await expect(commands.createWorktree('feature', 'Feature')).resolves.toBe(WORKTREE_FEATURE);

    expect(worktree.createWorktree).toHaveBeenCalledWith('feature', 'Feature');
    expect(states.createWorktreeState).toEqual({ phase: 'success', value: WORKTREE_FEATURE });
    expect(transitions).toEqual([
      'createWorktreeState:loading',
      'createWorktreeState:success',
      'statusState:loading',
      'statusState:empty',
      'listWorktreesState:loading',
      'listWorktreesState:success'
    ]);
  });

  // 两阶段：切换阶段失败时行已落库（见 `WorktreeManager.createWorktree` 的 TSDoc），只在成功时重读的话，
  // 列表里会缺一个确实存在、可以重试切换的 worktree；第一阶段被拒（已钉住）多半是手上的列表过期了。
  // status 不重读：失败时要么一行没写、要么切换整笔回滚，当前分支的摘要没变。
  it('createWorktree 失败：原错原样上抛，列表照样重读，status 不重读', async () => {
    const { commands, states, worktree } = createFixture();
    const failure = new WorktreeBranchPinnedError('feature', 'wt-feature');
    worktree.createWorktree.mockRejectedValue(failure);

    await expect(commands.createWorktree('feature')).rejects.toBe(failure);

    expect(states.createWorktreeState).toEqual({ phase: 'error', error: failure });
    expect(worktree.status).not.toHaveBeenCalled();
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);
  });

  it('switchWorktree 成功：id 与 options 原样透传，之后依次重读 status 与列表', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    worktree.switchWorktree.mockResolvedValue(undefined);
    const options = { requireClean: true };

    await expect(commands.switchWorktree('wt-feature', options)).resolves.toBeUndefined();

    expect(worktree.switchWorktree).toHaveBeenCalledWith('wt-feature', options);
    expect(states.switchWorktreeState).toEqual({ phase: 'success', value: undefined });
    expect(transitions).toEqual([
      'switchWorktreeState:loading',
      'switchWorktreeState:success',
      'statusState:loading',
      'statusState:empty',
      'listWorktreesState:loading',
      'listWorktreesState:success'
    ]);
  });

  // 被拒那一刻什么都没切，status 不必重读；但被拒多半意味着列表已经过期（它在别处被删了、
  // 或别处换了 checkout），列表要重读，否则那一行和它的按钮会一直留在屏幕上。
  it('switchWorktree 被拒：原错原样上抛，列表照样重读，status 不重读', async () => {
    const { commands, states, worktree } = createFixture();
    const dirty = new WorktreeDirtyError('main', 2);
    worktree.switchWorktree.mockRejectedValue(dirty);

    await expect(commands.switchWorktree('wt-feature', { requireClean: true })).rejects.toBe(dirty);

    expect(states.switchWorktreeState).toEqual({ phase: 'error', error: dirty });
    expect(worktree.status).not.toHaveBeenCalled();
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);
  });

  // 只删 worktree 那一行：当前分支与它的未提交改动都没动，status 不必重读。
  it('removeWorktree 成功：只重读列表', async () => {
    const { commands, states, transitions, worktree } = createFixture();
    worktree.removeWorktree.mockResolvedValue(undefined);

    await expect(commands.removeWorktree('wt-feature')).resolves.toBeUndefined();

    expect(worktree.removeWorktree).toHaveBeenCalledWith('wt-feature');
    expect(transitions).toEqual([
      'removeWorktreeState:loading',
      'removeWorktreeState:success',
      'listWorktreesState:loading',
      'listWorktreesState:success'
    ]);
    expect(states.statusState).toEqual({ phase: 'idle' });
  });

  // 「删的恰是当前所在」只在列表过期时才会从界面上发生（当前行的移除按钮本就禁用）。
  it('removeWorktree 被拒：原错原样上抛，列表照样重读', async () => {
    const { commands, states, worktree } = createFixture();
    const active = new WorktreeActiveError('wt-main', 'main');
    worktree.removeWorktree.mockRejectedValue(active);

    await expect(commands.removeWorktree('wt-main')).rejects.toBe(active);

    expect(states.removeWorktreeState).toEqual({ phase: 'error', error: active });
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);
    expect(states.statusState).toEqual({ phase: 'idle' });
  });

  // 重读失败已经落进 listWorktreesState 的 error 相位；再抛一次会把一次成功的 worktree 操作
  // 在调用方那里变成失败。
  it('列表重读失败被吞掉：命令照常 resolve，失败只落在 listWorktreesState', async () => {
    const { commands, states, worktree } = createFixture();
    worktree.removeWorktree.mockResolvedValue(undefined);
    const readFailure = new Error('读列表失败');
    worktree.listWorktrees.mockRejectedValue(readFailure);

    await expect(commands.removeWorktree('wt-feature')).resolves.toBeUndefined();

    expect(states.removeWorktreeState).toEqual({ phase: 'success', value: undefined });
    expect(states.listWorktreesState).toEqual({ phase: 'error', error: readFailure });
  });

  // `switchBranch()` 不顺手重读列表：从不显示 worktree 列表的应用不该每切一次分支就白发一轮查询。
  // 读过列表的应用由实时跟随接住那次切换（见下一节）。
  it('switchBranch 不碰 listWorktreesState', async () => {
    const { commands, states, worktree } = createFixture();

    await commands.switchBranch('feature');

    expect(worktree.listWorktrees).not.toHaveBeenCalled();
    expect(states.listWorktreesState).toEqual({ phase: 'idle' });
  });
});

describe('worktree 列表的实时跟随', () => {
  // 创建入口本身一次 IO、一个监听都不发（`idle` 契约）；从没读过列表的应用不为它付任何东西。
  it('第一次读列表之前：一个监听都不挂，事件来了也不读', async () => {
    const { emit, listenerCount, worktree } = createFixture();

    emit(branchActivated());
    await flushRequeries();

    expect(listenerCount()).toBe(0);
    expect(worktree.listWorktrees).not.toHaveBeenCalled();
  });

  it('读过之后：分支激活变化与 worktree 行变化各触发一次重读', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(branchActivated());
    await flushRequeries();
    emit(worktreeRemoved());
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(3);
  });

  it('同一轮里的一串事件合并成一次重读', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(branchActivated());
    emit(worktreeRemoved());
    emit(branchActivated());
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(2);
  });

  it('无关实体的事件不读', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(noteCreated());
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);
  });

  it('别的标签页转发过来的事件照样读', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(branchActivated('cross-tab'));
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(2);
  });

  it('worktree 命令内部那一次重读同样开始跟随', async () => {
    const { commands, emit, worktree } = createFixture();
    worktree.removeWorktree.mockResolvedValue(undefined);
    await commands.removeWorktree('wt-feature');

    emit(branchActivated());
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(2);
  });

  it('dispose 之后摘掉监听、不再读；再读一次列表又接回跟随（React StrictMode 的卸载—重挂）', async () => {
    const { commands, emit, listenerCount, worktree } = createFixture();
    await commands.listWorktrees();

    disposeWorktreeCommands(commands);
    emit(branchActivated());
    await flushRequeries();
    expect(listenerCount()).toBe(0);
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);

    await commands.listWorktrees();
    emit(branchActivated());
    await flushRequeries();
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(3);
  });

  it('dispose 排在事件之后、重读之前：那一次排队的重读也不再发', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(branchActivated());
    disposeWorktreeCommands(commands);
    await flushRequeries();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);
  });

  // 启用之前读过列表的话，那一次落的是「能力未启用」的 error；新库建库时就钉好了 main，启用这一下
  // 不产生任何 worktree 事件，不重读的话列表会一直停在那个 error 上。
  it('读过列表之后 enable() / enableIfEmpty() 成功：重读一次列表', async () => {
    const { commands, worktree } = createFixture();
    worktree.enable.mockResolvedValue(CAPABILITY);
    worktree.enableIfEmpty.mockResolvedValue({ kind: 'enabled', capability: CAPABILITY });
    await commands.listWorktrees();

    await commands.enable();
    await commands.enableIfEmpty();

    expect(worktree.listWorktrees).toHaveBeenCalledTimes(3);
  });

  it('没读过列表时 enable() 不读列表——从不显示列表的应用不为它付一轮查询', async () => {
    const { commands, worktree } = createFixture();
    worktree.enable.mockResolvedValue(CAPABILITY);

    await commands.enable();

    expect(worktree.listWorktrees).not.toHaveBeenCalled();
  });

  it('别的标签页启用了本能力：重读一次列表；别的能力的启用通知不读', async () => {
    const { commands, emit, worktree } = createFixture();
    await commands.listWorktrees();

    emit(new CapabilityEnabledEvent('someOtherCapability'));
    await flushRequeries();
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(1);

    emit(new CapabilityEnabledEvent('workingTree'));
    await flushRequeries();
    expect(worktree.listWorktrees).toHaveBeenCalledTimes(2);
  });

  it('dispose 一份不是 createWorktreeCommands 建的命令：报错而不是静默什么都不做', () => {
    expect(() => disposeWorktreeCommands({} as WorktreeCommands)).toThrow(RxDBError);
  });
});
