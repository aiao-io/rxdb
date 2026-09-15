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
 * {@link WorkingTreeManager} 那一层。剥掉之后能问出三端问不了的一个问题——
 * **「除了这一格，别的格子动没动」**（见 {@link untouchedKeys}）。框架容器下
 * 这个问题会退化成「渲染有没有多跑一次」，而那是框架的事，不是本层的事。
 *
 * 本文件不碰数据库：谁能落库、落成什么样归 `commit-atomicity.spec.ts` /
 * `discard.spec.ts` / `status.spec.ts`；相位机本身归 `async-state.spec.ts`。
 * 这里只测**接线**：七个方法各自接哪一格、哪几个之后要重读 status、错误往哪走。
 */

import { describe, expect, it, vi } from 'vitest';
import type { CommitCapabilityInfo } from '../../commit/commit-capability.js';
import type { CommitLogOptions, CommitLogPage } from '../../commit/commit-log.js';
import { CommitValidationError } from '../../commit/write-commit.js';
import { WORKING_TREE_INITIAL_ASYNC_STATES, type WorkingTreeAsyncStates } from '../../working-tree/async-state.js';
import type { CommitOptions, CommitResult } from '../../working-tree/commit-command.js';
import type { WorkingTreeCredentials } from '../../working-tree/commit-conflict.js';
import type { WorkingTreeDiff, WorkingTreeDiffOptions } from '../../working-tree/diff.js';
import type { WorkingTreeDiscardOptions, WorkingTreeDiscardResult } from '../../working-tree/discard-command.js';
import type { WorkingTreeStatus } from '../../working-tree/status.js';
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

/** 七格状态的可写副本；本层不持有状态，状态在调用方那边，这里替调用方存一份。 */
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

/** 桩到 `RxDB.workingTree` 那一层；再往下是命令自己的事，不在本文件重测。 */
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
    commit: vi.fn<(message: string, options: CommitOptions) => Promise<CommitResult>>(),
    discard: vi.fn<(options: WorkingTreeDiscardOptions) => Promise<WorkingTreeDiscardResult>>()
  };
  workingTree.status.mockResolvedValue(statusWith(0));

  const commands = createWorkingTreeCommands(workingTree as unknown as WorkingTreeManager, patch);
  return { commands, states, transitions, workingTree };
};

describe('七个命令各自只驱动自己那一格（§4）', () => {
  it('isEnabled 走命令状态，其余六格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.isEnabled.mockResolvedValue(true);

    await expect(commands.isEnabled()).resolves.toBe(true);

    expect(states.isEnabledState).toEqual({ phase: 'success', value: true });
    expect(untouchedKeys(states, 'isEnabledState')).toEqual([]);
  });

  it('status 走查询状态，其余六格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const dirty = statusWith(3);
    workingTree.status.mockResolvedValue(dirty);

    await expect(commands.status()).resolves.toBe(dirty);

    expect(states.statusState).toEqual({ phase: 'success', value: dirty });
    expect(untouchedKeys(states, 'statusState')).toEqual([]);
  });

  it('diff 走查询状态，其余六格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const diff = diffWith(2);
    workingTree.diff.mockResolvedValue(diff);

    await expect(commands.diff()).resolves.toBe(diff);

    expect(states.diffState).toEqual({ phase: 'success', value: diff });
    expect(untouchedKeys(states, 'diffState')).toEqual([]);
  });

  it('listCommits 走查询状态，其余六格纹丝不动', async () => {
    const { commands, states, workingTree } = createFixture();
    const page = logWith(2);
    workingTree.listCommits.mockResolvedValue(page);

    await expect(commands.listCommits()).resolves.toBe(page);

    expect(states.listCommitsState).toEqual({ phase: 'success', value: page });
    expect(untouchedKeys(states, 'listCommitsState')).toEqual([]);
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
});

describe('三个查询各自的空判据（§4）', () => {
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

  it('isEnabled / status / diff / listCommits 都不额外重读 status', async () => {
    const { commands, workingTree } = createFixture();
    workingTree.isEnabled.mockResolvedValue(false);
    workingTree.diff.mockResolvedValue(diffWith(1));
    workingTree.listCommits.mockResolvedValue(logWith(1));

    await commands.isEnabled();
    await commands.diff();
    await commands.listCommits();

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

  it('enable 成功但 status 重读失败时，enable 仍然 resolve', async () => {
    const { commands, states, workingTree } = createFixture();
    workingTree.enable.mockResolvedValue(CAPABILITY);
    workingTree.status.mockRejectedValue(new Error('读 status 时连接断了'));

    await expect(commands.enable()).resolves.toBe(CAPABILITY);

    expect(states.enableState).toEqual({ phase: 'success', value: CAPABILITY });
    expect(states.statusState.phase).toBe('error');
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
