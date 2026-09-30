import { RxDBError } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restore_entity } from '../restore-entity.js';
import type { VersionManager } from '../VersionManager.js';
import { User } from './fixtures/test-entities.js';
import { createTransactionExecutorStub } from './fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type RestoreAdapterMock = {
  mergeChanges: ReturnType<typeof vi.fn>;
  getRepository: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

/** `restore_entity` 只读 `entity.constructor`，不需要一个真造出来的实体。 */
const userStub = (): InstanceType<typeof User> => Object.create(User.prototype) as InstanceType<typeof User>;

/** 一条可被 `restore_entity` 恢复的 DELETE 变更，与 `trusted-write-concurrency.spec.ts` 同构。 */
const deleteChange = {
  id: 7,
  branchId: 'main',
  type: 'DELETE',
  namespace: 'public',
  entity: 'User',
  entityId: 'user-1',
  patch: null,
  inversePatch: { id: 'user-1', name: 'Restored' },
  revertChangeId: null
};

describe('restore_entity', () => {
  let mockVersion: VersionManager;
  let mockChangeRepository: FindRepositoryMock;
  let mockEntityRepository: FindRepositoryMock;
  let mockAdapter: RestoreAdapterMock;

  beforeEach(() => {
    mockChangeRepository = { find: vi.fn() };
    mockEntityRepository = { find: vi.fn() };

    mockAdapter = {
      mergeChanges: vi.fn().mockResolvedValue(undefined),
      // 恢复出行之后的重查走 `adapter.getRepository`（不经过事务 executor，见 restore-entity.ts
      // 里 `const repo = adapter.getRepository(EntityType)` 那一行——事务已经提交完毕）。
      getRepository: vi.fn(() => mockEntityRepository),
      // 默认直通：不额外制造事务语义，只记录调用。回调收到 executor，替身把 mergeChanges
      // 转发回本 mock 适配器——与 `merge-branch.spec.ts` 的 `mockAdapter.transaction` 同构。
      transaction: vi.fn(async (fun: (executor: never) => Promise<unknown>) =>
        fun(
          createTransactionExecutorStub({
            // restore_entity.ts 的事务体内只调 `executor.mergeChanges`，不调
            // `executor.getRepository`——这里给的实现只是满足 `RepositoryHost` 的类型，
            // 不会被真正调用到。
            getRepository: () => mockChangeRepository,
            mergeChanges: mockAdapter.mergeChanges as never
          }) as never
        )
      )
    };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        changeRepository: mockChangeRepository,
        adapter: mockAdapter
      }),
      getCurrentBranch: vi.fn().mockResolvedValue({ id: 'main' })
    } as unknown as VersionManager;
  });

  // ============================================
  // 错误场景
  // ============================================

  it('changeId 对应的 RxDBChange 不存在时抛错', async () => {
    mockChangeRepository.find.mockResolvedValue([]);

    await expect(restore_entity(mockVersion, userStub(), { changeId: '7' })).rejects.toThrow(RxDBError);
  });

  // ============================================
  // transactionLog 语义（本次修复）
  // ============================================

  it('外层事务显式传 transactionLog=false，不改变历史分组语义', async () => {
    // restore-entity.ts 里 `adapter.transaction(...)` 这一层只是「拿一个执行器当声明作用域」
    // 的容器（见该文件内的注释），不该顺带把 transactionLog 的默认值 true 带进来——那会让
    // switch_transaction_id() 跑一遍，给这次写的 change 行盖上共享的 transactionId，
    // `history-item-builder.ts` 的 `type = transactionId ? 'TRANSACTION' : first_change.type`
    // 就会把这条恢复显示成 `'TRANSACTION'`，而不是它自己的类型（INSERT）——与本函数 TSDoc
    // 承诺的「恢复操作本身会生成新的 RxDBChange 记录」矛盾（那份承诺说的是一条**普通**的
    // change 记录）。这条用例锁的是调用契约本身：真实 transactionId 是否落空、HistoryItem
    // 是否被折叠，由 `rxdb-adapter-pglite` 的集成用例验证（该包才有真实适配器；本包没有
    // `@aiao/rxdb-adapter-*` devDependency，见 package.json）。
    mockChangeRepository.find.mockResolvedValue([deleteChange]);
    mockEntityRepository.find.mockResolvedValue([{ id: 'user-1', name: 'Restored' }]);

    await restore_entity(mockVersion, userStub(), { changeId: '7' });

    expect(mockAdapter.transaction).toHaveBeenCalledWith(expect.any(Function), false);
  });
});
