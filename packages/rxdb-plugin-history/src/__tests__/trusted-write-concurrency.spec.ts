/**
 * @fileoverview 两处**适配器级** `mergeChanges()` 的受信声明并发用例
 *
 * `declareTrustedWrite()` 的作用域是一个 WeakMap 的键，**每个作用域只存一条声明**
 * （`trusted-write-scope.ts`）。而声明与取用之间隔着一次排队：工作树的
 * `interceptMergeChanges()` 先 `host.runInTransaction(...)` 拿到事务，**之后**才
 * `#requireEntrance()` 取声明（`capture-hook.ts`）。于是把声明挂在**适配器实例**上时，
 * 两个并发调用会互相覆盖——先执行的那个取到后声明者的意图（判定按错误的行走），
 * 后执行的那个取不到声明，被 `WorkingTreeWriteRejectedError` 当作未知入口拒绝。
 *
 * 两条用例都把「声明」与「取用」之间那次排队显式建模成一个**双方栅栏**：两个调用各自声明完毕
 * 之后才有任何一个走到取用。没有这个栅栏，两个调用在测试里会一前一后跑完，覆盖窗口根本不出现，
 * 用例会在有 bug 的代码上照样全绿。
 *
 * 这里不用真适配器：真适配器的事务是串行的，而串行与否不该是这条正确性的前提——
 * 声明必须绑在「这一次写」自己的身份上，并发与否都成立。替身因此允许事务并发进行。
 */

import {
  getRxDBEntityIdentityKey,
  takeDeclaredWrite,
  TrustedWriteIntent,
  type RxDBChange,
  type SwitchVersionActions,
  type TransactionExecutor
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { merge_branch } from '../merge-branch.js';
import { restore_entity } from '../restore-entity.js';
import type { VersionManager } from '../VersionManager.js';
import { User } from './fixtures/test-entities.js';

/** 一次 `mergeChanges()` 上观察到的意图；`undefined` 表示这次写没取到任何声明。 */
interface Observation {
  /** 由 actions 里第一个变更键认出的发起者，用来把观察结果对回调用方 */
  readonly who: string;
  readonly intent: TrustedWriteIntent | undefined;
}

/**
 * 双方栅栏：参与方都到齐之后一起放行。
 *
 * @param parties - 参与方数量
 */
const createBarrier = (parties: number) => {
  let arrived = 0;
  let release = (): void => undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  return async (): Promise<void> => {
    arrived += 1;
    if (arrived >= parties) release();
    await gate;
  };
};

/**
 * 与 `capture-hook.ts` 的 `#takeDeclaration()` 同一口径：事务作用域优先，取用即清除。
 *
 * @param executor - 本次写所在的事务执行器；适配器级原语没有
 * @param adapter - 适配器实例
 */
const takeLikeCaptureHook = (
  executor: TransactionExecutor | undefined,
  adapter: object
): TrustedWriteIntent | undefined => {
  const fromExecutor = executor ? takeDeclaredWrite(executor) : undefined;
  if (fromExecutor) return fromExecutor.intent;
  return takeDeclaredWrite(adapter)?.intent;
};

/** actions 里第一个变更键；两个并发调用各写各的实体，于是它就是发起者的身份。 */
const senderOf = (actions: SwitchVersionActions): string =>
  [...actions.inserts.keys(), ...actions.updates.keys(), ...actions.deletes.keys()][0];

/**
 * 一个把「排队后才取声明」建模出来的 mock 适配器。
 *
 * @param parties - 本用例里并发发起写的调用方数量
 */
const createRacingAdapter = (parties: number) => {
  const observed: Observation[] = [];
  const barrier = createBarrier(parties);
  const repository = { find: vi.fn() };

  const adapter = {
    getRepository: vi.fn(() => repository),
    // 适配器级出口：没有执行器可绑，声明只能落在适配器实例上——这正是本文件要证伪的形状。
    mergeChanges: vi.fn(async (actions: SwitchVersionActions) => {
      const who = senderOf(actions);
      await barrier();
      observed.push({ who, intent: takeLikeCaptureHook(undefined, adapter) });
    }),
    // 事务级出口：每次事务给一个**新**的执行器对象，作用域因此天然互不相同。
    transaction: vi.fn(async (fun: (executor: TransactionExecutor) => Promise<unknown>) => {
      const executor: { mergeChanges: (actions: SwitchVersionActions) => Promise<void> } = {
        mergeChanges: async (actions: SwitchVersionActions) => {
          const who = senderOf(actions);
          await barrier();
          observed.push({ who, intent: takeLikeCaptureHook(executor as unknown as TransactionExecutor, adapter) });
        }
      };
      return fun(executor as unknown as TransactionExecutor);
    })
  };

  return { adapter, observed, repository };
};

/** 变更键与 `getRxDBChangeKey()` 同构，用来把观察结果对回发起者。 */
const changeKeyOf = (entity: string, entityId: string): string =>
  `public:${entity}:${getRxDBEntityIdentityKey(entityId)}`;

/** 一条可被 squash 压成单条 INSERT 的源分支变更。 */
const insertChange = (id: number, entityId: string): RxDBChange =>
  ({
    id,
    branchId: 'feature',
    type: 'INSERT',
    namespace: 'public',
    entity: 'Todo',
    entityId,
    patch: { title: entityId },
    inversePatch: null,
    revertChangeId: null
  }) as unknown as RxDBChange;

/** 一条可被 `restore_entity` 恢复的 DELETE 变更。 */
const deleteChange = (id: number, entityId: string): RxDBChange =>
  ({
    id,
    branchId: 'main',
    type: 'DELETE',
    namespace: 'public',
    entity: 'User',
    entityId,
    patch: null,
    inversePatch: { id: entityId, name: entityId },
    revertChangeId: null
  }) as unknown as RxDBChange;

/** `restore_entity` 只读 `entity.constructor`，不需要一个真造出来的实体。 */
const userStub = (): InstanceType<typeof User> => Object.create(User.prototype) as InstanceType<typeof User>;

/** 一个只服务 squash 出口的 `VersionManager` 替身。 */
const mergeVersionOf = (adapter: object, entityId: string): VersionManager =>
  ({
    getLocalRepositories: vi.fn(async () => ({
      branchRepository: { find: vi.fn(async () => [{ id: 'feature', fromChangeId: 5, parentId: 'main' }]) },
      changeRepository: { find: vi.fn(async () => [insertChange(6, entityId)]) },
      adapter
    }))
  }) as unknown as VersionManager;

describe('适配器级 mergeChanges() 的受信声明并发', () => {
  it('两个 squash 合并并发时，各自的 merge_squash 声明都不该被对方顶掉', async () => {
    const { adapter, observed } = createRacingAdapter(2);

    await Promise.all([
      merge_branch(mergeVersionOf(adapter, 'todo-a'), 'feature', 'main'),
      merge_branch(mergeVersionOf(adapter, 'todo-b'), 'feature', 'main')
    ]);

    expect(new Map(observed.map(observation => [observation.who, observation.intent]))).toEqual(
      new Map([
        [changeKeyOf('Todo', 'todo-a'), TrustedWriteIntent.merge_squash],
        [changeKeyOf('Todo', 'todo-b'), TrustedWriteIntent.merge_squash]
      ])
    );
  });

  it('squash 合并与实体恢复并发时，两边的意图不该串味', async () => {
    const { adapter, observed, repository } = createRacingAdapter(2);
    const restoredId = 'user-restored';
    repository.find.mockResolvedValue([{ id: restoredId }]);

    const restoreVersion = {
      getLocalRepositories: vi.fn(async () => ({
        changeRepository: { find: vi.fn(async () => [deleteChange(7, restoredId)]) },
        adapter
      })),
      getCurrentBranch: vi.fn(async () => ({ id: 'main' }))
    } as unknown as VersionManager;

    await Promise.all([
      merge_branch(mergeVersionOf(adapter, 'todo-merged'), 'feature', 'main'),
      restore_entity(restoreVersion, userStub(), { changeId: '7' })
    ]);

    expect(new Map(observed.map(observation => [observation.who, observation.intent]))).toEqual(
      new Map([
        [changeKeyOf('Todo', 'todo-merged'), TrustedWriteIntent.merge_squash],
        [changeKeyOf('User', restoredId), TrustedWriteIntent.restore_entity]
      ])
    );
  });
});
