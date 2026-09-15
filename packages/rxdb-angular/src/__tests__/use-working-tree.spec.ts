/**
 * `useWorkingTree` —— Angular 侧（T086）。
 *
 * @remarks
 * 与 `packages/rxdb-react/src/__tests__/use-working-tree.spec.tsx`、
 * `packages/rxdb-vue/src/__tests__/use-working-tree.spec.ts` **逐条对齐**：同名方法、同名
 * 状态字段、同一组相位、同一份「哪些结果算 empty」的答案、无 provider 时同样抛错。
 * 只有容器形态不同 —— Angular 是 `Signal`，React 是渲染快照，Vue 是 `ComputedRef`。
 *
 * 断言打在**真的** `createWorkingTreeCommands` 接出来的状态机上，桩只桩到
 * `RxDB.workingTree` 那一层：这一层要证明的是「界面看到的相位对不对」，而不是
 * 「有没有人喊了一声 commit」。桩用手控的 deferred 而不是立即 resolve 的 promise，
 * 否则 `loading` 相位在断言之前就已经过去了 —— 而 §4 要求的正是它可观测。
 *
 * **本文件只覆盖 tri-framework-api.md §3 清单的前六项。** `restore()` /
 * `restoreSession()` / `switchBranch` 的 `WorkingTreeSwitchBranchOptions` 在核心里还不存在
 * （Phase 7 的 T105–T107、Phase 8 的 T118），三端入口由 T110 / T123 补上 —— tasks.md 的
 * Dependencies 明写这两个任务排在 Phase 6 之后。末尾的清单守卫把这件事写成断言而不是注释：
 * 哪一项现在该在、哪一项现在不该在，都由 `deliveredIn` 一列说了算，补齐时必须回来改它。
 */
import {
  CommitValidationError,
  type CommitCapabilityInfo,
  type CommitLogPage,
  type CommitResult,
  type RxDB,
  type WorkingTreeCredentials,
  type WorkingTreeDiff,
  type WorkingTreeDiscardResult,
  type WorkingTreeManager,
  type WorkingTreeStatus
} from '@aiao/rxdb';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideRxDB } from '../rxdb.provider';
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

/** 桩到 `RxDB.workingTree` 那一层；再往下是核心自己的事，不在本端重测。 */
const createFixture = () => {
  const workingTree = {
    isEnabled: vi.fn<() => Promise<boolean>>(),
    enable: vi.fn<() => Promise<CommitCapabilityInfo>>(),
    status: vi.fn<() => Promise<WorkingTreeStatus>>(),
    diff: vi.fn<() => Promise<WorkingTreeDiff>>(),
    listCommits: vi.fn<() => Promise<CommitLogPage>>(),
    commit: vi.fn<() => Promise<CommitResult>>(),
    discard: vi.fn<() => Promise<WorkingTreeDiscardResult>>()
  };
  workingTree.status.mockResolvedValue(statusWith(0));
  const rxdb = { workingTree: workingTree as unknown as WorkingTreeManager } as unknown as RxDB;

  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRxDB(rxdb)] });
  const tree = TestBed.runInInjectionContext(() => useWorkingTree());
  return { workingTree, tree };
};

/** 让已经 resolve 的微任务跑完；不做真实计时。 */
const flush = () => Promise.resolve().then(() => undefined);

afterEach(() => TestBed.resetTestingModule());

describe('useWorkingTree：初始状态', () => {
  // 挂上去就去读库，会让每个用到这个入口的组件在挂载时各发一轮查询，
  // 而其中大多数只是想拿到 commit() 这个方法。
  it('七格全是 idle，创建入口本身一次 IO 都不发', () => {
    const { workingTree, tree } = createFixture();

    expect([
      tree.isEnabledState().phase,
      tree.enableState().phase,
      tree.statusState().phase,
      tree.diffState().phase,
      tree.listCommitsState().phase,
      tree.commitState().phase,
      tree.discardState().phase
    ]).toEqual(['idle', 'idle', 'idle', 'idle', 'idle', 'idle', 'idle']);
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
  // 清单共九项。`restore()` / `restoreSession()` / `WorkingTreeSwitchBranchOptions` 的核心
  // 实现分别在 Phase 7（T105–T107）与 Phase 8（T118），三端入口由 T110 / T123 补 ——
  // tasks.md 的 Dependencies 明写这两个任务排在 Phase 6 之后。写成表而不是注释，
  // 是为了让「现在不该有」这件事在补齐那天必须被改掉，而不是被忘掉。
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

  it.each(CHECKLIST)('$member 由 $deliveredIn 交付', ({ member, deliveredIn }) => {
    const { tree } = createFixture();

    expect(member in tree).toBe(deliveredIn === 'phase-c');
  });

  it('七格状态与核心那一份同名同数', () => {
    const { tree } = createFixture();

    expect(
      Object.keys(tree)
        .filter(key => key.endsWith('State'))
        .sort()
    ).toEqual([
      'commitState',
      'diffState',
      'discardState',
      'enableState',
      'isEnabledState',
      'listCommitsState',
      'statusState'
    ]);
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
