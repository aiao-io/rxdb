import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import type { EntityManager } from '../../entity/entity-manager.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import type { LocalRxDBChangeRepository } from '../../system/types.local.js';
import { create_branch, get_current_branch_last_change } from '../../version/create-branch.js';
import { VersionManager } from '../../version/VersionManager.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { createTransactionStub } from '../fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type SyncConfigStub = { remote?: { adapter: string } };

function createEntityManager(): EntityManager {
  const database = new RxDB({
    dbName: `rxdb-create-branch-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  database.init();
  return database.entityManager;
}

describe('create_branch', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock & { create: ReturnType<typeof vi.fn> };
  let mockChangeRepository: FindRepositoryMock;
  let mockActivationRepository: FindRepositoryMock & { update: ReturnType<typeof vi.fn> };
  let activationRow: WorkingTreeActivationState;
  let savedRows: object[];
  let entityManager: EntityManager;
  let syncConfig: SyncConfigStub;
  let getRemoteRepositoriesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    syncConfig = {};
    getRemoteRepositoriesMock = vi.fn();
    entityManager = createEntityManager();
    savedRows = [];

    mockBranchRepository = {
      find: vi.fn(),
      create: vi.fn(async (entity: object) => entity)
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    activationRow = entityManager.instantiate(WorkingTreeActivationState);
    activationRow.id = 'singleton';
    activationRow.activationRevision = 0;
    activationRow.branchGenerationSeq = 3;
    mockActivationRepository = {
      find: vi.fn(async () => [activationRow]),
      update: vi.fn(async (entity: object, patch: object) => Object.assign(entity, patch))
    };

    // 「查重 → 解析分叉点 → 写入」整段搬进了事务，事务内的仓库由 executor 给。
    // 打桩把它转发回同一组 mock，因此下面各用例断言的可观测行为不变。
    const transaction = createTransactionStub({
      getRepository: (EntityType: EntityType) => {
        if ((EntityType as unknown) === RxDBBranch) return mockBranchRepository;
        if ((EntityType as unknown) === WorkingTreeActivationState) return mockActivationRepository;
        return mockChangeRepository;
      },
      saveMany: (entities: never[]) => {
        savedRows.push(...(entities as object[]));
      }
    });

    mockVersion = {
      rxdb: { config: { sync: syncConfig }, entityManager },
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: { transaction }
      }),
      getRemoteRepositories: getRemoteRepositoriesMock
    } as unknown as VersionManager;
  });

  it('should throw error if branch id already exists', async () => {
    const existingBranch = { id: 'existing-branch' };
    mockBranchRepository.find.mockResolvedValue([existingBranch]);

    await expect(create_branch(mockVersion, 'existing-branch')).rejects.toThrow(RxDBError);
    await expect(create_branch(mockVersion, 'existing-branch')).rejects.toThrow(
      'Branch id (existing-branch) already exists'
    );
  });

  it('should throw error if branch id already exists on remote', async () => {
    mockBranchRepository.find.mockResolvedValue([]);
    const mockRemoteAdapter = { branchExists: vi.fn().mockResolvedValue(true) };
    syncConfig.remote = { adapter: 'supabase' };
    getRemoteRepositoriesMock.mockResolvedValue({ adapter: mockRemoteAdapter });

    await expect(create_branch(mockVersion, 'remote-branch')).rejects.toThrow(RxDBError);
    await expect(create_branch(mockVersion, 'remote-branch')).rejects.toThrow(
      'Branch id (remote-branch) already exists on remote'
    );
  });

  it('should skip remote check if branchExists is not implemented', async () => {
    mockBranchRepository.find.mockResolvedValue([]);
    mockChangeRepository.find.mockResolvedValue([{ id: 999, branchId: 'gone' }]);
    const mockRemoteAdapter = {};
    syncConfig.remote = { adapter: 'supabase' };
    getRemoteRepositoriesMock.mockResolvedValue({ adapter: mockRemoteAdapter });

    // 走到 'Source branch not found' 就说明远端那趟被跳过了（否则会先报 remote 相关的错）
    await expect(create_branch(mockVersion, 'new-branch', 999)).rejects.toThrow('Source branch not found');
  });

  /**
   * 这条原先是打桩 `getCurrentBranch()` 返回 `undefined` 来触发的，但那是个**不可达状态**：
   * `getCurrentBranch()` 查不到就会建 `main`，从不返回 `undefined`（改动前后都如此）。
   * 换成真正可达的那条：`fromChangeId` 查到了 change，但它的 `branchId` 指向的分支已不存在。
   */
  it('should throw error if source branch not found', async () => {
    mockBranchRepository.find.mockResolvedValue([]);
    mockChangeRepository.find.mockResolvedValue([{ id: 500, branchId: 'gone' }]);

    await expect(create_branch(mockVersion, 'new-branch', 500)).rejects.toThrow(RxDBError);
    await expect(create_branch(mockVersion, 'new-branch', 500)).rejects.toThrow('Source branch not found');
  });

  it('should throw error if fromChangeId not found', async () => {
    mockBranchRepository.find.mockResolvedValue([]);
    mockChangeRepository.find.mockResolvedValue([]);

    await expect(create_branch(mockVersion, 'feature', 999)).rejects.toThrow(RxDBError);
    await expect(create_branch(mockVersion, 'feature', 999)).rejects.toThrow('Change ID (999) not found');
  });

  /** 让 create_branch 走到「真的建出分支」那一步：源分支是已激活的 main。 */
  function seedSourceBranch(): void {
    const main = entityManager.instantiate(RxDBBranch);
    main.id = 'main';
    main.activated = true;
    main.local = true;
    main.remote = false;
    mockBranchRepository.find
      .mockResolvedValueOnce([]) // 事务外快速查重
      .mockResolvedValueOnce([]) // 事务内查重
      .mockResolvedValueOnce([main]); // resolve_current_branch 取激活分支
    mockChangeRepository.find.mockResolvedValue([]);
  }

  it('新分支同时落下 CommitBranchRef 与 WorkingTreeState', async () => {
    seedSourceBranch();

    await create_branch(mockVersion, 'feature-x');

    // 只写 rxdb_branch 一行，enable() 里的 readCommitBranchRef 就会在这条分支上抛错，
    // 整条一次性初始化迁移回滚——而 facade 承诺的「再调一次 enable() 补根」永远失效。
    const ref = savedRows.find(row => row instanceof CommitBranchRef) as CommitBranchRef | undefined;
    const state = savedRows.find(row => row instanceof WorkingTreeState) as WorkingTreeState | undefined;
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
    seedSourceBranch();

    await create_branch(mockVersion, 'feature-x');

    // 代际必须全局单调不复用：复用会让持旧 (branchId, headRevision) 的调用方误中新分支（ABA），
    // 而幂等键正是拿它盖住 database 与 branch 两维的。
    const ref = savedRows.find(row => row instanceof CommitBranchRef) as CommitBranchRef | undefined;
    expect(ref?.generation).toBe(4);
    expect(mockActivationRepository.update).toHaveBeenCalledWith(activationRow, { branchGenerationSeq: 4 });
  });

  it('新分支的 activeKey 显式写成 null', async () => {
    seedSourceBranch();

    const branch = await create_branch(mockVersion, 'feature-x');

    // 冗余列漏写一处，那一行就绕过了唯一约束——schema 那一半的保护正好在这种漏写上失效。
    expect({ activated: branch.activated, activeKey: branch.activeKey }).toEqual({
      activated: false,
      activeKey: null
    });
  });
});

describe('get_current_branch_last_change', () => {
  let mockChangeRepository: FindRepositoryMock;
  /** 改签名后它只收仓库：属于哪个事务由调用方决定，它自己不再去 `getLocalRepositories()`。 */
  let changeRepository: LocalRxDBChangeRepository;

  beforeEach(() => {
    mockChangeRepository = {
      find: vi.fn()
    };
    changeRepository = mockChangeRepository as unknown as LocalRxDBChangeRepository;
  });

  it('should get last change from specific branch', async () => {
    const lastChange = { id: 200, branchId: 'feature' };

    mockChangeRepository.find.mockResolvedValue([lastChange]);

    const result = await get_current_branch_last_change(changeRepository, 'feature');

    expect(result).toBe(lastChange);
    expect(mockChangeRepository.find).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branchId', operator: '=', value: 'feature' },
          { field: 'revertChangeId', operator: '=', value: null }
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }],
      limit: 1
    });
  });

  it('should get last change from activated branch when no branch id provided', async () => {
    const lastChange = { id: 300 };

    mockChangeRepository.find.mockResolvedValue([lastChange]);

    const result = await get_current_branch_last_change(changeRepository);

    expect(result).toBe(lastChange);
    expect(mockChangeRepository.find).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'branch.activated', operator: '=', value: true },
          { field: 'revertChangeId', operator: '=', value: null }
        ]
      },
      orderBy: [{ field: 'id', sort: 'desc' }],
      limit: 1
    });
  });

  it('should return undefined when no changes found', async () => {
    mockChangeRepository.find.mockResolvedValue([]);

    const result = await get_current_branch_last_change(changeRepository, 'empty-branch');

    expect(result).toBeUndefined();
  });
});
