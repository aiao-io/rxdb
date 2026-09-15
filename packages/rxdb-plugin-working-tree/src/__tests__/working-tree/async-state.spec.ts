/**
 * @fileoverview T089 红测试：异步状态契约——命令暴露 loading / success / error，
 * 查询在无结果时**额外**暴露 empty；不给无 empty 语义的命令伪造 empty
 * （FR-023、contracts/tri-framework-api.md §4）。
 *
 * @remarks
 * 实现目标是 `src/working-tree/async-state.ts`。状态机只有这一份：三端
 * `useWorkingTree()` 各自只负责把它装进本框架的容器（`Signal` / 渲染快照 /
 * `ComputedRef`）。三端各写一份迁移的话，「commit 有没有空成功」这种问题会长出三个
 * 答案，而分歧只在用户那里暴露——这正是 tri-framework-api.md §1 「共享同一份核心类型，
 * 不各自重定义」要排除的形态。
 *
 * **empty 是判据，不是文案。** 一个「反正列表是空的，顺手也给 commit 一个 empty」的
 * 实现，会把「这次提交什么都没做」画成「这里没有内容」——而前者是用户按了按钮却没有
 * 效果，必须出声。所以本文件在两处同时把门关上：相位取值域用**类型断言**封闭
 * （`WorkingTreeCommandState` 的 `phase` 里没有 `'empty'` 这个字面量），运行期再验一遍
 * 真实的迁移序列。只验运行期的话，一个「多声明一个取值但暂时不发」的实现照样绿。
 *
 * 本文件不碰数据库：谁能落库、落成什么样是 `commit-atomicity.spec.ts` /
 * `discard.spec.ts` / `status.spec.ts` 的事，这里只测状态机与判空谓词。
 */

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CommitLogPage } from '../../commit/commit-log.js';
import { CommitValidationError } from '../../commit/write-commit.js';
import {
  isCommitLogPageEmpty,
  isWorkingTreeDiffEmpty,
  isWorkingTreeStatusEmpty,
  trackWorkingTreeCommand,
  trackWorkingTreeQuery,
  WORKING_TREE_INITIAL_ASYNC_STATES,
  type WorkingTreeAsyncStates,
  type WorkingTreeCommandState,
  type WorkingTreeQueryState
} from '../../working-tree/async-state.js';
import type { CommitResult } from '../../working-tree/commit-command.js';
import type { WorkingTreeDiff } from '../../working-tree/diff.js';
import type { WorkingTreeStatus } from '../../working-tree/status.js';

/** 收集一次调用发出的全部状态，顺序即发出顺序。 */
const sink = <S>(): { emit: (state: S) => void; states: S[] } => {
  const states: S[] = [];
  return { emit: (state: S) => void states.push(state), states };
};

/** 一份干净工作树的 status；`entryCount` 为零即「无未提交变更」。 */
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

/** 一份 diff；`entries` 为空即「没有可展示的改动」。 */
const diffWith = (entryCount: number): WorkingTreeDiff => ({
  branchId: 'main',
  baseHeadCommitId: 'c-1',
  workingTreeRevision: 3,
  granularity: 'entity',
  entries: Array.from({ length: entryCount }, (_, index) => ({
    unitId: `u-${index}`,
    transactionId: null,
    namespace: 'public',
    entity: 'Recipe',
    entityId: `r-${index}`,
    operation: 'update' as const,
    patch: {},
    inversePatch: {},
    origin: 'local' as const
  })),
  transactions: [],
  nextCursor: null
});

/** 一页提交历史；`entries` 为空即「这个分支还没有历史」。 */
const commitLogWith = (entryCount: number): CommitLogPage => ({
  branchId: 'main',
  headCommitId: entryCount === 0 ? null : 'c-1',
  entries: Array.from({ length: entryCount }, (_, index) => ({
    commitId: `c-${index}`,
    parentIds: [],
    firstParentId: null,
    kind: 'normal' as const,
    message: `m-${index}`,
    authorId: 'u-1',
    createdAt: new Date(0),
    changeSetCount: 1
  }))
});

describe('命令状态：loading / success / error，没有第四个出口（§4）', () => {
  it('相位取值域封闭，里面没有 empty', () => {
    // 键集而不是点名：点名只能挡住 'empty' 这一个想得到的名字，
    // 挡不住某个实现顺手加进来的 'noop' / 'skipped'——它们同样是伪造的空成功。
    expectTypeOf<WorkingTreeCommandState<number>['phase']>().toEqualTypeOf<'idle' | 'loading' | 'success' | 'error'>();
  });

  it('一次成功的命令依次发出 loading 与 success，并把返回值原样带上', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<number>>();

    const value = await trackWorkingTreeCommand(emit, () => Promise.resolve(42));

    expect(value).toBe(42);
    expect(states).toEqual([{ phase: 'loading' }, { phase: 'success', value: 42 }]);
  });

  // 「进行中」必须先于结果发出，而不是在结果到达时补一个：commit() 期间不得静默（§4）。
  it('loading 在 run 还没落地之前就已经发出', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<number>>();
    let release!: (value: number) => void;
    const pending = new Promise<number>(resolve => (release = resolve));

    const call = trackWorkingTreeCommand(emit, () => pending);
    expect(states).toEqual([{ phase: 'loading' }]);

    release(7);
    await call;
    expect(states.at(-1)).toEqual({ phase: 'success', value: 7 });
  });

  it('一次失败的命令发出 error，并把原样的错误继续抛出去', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<number>>();
    const failure = new Error('capability disabled');

    await expect(trackWorkingTreeCommand(emit, () => Promise.reject(failure))).rejects.toBe(failure);

    expect(states).toEqual([{ phase: 'loading' }, { phase: 'error', error: failure }]);
  });

  // `error` 的声明类型是 `Error`，而 `throw` 的载荷在 JS 里可以是任意值。归一化不做的话，
  // 一个 `throw 'timeout'` 会让状态里躺着一个字符串，而模板上的 `state.error.message`
  // 求值成 `undefined` —— 类型说它一定在，运行期它不在，这是最难查的一类错位。
  it('非 Error 的 throw 载荷被归一化成 Error，但继续抛的仍是原样的载荷', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<number>>();

    // 抛字符串而不是抛对象：`String({})` 得到 `'[object Object]'`，那样的消息既证明不了
    // 载荷进了消息，也证明不了没进。字符串载荷能把两件事一起钉住。
    await expect(trackWorkingTreeCommand(emit, () => Promise.reject('timeout'))).rejects.toBe('timeout');

    const [, failed] = states;
    expect(failed.phase).toBe('error');
    // 不是 `toEqual({ phase: 'error', error: new Error('timeout') })`：那条断言在
    // `error` 是一个恰好有 `message` 的裸对象时照样绿，而 `instanceof` 这一位正是
    // 三端模板与 `error instanceof CommitValidationError` 之类的分支依赖的东西。
    expect(failed).toMatchObject({ phase: 'error', error: expect.any(Error) });
    expect(failed.phase === 'error' && failed.error.message).toBe('timeout');
  });

  // 零未提交变更不是「空」，是一次什么都没发生的提交，用户按了按钮必须听到回音。
  it('零未提交变更的 commit 落在 error 且带着 empty_commit，不是 empty 相位', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<CommitResult>>();
    const failure = new CommitValidationError('empty_commit', 'normal');

    await expect(trackWorkingTreeCommand(emit, () => Promise.reject(failure))).rejects.toBe(failure);

    // 读成 string[]：断言的正是「实现有没有发出声明的联合之外的相位」，
    // 而在 CommandState 的窄类型下 `=== 'empty'` 是 TS 直接拒收的死比较。
    const phases: readonly string[] = states.map(state => state.phase);
    expect(phases).toEqual(['loading', 'error']);
    expect(phases).not.toContain('empty');
  });

  // CommitConflict 是可重试的返回值，不是崩溃（§4）：调用本身成功了，结果是 ok:false。
  it('CommitConflict 落在 success 相位，不翻译成 error', async () => {
    const { emit, states } = sink<WorkingTreeCommandState<CommitResult>>();
    const conflicted: CommitResult = {
      ok: false,
      conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: 'main' }
    };

    const result = await trackWorkingTreeCommand(emit, () => Promise.resolve(conflicted));

    expect(result).toBe(conflicted);
    expect(states.at(-1)).toEqual({ phase: 'success', value: conflicted });
  });
});

describe('查询状态：无结果时额外一个 empty（§4）', () => {
  it('相位取值域恰好比命令多一个 empty', () => {
    expectTypeOf<WorkingTreeQueryState<number>['phase']>().toEqualTypeOf<
      'idle' | 'loading' | 'success' | 'empty' | 'error'
    >();
  });

  it('有结果时发出 success', async () => {
    const { emit, states } = sink<WorkingTreeQueryState<readonly number[]>>();

    await trackWorkingTreeQuery(
      emit,
      rows => rows.length === 0,
      () => Promise.resolve([1, 2])
    );

    expect(states).toEqual([{ phase: 'loading' }, { phase: 'success', value: [1, 2] }]);
  });

  // empty 是 success 的细化而不是替代：一次空的 status 里仍然有 revision 可读，
  // 把值丢掉会逼调用方为了拿 revision 再查一次，而那一次拿到的可能已经不是同一时刻。
  it('无结果时发出 empty，并且照样带着值', async () => {
    const { emit, states } = sink<WorkingTreeQueryState<WorkingTreeStatus>>();
    const clean = statusWith(0);

    await trackWorkingTreeQuery(emit, isWorkingTreeStatusEmpty, () => Promise.resolve(clean));

    expect(states).toEqual([{ phase: 'loading' }, { phase: 'empty', value: clean }]);
  });

  it('失败时发出 error，并把原样的错误继续抛出去', async () => {
    const { emit, states } = sink<WorkingTreeQueryState<readonly number[]>>();
    const failure = new Error('graph corrupted');

    await expect(
      trackWorkingTreeQuery(
        emit,
        rows => rows.length === 0,
        () => Promise.reject(failure)
      )
    ).rejects.toBe(failure);

    expect(states).toEqual([{ phase: 'loading' }, { phase: 'error', error: failure }]);
  });

  // 判空谓词跑在结果上，不跑在错误上：失败的查询不知道自己空不空。
  it('查询失败时不调用判空谓词', async () => {
    const { emit } = sink<WorkingTreeQueryState<readonly number[]>>();
    const isEmpty = vi.fn(() => true);

    await expect(trackWorkingTreeQuery(emit, isEmpty, () => Promise.reject(new Error('boom')))).rejects.toThrow();

    expect(isEmpty).not.toHaveBeenCalled();
  });
});

describe('判空只有一份实现（§4）', () => {
  it('status 的空是「没有未提交变更」', () => {
    expect(isWorkingTreeStatusEmpty(statusWith(0))).toBe(true);
    expect(isWorkingTreeStatusEmpty(statusWith(3))).toBe(false);
  });

  it('diff 的空是「没有可展示的改动」', () => {
    expect(isWorkingTreeDiffEmpty(diffWith(0))).toBe(true);
    expect(isWorkingTreeDiffEmpty(diffWith(2))).toBe(false);
  });

  it('提交历史的空是「这个分支还没有历史」', () => {
    expect(isCommitLogPageEmpty(commitLogWith(0))).toBe(true);
    expect(isCommitLogPageEmpty(commitLogWith(5))).toBe(false);
  });
});

describe('三端共用的初始状态', () => {
  // 键集断言：三端只要少接一项，这里先红——比等三份 spec 各自发现要早。
  it('键集恰好是阶段 C 收口的六项能力，一项一个状态', () => {
    expectTypeOf<keyof WorkingTreeAsyncStates>().toEqualTypeOf<
      | 'isEnabledState'
      | 'enableState'
      | 'statusState'
      | 'diffState'
      | 'listCommitsState'
      | 'commitState'
      | 'discardState'
    >();
  });

  // 入口创建时不偷偷发查询：idle 说的是「还没人问过」，与 loading（正在问）
  // 和 empty（问过了，没有）都不是一回事。三者合并会让 UI 在挂载瞬间转圈。
  it('七项全部从 idle 起步', () => {
    expect(Object.values(WORKING_TREE_INITIAL_ASYNC_STATES).every(state => state.phase === 'idle')).toBe(true);
  });

  it('isEnabled 用的是命令状态：boolean 没有「空」这一形态', () => {
    expectTypeOf<WorkingTreeAsyncStates['isEnabledState']>().toEqualTypeOf<WorkingTreeCommandState<boolean>>();
  });

  it('discard 用的是命令状态：discardedCount 为零是 no-op，不是空列表', () => {
    expectTypeOf<WorkingTreeAsyncStates['discardState']['phase']>().toEqualTypeOf<
      'idle' | 'loading' | 'success' | 'error'
    >();
  });
});
