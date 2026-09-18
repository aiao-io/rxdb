/**
 * `useWorkingTree` —— Angular 侧（T086）。
 *
 * @remarks
 * 与 `packages/rxdb-plugin-working-tree-react/src/__tests__/use-working-tree.spec.tsx`、
 * `packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts` **逐条对齐**：同名方法、同名
 * 状态字段、同一组相位、同一份「哪些结果算 empty」的答案、无 provider 时同样抛错。
 * 只有容器形态不同 —— Angular 是 `Signal`，React 是渲染快照，Vue 是 `ComputedRef`。
 *
 * 断言打在**真的** `createWorkingTreeCommands` 接出来的状态机上，桩只桩到
 * `RxDB.workingTree` 那一层：这一层要证明的是「界面看到的相位对不对」，而不是
 * 「有没有人喊了一声 commit」。桩用手控的 deferred 而不是立即 resolve 的 promise，
 * 否则 `loading` 相位在断言之前就已经过去了 —— 而 §4 要求的正是它可观测。
 *
 * **本文件覆盖 tri-framework-api.md §3 清单十项，十项到齐。** `restore()` / `restoreSession()`
 * 由 T110 接到本端；最后一项 `switchBranch` 的 `WorkingTreeSwitchBranchOptions` 由 T123 接上 ——
 * 它的桩落在 `RxDB.versionManager` 而不是 `workingTree`（contracts/core-api.md §6 把它钉在
 * `VersionManager` 上），三端入口因此都改成收整个库。末尾的清单守卫把这件事写成断言而不是
 * 注释：哪一项现在该在、哪一项现在不该在，都由 `deliveredIn` 一列说了算 —— `switchBranch`
 * 那一行今天就是被它逼着从「不该有」翻成「该有」的，而不是被想起来的。
 */
import type { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import {
  CommitValidationError,
  WorkingTreeDirtyError,
  type CommitCapabilityInfo,
  type CommitChangeSetPage,
  type CommitLogPage,
  type CommitResult,
  type WorkingTreeCredentials,
  type WorkingTreeDiff,
  type WorkingTreeDiscardResult,
  type WorkingTreeManager,
  type WorkingTreeRestoreResult,
  type WorkingTreeRestoreSessionInfo,
  type WorkingTreeRestoreTarget,
  type WorkingTreeStatus,
  type WorkingTreeSwitchBranchOptions
} from '@aiao/rxdb-plugin-working-tree';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkingTree, type WorkingTreeResource } from '../use-working-tree';

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

/**
 * 一行未结束的恢复会话。
 *
 * @remarks
 * `status` 由调用方给：`conflicted` 也是「还在」的一种，而它必须照样落在 `success`——
 * 那种会话仍占着 `activeKey` 的唯一索引、仍拦着下一次 restore、仍要用户处理掉。
 */
const sessionWith = (status: WorkingTreeRestoreSessionInfo['status']): WorkingTreeRestoreSessionInfo => ({
  id: 'session-1',
  branchId: 'main',
  targetCommitId: 'commit-1',
  status
});

/** 一次写进三条条目的成功恢复。 */
const RESTORE_OK = {
  ok: true,
  restoredCount: 3,
  sessionId: 'session-1',
  workingTreeRevision: 4
} satisfies WorkingTreeRestoreResult;

/**
 * 四个被拒出口各一份**完整**载荷。
 *
 * @remarks
 * 四种全列而不是挑一种代表：`reason` 是判别位，而 `conflict` / `incompatible` 只挂在其中两个
 * 分支上。只测 `dirty_working_tree` 的话，「带载荷的那两种有没有被原样带到 `success` 相位里」
 * 在本端永远没人问过——而界面要显示的恰恰是那两份载荷。
 */
const REJECTED_RESTORES = [
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
] as const satisfies readonly WorkingTreeRestoreResult[];

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
const CREDENTIALS = {
  expectedBranch: { branchId: 'main', activationRevision: 1 },
  expectedHeadRevision: 2,
  expectedWorkingTreeRevision: 3
} satisfies WorkingTreeCredentials;

/** 整份恢复：`entities` 缺省即目标 commit 的全部单元。 */
const RESTORE_TARGET: WorkingTreeRestoreTarget = { commitId: 'commit-1' };

/** 桩到 `RxDB.workingTree` 那一层；再往下是核心自己的事，不在本端重测。 */
const createStub = () => {
  const workingTree = {
    isEnabled: vi.fn<() => Promise<boolean>>(),
    enable: vi.fn<() => Promise<CommitCapabilityInfo>>(),
    status: vi.fn<() => Promise<WorkingTreeStatus>>(),
    diff: vi.fn<() => Promise<WorkingTreeDiff>>(),
    listCommits: vi.fn<() => Promise<CommitLogPage>>(),
    commitChanges: vi.fn<() => Promise<CommitChangeSetPage>>(),
    commit: vi.fn<() => Promise<CommitResult>>(),
    discard: vi.fn<() => Promise<WorkingTreeDiscardResult>>(),
    restore: vi.fn<() => Promise<WorkingTreeRestoreResult>>(),
    restoreSession: vi.fn<() => Promise<WorkingTreeRestoreSessionInfo | null>>()
  };
  workingTree.status.mockResolvedValue(statusWith(0));
  return workingTree;
};

/**
 * 桩到 `RxDB.versionManager` 那一层 —— 清单第十项 `switchBranch` 挂在这里，不在 `workingTree`
 * 上（contracts/core-api.md §6）。两个门面分开桩而不是合成一个对象：合起来之后
 * 「入口从哪个门面取这个方法」在本端就没人问过了，而那正是 T123 唯一改动的接线。
 */
const createVersionManagerStub = () => {
  const versionManager = {
    switchBranch: vi.fn<(branchId: string, options?: WorkingTreeSwitchBranchOptions) => Promise<void>>()
  };
  versionManager.switchBranch.mockResolvedValue(undefined);
  return versionManager;
};

const createFixture = () => {
  const workingTree = createStub();
  const versionManager = createVersionManagerStub();
  const rxdb = {
    workingTree: workingTree as unknown as WorkingTreeManager,
    versionManager
  } as unknown as RxDB;

  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRxDB(rxdb)] });
  const tree = TestBed.runInInjectionContext(() => useWorkingTree());
  return { workingTree, versionManager, tree };
};

/** 让已经 resolve 的微任务跑完；不做真实计时。 */
const flush = () => Promise.resolve().then(() => undefined);

afterEach(() => TestBed.resetTestingModule());

describe('useWorkingTree：初始状态', () => {
  // 挂上去就去读库，会让每个用到这个入口的组件在挂载时各发一轮查询，
  // 而其中大多数只是想拿到 commit() 这个方法。
  it('十格全是 idle，创建入口本身一次 IO 都不发', () => {
    const { workingTree, tree } = createFixture();

    expect([
      tree.isEnabledState().phase,
      tree.enableState().phase,
      tree.statusState().phase,
      tree.diffState().phase,
      tree.listCommitsState().phase,
      tree.commitState().phase,
      tree.discardState().phase,
      tree.restoreState().phase,
      tree.restoreSessionState().phase,
      tree.switchBranchState().phase
    ]).toEqual(['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle']);
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(workingTree.isEnabled).not.toHaveBeenCalled();
  });
});

describe('useWorkingTree：loading 可观测（§4）', () => {
  it('命令发出后、结果回来之前，那一格是 loading', async () => {
    const { workingTree, tree } = createFixture();
    const pending = deferred<boolean>();
    workingTree.isEnabled.mockReturnValue(pending.promise);

    const running = tree.isEnabled();
    expect(tree.isEnabledState().phase).toBe('loading');

    pending.resolve(true);
    await running;
    expect(tree.isEnabledState()).toEqual({ phase: 'success', value: true });
  });

  it('提交期间不静默：commitState 先进 loading', async () => {
    const { workingTree, tree } = createFixture();
    const pending = deferred<CommitResult>();
    workingTree.commit.mockReturnValue(pending.promise);

    const running = tree.commit('第一次提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-1' });
    expect(tree.commitState().phase).toBe('loading');

    pending.resolve({ ok: true, commitId: 'commit-1', changeSetCount: 2, headRevision: 3 });
    await running;
    expect(tree.commitState().phase).toBe('success');
  });

  // 恢复是这十项里最慢的一个：整个 commit 的单元要一条条物化写回工作树。这一格在结果回来之前
  // 不出声的话，用户看到的是一个按下去毫无反应、几百毫秒后突然变脏的面板。
  it('恢复期间不静默：restoreState 先进 loading', async () => {
    const { workingTree, tree } = createFixture();
    const pending = deferred<WorkingTreeRestoreResult>();
    workingTree.restore.mockReturnValue(pending.promise);

    const running = tree.restore(RESTORE_TARGET, CREDENTIALS);
    expect(tree.restoreState().phase).toBe('loading');

    pending.resolve(RESTORE_OK);
    await running;
    expect(tree.restoreState().phase).toBe('success');
  });

  // 切分支要把目标分支的整段历史重放一遍。这一格在结果回来之前不出声的话，用户看到的是一个
  // 按下去毫无反应的分支下拉框 —— 而他多半会再点一次，于是两次切换叠在一起。
  it('切换期间不静默：switchBranchState 先进 loading', async () => {
    const { versionManager, tree } = createFixture();
    const pending = deferred<void>();
    versionManager.switchBranch.mockReturnValue(pending.promise);

    const running = tree.switchBranch('feature');
    expect(tree.switchBranchState().phase).toBe('loading');

    pending.resolve();
    await running;
    expect(tree.switchBranchState().phase).toBe('success');
  });
});

describe('useWorkingTree：查询的 empty 相位（§4）', () => {
  it('干净工作树的 status 落在 empty，并且带着那份 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(0));

    await tree.status();

    expect(tree.statusState()).toEqual({ phase: 'empty', value: statusWith(0) });
  });

  it('有未提交变更时 status 落在 success', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(3));

    await tree.status();

    expect(tree.statusState().phase).toBe('success');
  });

  it('零条目的 diff 落在 empty，有条目落在 success', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.diff.mockResolvedValue(diffWith(0));
    await tree.diff();
    expect(tree.diffState().phase).toBe('empty');

    workingTree.diff.mockResolvedValue(diffWith(2));
    await tree.diff();
    expect(tree.diffState().phase).toBe('success');
  });

  it('没有历史的 listCommits 落在 empty', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.listCommits.mockResolvedValue(logWith(0));

    await tree.listCommits();

    expect(tree.listCommitsState()).toEqual({ phase: 'empty', value: logWith(0) });
  });

  it('没有未结束会话时 restoreSession 落在 empty，并且照样带着那个 null', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.restoreSession.mockResolvedValue(null);

    await tree.restoreSession();

    expect(tree.restoreSessionState()).toEqual({ phase: 'empty', value: null });
  });

  // 空问的是「这一行在不在」，不是「它健不健康」：conflicted 的会话仍占着 activeKey 的唯一索引、
  // 仍拦着下一次 restore，按不健康算成空的话，它会在面板上凭空消失，而库里它还在。
  it('conflicted 的会话落在 success，不因为「不健康」被算成空', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.restoreSession.mockResolvedValue(sessionWith('conflicted'));

    await tree.restoreSession();

    expect(tree.restoreSessionState()).toEqual({ phase: 'success', value: sessionWith('conflicted') });
  });
});

describe('useWorkingTree：不给无 empty 语义的命令伪造 empty（§4）', () => {
  // 零未提交变更不是「空」，是一次什么都没发生的提交；用户按了按钮必须听到回音。
  it('零变更的 commit 落在 error 并把 empty_commit 原样抛出，不是 empty', async () => {
    const { workingTree, tree } = createFixture();
    const failure = new CommitValidationError('empty_commit', 'normal');
    workingTree.commit.mockRejectedValue(failure);

    await expect(tree.commit('没东西可提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-2' })).rejects.toBe(
      failure
    );

    const phases: readonly string[] = [tree.commitState().phase];
    expect(phases).toEqual(['error']);
    expect(phases).not.toContain('empty');
  });

  it('discard 的 0 条是 no-op 结果，落在 success 而不是 empty', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.discard.mockResolvedValue({ ok: true, discardedCount: 0, workingTreeRevision: 3 });

    await tree.discard(CREDENTIALS);

    expect(tree.discardState()).toEqual({
      phase: 'success',
      value: { ok: true, discardedCount: 0, workingTreeRevision: 3 }
    });
  });

  // CommitConflict 是可重试的返回值，不是崩溃（§4）：调用成功了，结果是 ok:false。
  it('CommitConflict 落在 success，不翻译成 error', async () => {
    const { workingTree, tree } = createFixture();
    const conflicted: CommitResult = {
      ok: false,
      conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: 'main' }
    };
    workingTree.commit.mockResolvedValue(conflicted);

    const result = await tree.commit('并发提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-3' });

    expect(result).toBe(conflicted);
    expect(tree.commitState()).toEqual({ phase: 'success', value: conflicted });
  });

  // 四个被拒成因都是一次**成功调用**的结果：脏工作树与不兼容要用户去处理，不可达是问错了节点，
  // 冲突要重来一次 —— 四者都不是崩溃，也都不是空。四种全测而不是挑一种代表：带载荷的只有其中
  // 两个分支，而界面要显示的恰恰是那两份载荷。
  it.each(REJECTED_RESTORES)('restore 被拒（$reason）落在 success，载荷原样带着', async rejected => {
    const { workingTree, tree } = createFixture();
    workingTree.restore.mockResolvedValue(rejected);

    const result = await tree.restore(RESTORE_TARGET, CREDENTIALS);

    expect(result).toEqual(rejected);
    expect(tree.restoreState()).toEqual({ phase: 'success', value: rejected });
  });

  // 与 discard 的 0 条同理：什么都没写，不等于「没有结果」。
  it('restore 的 restoredCount 为 0 是 no-op 结果，落在 success 而不是 empty', async () => {
    const { workingTree, tree } = createFixture();
    const noop = {
      ok: true,
      restoredCount: 0,
      sessionId: null,
      workingTreeRevision: 3
    } satisfies WorkingTreeRestoreResult;
    workingTree.restore.mockResolvedValue(noop);

    await tree.restore(RESTORE_TARGET, CREDENTIALS);

    expect(tree.restoreState()).toEqual({ phase: 'success', value: noop });
  });

  // 切到当前分支什么都没发生，但那是一次**成功**的切换，不是「没有结果」：画成 empty 的话，
  // 界面会给一次完全正常的操作渲染一块「暂无数据」。
  it('切到当前分支是成功的 no-op，落在 success 而不是 empty', async () => {
    const { tree } = createFixture();

    await tree.switchBranch('main');

    expect(tree.switchBranchState()).toEqual({ phase: 'success', value: undefined });
  });

  // 与 restore 的四个被拒成因正好相反：`requireClean` 撞上脏工作树时分支**根本没切**，
  // 没有任何结果可交给调用方。翻成返回值的话，`await tree.switchBranch(...)` 之后那行
  // 「已经切过去了」的代码会照跑。
  it('requireClean 撞上脏工作树时落在 error，并把 WorkingTreeDirtyError 原样抛出', async () => {
    const { versionManager, tree } = createFixture();
    const failure = new WorkingTreeDirtyError('main', 2);
    versionManager.switchBranch.mockRejectedValue(failure);

    await expect(tree.switchBranch('feature', { requireClean: true })).rejects.toBe(failure);

    expect(tree.switchBranchState()).toEqual({ phase: 'error', error: failure });
  });
});

describe('useWorkingTree：改动之后 status 自己跟上', () => {
  // 工作树没有变更流：不重读的话，用户刚提交完，面板上仍写着「3 条未提交变更」。
  it('一次成功的 commit 之后重读 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(3));
    await tree.status();
    expect(tree.statusState().phase).toBe('success');

    workingTree.commit.mockResolvedValue({ ok: true, commitId: 'c-1', changeSetCount: 3, headRevision: 3 });
    workingTree.status.mockResolvedValue(statusWith(0));
    await tree.commit('提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-4' });
    await flush();

    expect(tree.statusState().phase).toBe('empty');
  });

  it('一次成功的 discard 之后重读 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.discard.mockResolvedValue({ ok: true, discardedCount: 3, workingTreeRevision: 4 });
    workingTree.status.mockResolvedValue(statusWith(0));

    await tree.discard(CREDENTIALS);
    await flush();

    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(tree.statusState().phase).toBe('empty');
  });

  // 提交本身成功了，就不该因为顺带的那次重读失败而在调用方那里变成失败。
  it('重读失败只落在 statusState，不把成功的 commit 变成失败', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.commit.mockResolvedValue({ ok: true, commitId: 'c-2', changeSetCount: 1, headRevision: 3 });
    workingTree.status.mockRejectedValue(new Error('连接断了'));

    await expect(
      tree.commit('提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-5' })
    ).resolves.toMatchObject({ ok: true });
    expect(tree.statusState().phase).toBe('error');
    expect(tree.commitState().phase).toBe('success');
  });

  // 恢复刚把一整个 commit 的单元写回工作树；不重读的话，面板上仍写着「没有未提交改动」。
  it('一次成功的 restore 之后重读 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.restore.mockResolvedValue(RESTORE_OK);
    workingTree.status.mockResolvedValue(statusWith(3));

    await tree.restore(RESTORE_TARGET, CREDENTIALS);
    await flush();

    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(tree.statusState().phase).toBe('success');
  });

  // 被拒也要重读：`dirty_working_tree` 说的正是面板上那句「没有未提交改动」已经不成立 ——
  // 恰恰是被拒的时候，那份摘要最不可信。
  it('restore 被拒之后照样重读 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.restore.mockResolvedValue({ ok: false, reason: 'dirty_working_tree' });
    workingTree.status.mockResolvedValue(statusWith(2));

    await tree.restore(RESTORE_TARGET, CREDENTIALS);
    await flush();

    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(tree.statusState().phase).toBe('success');
  });

  // 刚建的那个 sessionId 已经在返回值里，而「这个会话还成不成立」的唯一出口是 status() 的
  // restoring / conflicted 两位 —— 上一行刚重读过。多发一轮查询换不来任何新判据。
  it('restore 之后不顺手重读会话，restoreSessionState 停在 idle', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.restore.mockResolvedValue(RESTORE_OK);

    await tree.restore(RESTORE_TARGET, CREDENTIALS);
    await flush();

    expect(workingTree.restoreSession).not.toHaveBeenCalled();
    expect(tree.restoreSessionState().phase).toBe('idle');
  });

  // 切过去之后那份摘要属于**另一条**分支：条目数、三个捕获位、restoring 位全是旧分支的。
  // 不重读的话，用户切到一条干净分支后仍看着「3 条未提交变更」。
  it('一次成功的 switchBranch 之后重读 status', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(3));
    await tree.status();
    expect(tree.statusState().phase).toBe('success');

    workingTree.status.mockResolvedValue(statusWith(0));
    await tree.switchBranch('feature');
    await flush();

    expect(workingTree.status).toHaveBeenCalledTimes(2);
    expect(tree.statusState().phase).toBe('empty');
  });

  // 被拒时分支没切，面板上那份摘要仍然属于当前分支：重读只会把同一份再取一遍。
  it('switchBranch 被拒之后不重读 status', async () => {
    const { versionManager, workingTree, tree } = createFixture();
    versionManager.switchBranch.mockRejectedValue(new WorkingTreeDirtyError('main', 2));

    await expect(tree.switchBranch('feature', { requireClean: true })).rejects.toThrow();
    await flush();

    expect(workingTree.status).not.toHaveBeenCalled();
  });
});

describe('useWorkingTree：没有 provider', () => {
  // 没有库就没有工作树可言。返回一份「一切干净」的默认值会把「入口没接上」
  // 伪装成「没有未提交变更」，恰好是最需要出声的时候不出声。
  it('抛错，不返回伪造的干净态', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });

    expect(() => TestBed.runInInjectionContext(() => useWorkingTree())).toThrow();
  });
});

describe('tri-framework-api.md §3 清单守卫', () => {
  // 清单共十项，十项到齐：`deliveredIn` 从此只是出处，不再是开关。表保留而不是删掉——
  // 它现在守的是反方向的那件事：任何一项被摘掉（重构时顺手改了返回值、某端漏接一次）
  // 都会在这里当场红，而不是等到另外两端的用户先发现分歧。
  // `switchBranch` 那一行今天从「不该有」翻成「该有」，靠的就是这条断言先红。
  const CHECKLIST = [
    { member: 'isEnabled', deliveredIn: 'phase-c' },
    { member: 'enable', deliveredIn: 'phase-c' },
    { member: 'status', deliveredIn: 'phase-c' },
    { member: 'statusState', deliveredIn: 'phase-c' },
    { member: 'diff', deliveredIn: 'phase-c' },
    { member: 'commit', deliveredIn: 'phase-c' },
    { member: 'discard', deliveredIn: 'phase-c' },
    { member: 'listCommits', deliveredIn: 'phase-c' },
    { member: 'restore', deliveredIn: 'T110' },
    { member: 'restoreSession', deliveredIn: 'T110' },
    { member: 'switchBranch', deliveredIn: 'T123' }
  ] as const;

  it.each(CHECKLIST)('$member 由 $deliveredIn 交付', ({ member }) => {
    const { tree } = createFixture();

    expect(member in tree).toBe(true);
  });

  it('十一格状态与核心那一份同名同数', () => {
    const { tree } = createFixture();

    expect(
      Object.keys(tree)
        .filter(key => key.endsWith('State'))
        .sort()
    ).toEqual([
      'commitChangesState',
      'commitState',
      'diffState',
      'discardState',
      'enableState',
      'isEnabledState',
      'listCommitsState',
      'restoreSessionState',
      'restoreState',
      'statusState',
      'switchBranchState'
    ]);
  });

  // 第十项的清单文字是「`switchBranch` 的 `WorkingTreeSwitchBranchOptions`」——在场还不够，
  // 那份选项必须**原样**落到核心。本端替调用方补一个空对象的话，核心那条「一个条件都没提就
  // 一条语句都不发」的快路径会在每一次切换上白读一次 active 分支令牌。
  it('switchBranch 的第二参原样传给核心；不传就是不传', async () => {
    const { versionManager, tree } = createFixture();
    const options: WorkingTreeSwitchBranchOptions = { requireClean: true, expectedActivationRevision: 1 };

    await tree.switchBranch('feature', options);
    await tree.switchBranch('main');

    expect(versionManager.switchBranch).toHaveBeenNthCalledWith(1, 'feature', options);
    expect(versionManager.switchBranch).toHaveBeenNthCalledWith(2, 'main', undefined);
  });

  it('返回值类型不重定义核心类型，只换容器', async () => {
    const { workingTree, tree } = createFixture();
    workingTree.status.mockResolvedValue(statusWith(1));

    const status: WorkingTreeStatus = await tree.status();
    const resource: WorkingTreeResource = tree;

    expect(status.branchId).toBe('main');
    expect(resource.statusState().phase).toBe('success');
  });
});
