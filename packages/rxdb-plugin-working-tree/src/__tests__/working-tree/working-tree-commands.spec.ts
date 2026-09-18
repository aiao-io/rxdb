/**
 * @fileoverview 三端入口共用的**命令层**（`createWorkingTreeCommands`）——
 * contracts/tri-framework-api.md §1/§4 里「不是形态、是语义」的那一半。
 *
 * @remarks
 * 这份实现归本包所有，从前却只被 `@aiao/rxdb-{angular,react,vue}` 的三个
 * `use-working-tree.spec` 覆盖到。那个格局有两个毛病：拥有它的包自己一行都没测；
 * 而三端那三份 spec 各自还要过一层框架容器（`Signal` / 渲染快照 / `ComputedRef`），
 * 于是「哪一步发 loading」「谁之后要重读 status」这些**与框架无关**的判定，
 * 每验一次就要连带把 TestBed / renderHook / `nextTick` 一起拖进来。
 *
 * 本文件把那一层剥掉：`patch` 就是一个往普通对象里写格子的函数，桩只桩到
 * {@link WorkingTreeManager}（与 `switchBranch` 所在的 `VersionManager`）那一层。
 * 剥掉之后能问出三端问不了的一个问题——
 * **「除了这一格，别的格子动没动」**（见 {@link untouchedKeys}）。框架容器下
 * 这个问题会退化成「渲染有没有多跑一次」，而那是框架的事，不是本层的事。
 *
 * 本文件不碰数据库：谁能落库、落成什么样归 `commit-atomicity.spec.ts` /
 * `discard.spec.ts` / `status.spec.ts`；相位机本身归 `async-state.spec.ts`。
 * 这里只测**接线**：十个方法各自接哪一格、哪几个之后要重读 status、错误往哪走。
 *
 * 桩的形状从 T123 起是 `{ workingTree, versionManager }` 而不再是裸 `workingTree`：
 * 清单第十项 `switchBranch` 挂在 `versionManager` 上（contracts/core-api.md §6），
 * 命令层因此收整个库。桩到两个门面**而不是**让 spec 自己造一份 `RxDB`——
 * 本层只用得到这两个属性，多桩出来的每一个都会变成一处与真库无关的约束。
 */

import type { RxDB } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import type { CommitChangeSetPage } from '../../commit/commit-changes.js';
import type { CommitLogOptions, CommitLogPage } from '../../commit/commit-log.js';
import { CommitValidationError } from '../../commit/write-commit.js';
import { WORKING_TREE_INITIAL_ASYNC_STATES, type WorkingTreeAsyncStates } from '../../working-tree/async-state.js';
import type { CommitOptions, CommitResult } from '../../working-tree/commit-command.js';
import type { WorkingTreeCredentials } from '../../working-tree/commit-conflict.js';
import type { WorkingTreeDiff, WorkingTreeDiffOptions } from '../../working-tree/diff.js';
import type { WorkingTreeDiscardOptions, WorkingTreeDiscardResult } from '../../working-tree/discard-command.js';
import type {
  WorkingTreeRestoreOptions,
  WorkingTreeRestoreResult,
  WorkingTreeRestoreSessionInfo,
  WorkingTreeRestoreTarget
} from '../../working-tree/restore-command.js';
import type { WorkingTreeStatus } from '../../working-tree/status.js';
import {
  WorkingTreeDirtyError,
  type WorkingTreeSwitchBranchOptions
} from '../../working-tree/switch-branch-options.js';
import { createWorkingTreeCommands, type WorkingTreeStatePatch } from '../../working-tree/working-tree-commands.js';
import type { WorkingTreeManager } from '../../working-tree/working-tree-facade.js';

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

const statusWith = (entryCount: number): WorkingTreeStatus => ({
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

const diffWith = (entryCount: number): WorkingTreeDiff => ({
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
  expectedWorkingTreeRevision: 3
} satisfies WorkingTreeCredentials;

const COMMIT_OPTIONS: CommitOptions = { ...CREDENTIALS, authorId: 'alice', operationId: 'op-1' };
const DISCARD_OPTIONS: WorkingTreeDiscardOptions = CREDENTIALS;
const RESTORE_OPTIONS: WorkingTreeRestoreOptions = CREDENTIALS;
const RESTORE_TARGET: WorkingTreeRestoreTarget = { commitId: 'commit-1' };

const SESSION: WorkingTreeRestoreSessionInfo = {
  id: 'session-1',
  branchId: 'main',
  targetCommitId: 'commit-1',
  status: 'active'
};

/** 十格状态的可写副本；本层不持有状态，状态在调用方那边，这里替调用方存一份。 */
type MutableAsyncStates = { -readonly [K in keyof WorkingTreeAsyncStates]: WorkingTreeAsyncStates[K] };

/**
 * 除了点名的那几格，还有哪些格子离开了 `idle`。
 *
 * @remarks
 * 这是本文件相对三端 spec 多出来的那一问。`WorkingTreeStatePatch` 按 key 分格正是
 * 为了「`commit()` 进行中不该让 `statusState` 也变成 loading」；而一个整份替换的实现
 * 在三端 spec 下只表现为多一次渲染——看不出来。这里它表现为多一个键，看得出来。
 */
const untouchedKeys = (
  states: WorkingTreeAsyncStates,
  ...touched: readonly (keyof WorkingTreeAsyncStates)[]
): (keyof WorkingTreeAsyncStates)[] =>
  (Object.keys(states) as (keyof WorkingTreeAsyncStates)[]).filter(
    key => !touched.includes(key) && states[key].phase !== 'idle'
  );

/** 桩到 `RxDB.workingTree` / `RxDB.versionManager` 那一层；再往下是命令自己的事，不在本文件重测。 */
const createFixture = () => {
  const states: MutableAsyncStates = { ...WORKING_TREE_INITIAL_ASYNC_STATES };
  // 相位流水账：既记「进了哪一格」也记「什么相位」，用来钉住**次序**——
  // 「命令先落地、再重读 status」只能靠次序证明，靠终值证明不了。
  const transitions: string[] = [];
  const patch: WorkingTreeStatePatch = (key, state) => {
    states[key] = state;
    transitions.push(`${key}:${state.phase}`);
  };

  const workingTree = {
    isEnabled: vi.fn<() => Promise<boolean>>(),
    enable: vi.fn<() => Promise<CommitCapabilityInfo>>(),
    status: vi.fn<() => Promise<WorkingTreeStatus>>(),
    diff: vi.fn<(options?: WorkingTreeDiffOptions) => Promise<WorkingTreeDiff>>(),
    listCommits: vi.fn<(options?: CommitLogOptions) => Promise<CommitLogPage>>(),
    commitChanges: vi.fn<(commitId: string) => Promise<CommitChangeSetPage>>(),
    commit: vi.fn<(message: string, options: CommitOptions) => Promise<CommitResult>>(),
    discard: vi.fn<(options: WorkingTreeDiscardOptions) => Promise<WorkingTreeDiscardResult>>(),
    restore:
      vi.fn<
        (target: WorkingTreeRestoreTarget, options: WorkingTreeRestoreOptions) => Promise<WorkingTreeRestoreResult>
      >(),
    restoreSession: vi.fn<() => Promise<WorkingTreeRestoreSessionInfo | null>>()
  };
  workingTree.status.mockResolvedValue(statusWith(0));

  const versionManager = {
    switchBranch: vi.fn<(branchId: string, options?: WorkingTreeSwitchBranchOptions) => Promise<void>>()
  };
  versionManager.switchBranch.mockResolvedValue(undefined);

  // `versionManager` 由历史插件在连接纪元内 `defineProperty` 装上，这里用取值器桩住它，
  // 顺带把「命令层是不是每次现取」问出来：构造时存一份的实现下 `versionManagerReads`
  // 会停在 1，而真库里那一份在释放后就没了。
  let versionManagerReads = 0;
  const database = {
    workingTree: workingTree as unknown as WorkingTreeManager,
    get versionManager() {
      versionManagerReads += 1;
      return versionManager;
    }
  } as unknown as RxDB;

  const commands = createWorkingTreeCommands(database, patch);
  return {
    commands,
    states,
    transitions,
    workingTree,
    versionManager,
    versionManagerReadCount: () => versionManagerReads
  };
};

describe('十一个命令各自只驱动自己那一格（§4）', () => {
  it('isEnabled 走命令状态，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.isEnabled.mockResolvedValue(true);

    await expect(commands.isEnabled()).resolves.toBe(true);

    expect(states.isEnabledState).toEqual({ phase: 'success', value: true });
    expect(untouchedKeys(states, 'isEnabledState')).toEqual([]);
  });

  it('status 走查询状态，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const dirty = statusWith(3);
    workingTree.status.mockResolvedValue(dirty);

    await expect(commands.status()).resolves.toBe(dirty);

    expect(states.statusState).toEqual({ phase: 'success', value: dirty });
    expect(untouchedKeys(states, 'statusState')).toEqual([]);
  });

  it('diff 走查询状态，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const diff = diffWith(2);
    workingTree.diff.mockResolvedValue(diff);

    await expect(commands.diff()).resolves.toBe(diff);

    expect(states.diffState).toEqual({ phase: 'success', value: diff });
    expect(untouchedKeys(states, 'diffState')).toEqual([]);
  });

  it('listCommits 走查询状态，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const page = logWith(2);
    workingTree.listCommits.mockResolvedValue(page);

    await expect(commands.listCommits()).resolves.toBe(page);

    expect(states.listCommitsState).toEqual({ phase: 'success', value: page });
    expect(untouchedKeys(states, 'listCommitsState')).toEqual([]);
  });

  it('commitChanges 走查询状态，零变更单元是 empty，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const empty = changesWith(0);
    workingTree.commitChanges.mockResolvedValue(empty);

    await expect(commands.commitChanges('commit-1')).resolves.toBe(empty);

    expect(states.commitChangesState).toEqual({ phase: 'empty', value: empty });
    expect(untouchedKeys(states, 'commitChangesState')).toEqual([]);
  });

  it('restoreSession 走查询状态，其余九格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.restoreSession.mockResolvedValue(SESSION);

    await expect(commands.restoreSession()).resolves.toBe(SESSION);

    expect(states.restoreSessionState).toEqual({ phase: 'success', value: SESSION });
    expect(untouchedKeys(states, 'restoreSessionState')).toEqual([]);
  });

  // restore 进行中时**只有** restoreState 在 loading：恢复要写满一整个 commit 的条目，
  // 是九个方法里最慢的一个，此刻若 statusState 也被推成 loading，面板上那份还完全有效的
  // 摘要会在整段恢复期间变成一个转圈——而它根本没有被重读。
  it('restore 进行中时只有 restoreState 是 loading，statusState 照旧 idle', async () => {
    const { commands, states, workingTree } = createFixture();
    const pending = deferred<WorkingTreeRestoreResult>();
    workingTree.restore.mockReturnValue(pending.promise);

    const call = commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);
    expect(states.restoreState).toEqual({ phase: 'loading' });
    expect(untouchedKeys(states, 'restoreState')).toEqual([]);

    pending.resolve({ ok: true, restoredCount: 3, sessionId: 'session-1', workingTreeRevision: 4 });
    await call;
  });

  // 「进行中」必须先于结果发出（§4），而且此刻**只有**这一格在 loading。
  it('commit 进行中时只有 commitState 是 loading，statusState 照旧 idle', async () => {
    const { commands, states, workingTree } = createFixture();
    const pending = deferred<CommitResult>();
    workingTree.commit.mockReturnValue(pending.promise);

    const call = commands.commit('第一次提交', COMMIT_OPTIONS);
    expect(states.commitState).toEqual({ phase: 'loading' });
    expect(untouchedKeys(states, 'commitState')).toEqual([]);

    pending.resolve({ ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 });
    await call;
  });

  // 切分支要重放目标分支的整段历史，是十个方法里第二慢的一个。此刻若 statusState 也被推成
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
    const { commands, states, workingTree } = createFixture();
    const clean = statusWith(0);
    workingTree.status.mockResolvedValue(clean);

    await commands.status();

    expect(states.statusState).toEqual({ phase: 'empty', value: clean });
  });

  it('零条目的 diff 落在 empty', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.diff.mockResolvedValue(diffWith(0));

    await commands.diff();

    expect(states.diffState.phase).toBe('empty');
  });

  it('没有历史的分支落在 empty', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.listCommits.mockResolvedValue(logWith(0));

    await commands.listCommits();

    expect(states.listCommitsState.phase).toBe('empty');
  });

  // 「没有未结束的恢复会话」是这个查询唯一的空形态，而且是**绝大多数**时刻的形态。
  // 把 `null` 画成 success 的话，模板要么给「没有会话」渲染一块恢复中的横幅，
  // 要么每处绑定各写一遍 `=== null`——而那份判据迟早有一端写成 `status !== 'active'`。
  it('没有未结束会话时落在 empty，且照样带着那个 null', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.restoreSession.mockResolvedValue(null);

    await expect(commands.restoreSession()).resolves.toBeNull();

    expect(states.restoreSessionState).toEqual({ phase: 'empty', value: null });
  });

  // 有会话就是 success，无论它是 active 还是 conflicted：这个查询只回答
  // 「有没有、来自哪个 commit」，「还成不成立」是 status() 那两位的事。
  it('conflicted 的会话照样是 success，不因为「不健康」被算成空', async () => {
    const { commands, states, workingTree } = createFixture();
    const conflicted: WorkingTreeRestoreSessionInfo = { ...SESSION, status: 'conflicted' };
    workingTree.restoreSession.mockResolvedValue(conflicted);

    await commands.restoreSession();

    expect(states.restoreSessionState).toEqual({ phase: 'success', value: conflicted });
  });
});

describe('入参原样透传，签名不做框架化改写（§1）', () => {
  it('diff 与 listCommits 的可选入参原样传下去；不传就是不传', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.diff.mockResolvedValue(diffWith(1));
    workingTree.listCommits.mockResolvedValue(logWith(1));
    const diffOptions: WorkingTreeDiffOptions = { limit: 10 };
    const logOptions: CommitLogOptions = { limit: 5 };

    await commands.diff(diffOptions);
    await commands.listCommits(logOptions);
    await commands.diff();

    expect(workingTree.diff).toHaveBeenNthCalledWith(1, diffOptions);
    expect(workingTree.listCommits).toHaveBeenCalledWith(logOptions);
    expect(workingTree.diff).toHaveBeenNthCalledWith(2, undefined);
  });

  // 三个捕获位由调用方给，入口内部**不**代读：内部读到的恒等于当前值，
  // CAS 永远命中，FR-031 当场失效。所以这里钉的是「原样两个位置参数」。
  it('commit 的 message 与 options 原样两个位置参数传下去', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.commit.mockResolvedValue({ ok: true, commitId: 'c-1', changeSetCount: 1, headRevision: 3 });

    await commands.commit('第一次提交', COMMIT_OPTIONS);

    expect(workingTree.commit).toHaveBeenCalledWith('第一次提交', COMMIT_OPTIONS);
  });

  // 与 commit 同形的「恰好两个位置参数」：`options` 若可缺省，「缺省时由入口内部读 revision」
  // 就成了合法用法，而内部读到的恒等于当前值、CAS 永远命中——FR-034 对 restore 的那半句当场失效。
  it('restore 的 target 与 options 原样两个位置参数传下去', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    });

    await commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);

    expect(workingTree.restore).toHaveBeenCalledWith(RESTORE_TARGET, RESTORE_OPTIONS);
  });

  // `entities` 的缺省语义是「整个 commit」，与「传了一个空数组」不是一回事。
  // 入口替调用方补一个 `entities: []` 会把「整个 commit」悄悄改成「一个实体都不恢复」。
  it('restore 的 entities 子集原样带下去，不被补齐也不被抹掉', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 1,
      sessionId: 'session-2',
      workingTreeRevision: 5
    });
    const subset: WorkingTreeRestoreTarget = {
      commitId: 'commit-1',
      entities: [{ namespace: 'app', entity: 'Note', entityId: 'note-1' }]
    };

    await commands.restore(subset, RESTORE_OPTIONS);

    expect(workingTree.restore).toHaveBeenCalledWith(subset, RESTORE_OPTIONS);
  });

  it('restoreSession 不带任何入参：会话恒属当前 active 分支（FR-048）', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.restoreSession.mockResolvedValue(null);

    await commands.restoreSession();

    expect(workingTree.restoreSession).toHaveBeenCalledWith();
  });

  // `options` 缺省与传 `{ requireClean: false }` 在核心是同一件事，但「入口替调用方补一个
  // 空对象」不是：`assertSwitchBranchPreconditions` 靠「一个条件都没提」来决定**一条语句都不发**，
  // 补出来的空对象会让每一次切换白读一次 active 分支令牌。
  it('switchBranch 的 branchId 与 options 原样传下去；不传就是不传', async () => {
    const { commands, versionManager } = createFixture();
    const options: WorkingTreeSwitchBranchOptions = { requireClean: true, expectedActivationRevision: 1 };

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

  it('discard 的三个捕获位原样传下去', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.discard.mockResolvedValue({ ok: true, discardedCount: 0, workingTreeRevision: 3 });

    await commands.discard(DISCARD_OPTIONS);

    expect(workingTree.discard).toHaveBeenCalledWith(DISCARD_OPTIONS);
  });
});

describe('改动之后重读一次 status，查询之后不重读', () => {
  // 工作树没有变更流：不重读的话，用户刚提交完，面板上仍写着「3 条未提交变更」。
  it('enable 成功之后重读 status，且重读排在 enableState 落地之后', async () => {
    const { commands, states, transitions, workingTree } = createFixture();
    workingTree.enable.mockResolvedValue(CAPABILITY);
    workingTree.status.mockResolvedValue(statusWith(0));

    await expect(commands.enable()).resolves.toBe(CAPABILITY);

    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(states.enableState).toEqual({ phase: 'success', value: CAPABILITY });
    expect(transitions).toEqual([
      'enableState:loading',
      'enableState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  it('commit 成功之后重读 status', async () => {
    const { commands, transitions, workingTree } = createFixture();
    const result: CommitResult = { ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 };
    workingTree.commit.mockResolvedValue(result);
    workingTree.status.mockResolvedValue(statusWith(0));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(result);

    expect(workingTree.status).toHaveBeenCalledTimes(1);
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
    const { commands, transitions, workingTree } = createFixture();
    workingTree.discard.mockResolvedValue({ ok: true, discardedCount: 3, workingTreeRevision: 4 });
    workingTree.status.mockResolvedValue(statusWith(0));

    await commands.discard(DISCARD_OPTIONS);

    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(transitions).toEqual([
      'discardState:loading',
      'discardState:success',
      'statusState:loading',
      'statusState:empty'
    ]);
  });

  // `discardedCount: 0` 是一次明确的 no-op **结果**，落在 success，不是 empty。
  it('discardedCount 为零照样是 success，也照样重读', async () => {
    const { commands, states, workingTree } = createFixture();
    const noop: WorkingTreeDiscardResult = { ok: true, discardedCount: 0, workingTreeRevision: 3 };
    workingTree.discard.mockResolvedValue(noop);

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(noop);

    expect(states.discardState).toEqual({ phase: 'success', value: noop });
    expect(workingTree.status).toHaveBeenCalledTimes(1);
  });

  // restore 把一整个 commit 的内容写成未提交条目，工作树从 clean 变脏——不重读的话，
  // 用户刚恢复完 100 个单元，面板上仍写着「没有未提交的改动」，而下一次 commit()
  // 会带走这 100 条。
  it('restore 成功之后重读 status，且重读排在 restoreState 落地之后', async () => {
    const { commands, transitions, workingTree } = createFixture();
    const result: WorkingTreeRestoreResult = {
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    };
    workingTree.restore.mockResolvedValue(result);
    workingTree.status.mockResolvedValue(statusWith(3));

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(result);

    expect(workingTree.status).toHaveBeenCalledTimes(1);
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
    const { commands, states, workingTree } = createFixture();
    const noop: WorkingTreeRestoreResult = {
      ok: true,
      restoredCount: 0,
      sessionId: null,
      workingTreeRevision: 3
    };
    workingTree.restore.mockResolvedValue(noop);

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(noop);

    expect(states.restoreState).toEqual({ phase: 'success', value: noop });
    expect(workingTree.status).toHaveBeenCalledTimes(1);
  });

  // 恢复成功之后**不**顺手重读会话：`restoreSession()` 只回答「有没有、来自哪个 commit」，
  // 而刚刚那次恢复的 `sessionId` 已经在返回值里；「这个会话还成不成立」的唯一出口是
  // `status()` 的 restoring / conflicted 两位，而那一份摘要上一行已经重读过了。
  // 顺手读一次等于给每次恢复多发一轮查询，换来一份调用方已经拿在手里的 id。
  it('restore 之后不顺手重读会话，restoreSessionState 停在 idle', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.restore.mockResolvedValue({
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    });

    await commands.restore(RESTORE_TARGET, RESTORE_OPTIONS);

    expect(workingTree.restoreSession).not.toHaveBeenCalled();
    expect(states.restoreSessionState).toEqual({ phase: 'idle' });
  });

  // 切过去之后面板上那份摘要属于**另一条**分支：条目数、三个捕获位、restoring 位全是旧分支的。
  // 不重读的话，用户切到一条干净分支后仍看着「3 条未提交变更」，而下一次 commit() 会带着
  // 一份对不上的 `expectedWorkingTreeRevision` 撞 CAS。
  it('switchBranch 成功之后重读 status，且重读排在 switchBranchState 落地之后', async () => {
    const { commands, states, transitions, workingTree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(0));

    await expect(commands.switchBranch('feature')).resolves.toBeUndefined();

    expect(workingTree.status).toHaveBeenCalledTimes(1);
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
    const { commands, states, workingTree } = createFixture();

    await commands.switchBranch('main');

    expect(states.switchBranchState).toEqual({ phase: 'success', value: undefined });
    expect(workingTree.status).toHaveBeenCalledTimes(1);
  });

  it('isEnabled / status / diff / listCommits / restoreSession 都不额外重读 status', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.isEnabled.mockResolvedValue(false);
    workingTree.diff.mockResolvedValue(diffWith(1));
    workingTree.listCommits.mockResolvedValue(logWith(1));
    workingTree.restoreSession.mockResolvedValue(null);

    await commands.isEnabled();
    await commands.diff();
    await commands.listCommits();
    await commands.restoreSession();

    expect(workingTree.status).not.toHaveBeenCalled();

    // status() 自己那一次不算「重读」：它就是那一次读。
    await commands.status();
    expect(workingTree.status).toHaveBeenCalledTimes(1);
  });
});

describe('错误既进状态，也继续往上抛（§1）', () => {
  // 只记进状态、不抛，会让 `await entry.commit(msg, opts)` 在提交失败时静静往下走——
  // 调用方拿到一个已经 resolve 的 promise，而工作树一个字节都没动。
  it('commit 抛错时 commitState 进 error，且原样的错误继续抛', async () => {
    const { commands, states, workingTree } = createFixture();
    const failure = new CommitValidationError('empty_commit', 'normal');
    workingTree.commit.mockRejectedValue(failure);

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).rejects.toBe(failure);

    expect(states.commitState).toEqual({ phase: 'error', error: failure });
  });

  // 什么都没提交，也就没有什么可重读的；顺手重读会让一次失败的提交多发一轮查询。
  it('commit 抛错时不重读 status，statusState 停在 idle', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.commit.mockRejectedValue(new CommitValidationError('empty_commit', 'normal'));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).rejects.toThrow();

    expect(workingTree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'commitState')).toEqual([]);
  });

  it('enable 抛错时不重读 status', async () => {
    const { commands, states, workingTree } = createFixture();
    const failure = new Error('迁移中断');
    workingTree.enable.mockRejectedValue(failure);

    await expect(commands.enable()).rejects.toBe(failure);

    expect(states.enableState).toEqual({ phase: 'error', error: failure });
    expect(workingTree.status).not.toHaveBeenCalled();
  });

  it('discard 抛错时不重读 status', async () => {
    const { commands, states, workingTree } = createFixture();
    const failure = new Error('工作树正在恢复');
    workingTree.discard.mockRejectedValue(failure);

    await expect(commands.discard(DISCARD_OPTIONS)).rejects.toBe(failure);

    expect(states.discardState).toEqual({ phase: 'error', error: failure });
    expect(workingTree.status).not.toHaveBeenCalled();
  });

  // 抛出来只可能是能力未启用或提交图损坏（FR-051）——两者都意味着一个字节都没写进工作树，
  // 没有什么可重读的。
  it('restore 抛错时进 error、继续抛，且不重读 status', async () => {
    const { commands, states, workingTree } = createFixture();
    const failure = new Error('提交图已损坏');
    workingTree.restore.mockRejectedValue(failure);

    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).rejects.toBe(failure);

    expect(states.restoreState).toEqual({ phase: 'error', error: failure });
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'restoreState')).toEqual([]);
  });

  it('restoreSession 抛错时进 error 并继续抛，且不发 empty', async () => {
    const { commands, states, transitions, workingTree } = createFixture();
    const failure = new Error('能力未启用');
    workingTree.restoreSession.mockRejectedValue(failure);

    await expect(commands.restoreSession()).rejects.toBe(failure);

    expect(states.restoreSessionState).toEqual({ phase: 'error', error: failure });
    expect(transitions).toEqual(['restoreSessionState:loading', 'restoreSessionState:error']);
  });

  // 被 `requireClean` 拒掉与「切换本身炸了」在本层是同一件事：两者都**抛**，与 commit() 的
  // CAS 落败（返回值）不同。因为被拒的那一刻分支根本没切，没有任何「结果」可以交给调用方——
  // 翻成返回值的话，`await tree.switchBranch(id, { requireClean: true })` 之后那行
  // 「已经切过去了」的代码会照跑。
  it('switchBranch 撞上脏工作树时进 error、继续抛，且不重读 status', async () => {
    const { commands, states, versionManager, workingTree } = createFixture();
    const failure = new WorkingTreeDirtyError('main', 2);
    versionManager.switchBranch.mockRejectedValue(failure);

    await expect(commands.switchBranch('feature', { requireClean: true })).rejects.toBe(failure);

    expect(states.switchBranchState).toEqual({ phase: 'error', error: failure });
    // 一个字节都没动，分支也没换：重读只会把同一份摘要再取一遍。
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(untouchedKeys(states, 'switchBranchState')).toEqual([]);
  });

  it('isEnabled 抛错时进 error 并继续抛', async () => {
    const { commands, states, workingTree } = createFixture();
    const failure = new Error('连接已断开');
    workingTree.isEnabled.mockRejectedValue(failure);

    await expect(commands.isEnabled()).rejects.toBe(failure);

    expect(states.isEnabledState).toEqual({ phase: 'error', error: failure });
  });

  it('查询抛错时进 error 并继续抛，且不发 empty', async () => {
    const { commands, states, transitions, workingTree } = createFixture();
    const failure = new Error('提交图损坏');
    workingTree.listCommits.mockRejectedValue(failure);

    await expect(commands.listCommits()).rejects.toBe(failure);

    expect(states.listCommitsState).toEqual({ phase: 'error', error: failure });
    expect(transitions).toEqual(['listCommitsState:loading', 'listCommitsState:error']);
  });
});

describe('CommitConflict 是返回值，不是崩溃（§4）', () => {
  it('ok:false 落在 success 相位，并且照样重读 status', async () => {
    const { commands, states, workingTree } = createFixture();
    const conflicted: CommitResult = {
      ok: false,
      conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: 'main' }
    };
    workingTree.commit.mockResolvedValue(conflicted);
    workingTree.status.mockResolvedValue(statusWith(3));

    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(conflicted);

    expect(states.commitState).toEqual({ phase: 'success', value: conflicted });
    // 冲突的出路是「重新 status() 再提交一次」，所以这一次重读恰恰是必须发生的：
    // 别人动过工作树，面板上那份摘要已经是旧的了。
    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(states.statusState).toEqual({ phase: 'success', value: statusWith(3) });
  });

  // restore 的四个被拒成因全都是**返回值**：脏工作树与不兼容要用户去处理，不可达是问错了
  // 节点，冲突要重来一次——四者都不是崩溃。翻成 error 会让 UI 把一次正常的仲裁渲染成故障。
  it.each(['conflict', 'dirty_working_tree', 'incompatible_schema', 'unreachable_target'] as const)(
    'restore 被拒（%s）落在 success 相位，并且照样重读 status',
    async reason => {
      const { commands, states, workingTree } = createFixture();
      const rejected = { ok: false, reason } as WorkingTreeRestoreResult;
      workingTree.restore.mockResolvedValue(rejected);
      workingTree.status.mockResolvedValue(statusWith(3));

      await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(rejected);

      expect(states.restoreState).toEqual({ phase: 'success', value: rejected });
      // 被拒本身就说明面板上那份摘要与库里对不上了：`dirty_working_tree` 是它显示的
      // 「没有未提交改动」不成立，`conflict` 是三个捕获位已经过期。
      expect(workingTree.status).toHaveBeenCalledTimes(1);
    }
  );

  it('discard 的 ok:false 同样落在 success 相位', async () => {
    const { commands, states, workingTree } = createFixture();
    const conflicted: WorkingTreeDiscardResult = {
      ok: false,
      conflict: { kind: 'working_tree_revision', expected: 3, actual: 4, branchId: 'main' }
    };
    workingTree.discard.mockResolvedValue(conflicted);

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(conflicted);

    expect(states.discardState).toEqual({ phase: 'success', value: conflicted });
  });
});

describe('重读失败被吞掉：一次成功的提交不能因为重读而变成失败', () => {
  it('commit 成功但 status 重读失败时，commit 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    const result: CommitResult = { ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 };
    workingTree.commit.mockResolvedValue(result);
    const readFailure = new Error('读 status 时连接断了');
    workingTree.status.mockRejectedValue(readFailure);

    // 提交确实成功了：再抛一次会把它在调用方那里变成失败。
    await expect(commands.commit('第一次提交', COMMIT_OPTIONS)).resolves.toBe(result);

    // 但它并没有被藏起来——重读的失败照样落进 statusState 的 error 相位，面板看得见。
    expect(states.commitState).toEqual({ phase: 'success', value: result });
    expect(states.statusState).toEqual({ phase: 'error', error: readFailure });
  });

  it('restore 成功但 status 重读失败时，restore 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    const result: WorkingTreeRestoreResult = {
      ok: true,
      restoredCount: 3,
      sessionId: 'session-1',
      workingTreeRevision: 4
    };
    workingTree.restore.mockResolvedValue(result);
    workingTree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    // 100 个条目确实已经写进工作树了：再抛一次会让调用方以为恢复没发生，
    // 而它接下来大概率会重试一次——那一次会撞上 `dirty_working_tree`。
    await expect(commands.restore(RESTORE_TARGET, RESTORE_OPTIONS)).resolves.toBe(result);

    expect(states.restoreState).toEqual({ phase: 'success', value: result });
    expect(states.statusState.phase).toBe('error');
  });

  it('enable 成功但 status 重读失败时，enable 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.enable.mockResolvedValue(CAPABILITY);
    workingTree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    await expect(commands.enable()).resolves.toBe(CAPABILITY);

    expect(states.enableState).toEqual({ phase: 'success', value: CAPABILITY });
    expect(states.statusState.phase).toBe('error');
  });

  it('switchBranch 成功但 status 重读失败时，switchBranch 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    const readFailure = new Error('读 status 时连接断了');
    workingTree.status.mockRejectedValue(readFailure);

    // 分支确实已经切过去了：再抛一次会让调用方以为还停在原处，而它接下来那次「重试切换」
    // 会从新分支切回去——恰好是相反的动作。
    await expect(commands.switchBranch('feature')).resolves.toBeUndefined();

    expect(states.switchBranchState).toEqual({ phase: 'success', value: undefined });
    expect(states.statusState).toEqual({ phase: 'error', error: readFailure });
  });

  it('discard 成功但 status 重读失败时，discard 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    const result: WorkingTreeDiscardResult = { ok: true, discardedCount: 3, workingTreeRevision: 4 };
    workingTree.discard.mockResolvedValue(result);
    workingTree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    await expect(commands.discard(DISCARD_OPTIONS)).resolves.toBe(result);

    expect(states.discardState).toEqual({ phase: 'success', value: result });
    expect(states.statusState.phase).toBe('error');
  });
});

describe('库上没装工作树插件时，建入口这一步就抛', () => {
  it('`workingTree` 缺席时抛在建入口这一步，而不是等第一次 status() 炸在命令层里面', () => {
    // 类型这一层拦不住：`declare module` 把 `workingTree` 声明成非可选，而模块增强是**全局**的——
    // 程序里任何一个包 import 过本插件，整个程序里的 `RxDB.workingTree` 就都非可选了，
    // 包括那些从没 `use(rxDBPluginWorkingTree)` 过的库。编译期一声不吭，运行时给 `undefined`。
    const database = { versionManager: {} } as unknown as RxDB;

    expect(() => createWorkingTreeCommands(database, () => undefined)).toThrow(/rxDBPluginWorkingTree/);
  });

  it('装了插件时照常建出十一个命令', () => {
    // 守卫写成无条件抛的话这条会红。
    const { commands } = createFixture();

    expect(Object.keys(commands)).toHaveLength(11);
  });
});
