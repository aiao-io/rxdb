/**
 * @fileoverview 运行期新建分支时本插件写下的那两行（data-model.md §2.2/§2.5）。
 *
 * @remarks
 * 这是 `branch-commit-rows.ts` 自陈的**第三条入口**——另两条（新库建表、既有库 0004 迁移）
 * 各有自己的 spec。第三条曾经整条漏掉过，代价是 `createBranch()` 之后 `enable()` 在这条分支上
 * 永久失败，而 `working-tree-facade.ts` 承诺的「再调一次 `enable()` 就能补根」对它从不成立。
 *
 * 抽包前这两条断言长在 `packages/rxdb/src/__tests__/version/create-branch.spec.ts` 里，
 * 因为那时 `create_branch` 自己就写这两行。现在核心只负责**调**
 * {@link RxDBSystemContribution.writeBranchRows}（那一侧的契约——调没调、拿到的是不是同一个
 * 执行器、抛错让不让它穿出去——仍由核心那份 spec 守），**写什么**归本包。
 *
 * 所以这里直接调贡献对象上的 `writeBranchRows`，不经 `create_branch`：经过去只会把核心那一段
 * 编排再测一遍，而那段的失败模式与本文件要守的东西没有交集。
 */

import type { EntityManager, EntityType, IRepository, TransactionExecutor, TransactionExecutorFun } from '@aiao/rxdb';
import { RxDB, SyncType } from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { RxDBPluginWorkingTree } from '../../plugin.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { fakeTableRef } from '../fixtures/fake-table-ref.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 一个挂了 mock 适配器、尚未 `init()` 的宿主。 */
function createDatabase(): RxDB {
  const database = new RxDB({
    dbName: `rxdb-write-branch-rows-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
}

describe('writeBranchRows', () => {
  let entityManager: EntityManager;
  let contribution: RxDBPluginWorkingTree['system'];
  let activationRow: WorkingTreeActivationState;
  let activationRepository: { find: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let saved: InstanceType<EntityType>[];
  let executor: TransactionExecutor;

  beforeEach(() => {
    const database = createDatabase();
    const plugin = new RxDBPluginWorkingTree(database);
    contribution = plugin.system;
    // 十张表由本插件贡献，`instantiate()` 要它们已经进了 `config.entities`。
    database.use(() => plugin);
    database.init();
    entityManager = database.entityManager;

    activationRow = entityManager.instantiate(WorkingTreeActivationState);
    activationRow.id = 'default';
    activationRow.activationRevision = 0;
    // 非 0 起点：从 0 起的话「发放 seq + 1」与「发放当前分支数 + 1」会给出同一个答案，
    // 而本文件正是要把这两种写法分开（见下方 ABA 那条注释）。
    activationRow.branchGenerationSeq = 3;
    activationRepository = {
      find: vi.fn(async () => [activationRow]),
      update: vi.fn(async (entity: object, patch: object) => Object.assign(entity, patch))
    };

    saved = [];
    executor = {
      id: 'probe-executor',
      state: 'active',
      query: vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] })),
      tableRef: fakeTableRef,
      mutations: vi.fn(async () => []),
      getRepository: (EntityClass: unknown) =>
        (EntityClass === WorkingTreeActivationState ? activationRepository : (
          { find: vi.fn(async () => []) }
        )) as unknown as IRepository<EntityType>,
      saveMany: vi.fn(async (entities: InstanceType<EntityType>[]) => {
        saved.push(...entities);
        return entities;
      }),
      removeMany: vi.fn(async entities => entities),
      mergeChanges: vi.fn(async () => undefined),
      run: (fn: TransactionExecutorFun) => fn(executor)
    } as unknown as TransactionExecutor;
  });

  it('新分支同时落下 CommitBranchRef 与 WorkingTreeState', async () => {
    await contribution.writeBranchRows(entityManager, { executor, branchId: 'feature-x' });

    // 只写 rxdb_branch 一行，`enable()` 里的 readCommitBranchRef 就会在这条分支上抛错，
    // 整条一次性初始化迁移回滚——而 facade 承诺的「再调一次 enable() 补根」永远失效。
    const ref = saved.find(row => row instanceof CommitBranchRef) as CommitBranchRef | undefined;
    const state = saved.find(row => row instanceof WorkingTreeState) as WorkingTreeState | undefined;
    expect({
      refId: ref?.id,
      branchId: ref?.branchId,
      headCommitId: ref?.headCommitId,
      headRevision: ref?.headRevision,
      status: ref?.status,
      corruptedAt: ref?.corruptedAt
    }).toEqual({
      refId: 'feature-x',
      branchId: 'feature-x',
      // `null` 是「还没有根」而不是「空历史」：伪造一个根等于宣称这条分支已初始化过，
      // `enable()` 会据此跳过它，于是它永远拿不到 baseline。
      headCommitId: null,
      headRevision: 0,
      status: 'ok',
      corruptedAt: null
    });
    expect({
      stateId: state?.id,
      branchId: state?.branchId,
      baseHeadCommitId: state?.baseHeadCommitId,
      workingTreeRevision: state?.workingTreeRevision,
      entryCount: state?.entryCount
    }).toEqual({
      stateId: 'feature-x',
      branchId: 'feature-x',
      baseHeadCommitId: null,
      workingTreeRevision: 0,
      entryCount: 0
    });
  });

  it('代际取自 branchGenerationSeq + 1，并写回单调源', async () => {
    await contribution.writeBranchRows(entityManager, { executor, branchId: 'feature-x' });

    // 代际必须全局单调不复用：复用会让持旧 (branchId, headRevision) 的调用方误中新分支（ABA），
    // 而幂等键正是拿它盖住 database 与 branch 两维的。「当前分支数 + 1」是最自然的写法，
    // 也正是删过分支之后会复用旧号的那一种。
    const ref = saved.find(row => row instanceof CommitBranchRef) as CommitBranchRef | undefined;
    expect(ref?.generation).toBe(4);
    // 写回与取号必须同属这一个事务：分开则两个并发的 create branch 拿到同一个号。
    expect(activationRepository.update).toHaveBeenCalledWith(activationRow, { branchGenerationSeq: 4 });
  });

  it('激活态行缺失时抛错，不凭空补一行', async () => {
    activationRepository.find.mockResolvedValue([]);

    // 补一行的话 `branchGenerationSeq` 只能从 0 起，于是这条新分支与既有分支撞号——
    // 而撞号的两条分支在形状上分辨不出来，要到幂等键失效时才显形。
    await expect(contribution.writeBranchRows(entityManager, { executor, branchId: 'feature-x' })).rejects.toThrow();
    expect(saved).toEqual([]);
  });
});
