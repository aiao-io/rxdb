import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import type { LocalRxDBChangeRepository } from '../../system/types.local.js';
import { create_branch, get_current_branch_last_change } from '../../version/create-branch.js';
import { VersionManager } from '../../version/VersionManager.js';
import { createTransactionStub } from '../fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type SyncConfigStub = { remote?: { adapter: string } };

describe('create_branch', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock;
  let mockChangeRepository: FindRepositoryMock;
  let syncConfig: SyncConfigStub;
  let getRemoteRepositoriesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    syncConfig = {};
    getRemoteRepositoriesMock = vi.fn();

    mockBranchRepository = {
      find: vi.fn()
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    // 「查重 → 解析分叉点 → 写入」整段搬进了事务，事务内的仓库由 executor 给。
    // 打桩把它转发回同一组 mock，因此下面各用例断言的可观测行为不变。
    const transaction = createTransactionStub({
      getRepository: (EntityType: EntityType) =>
        (EntityType as unknown) === RxDBBranch ? mockBranchRepository : mockChangeRepository
    });

    mockVersion = {
      rxdb: { config: { sync: syncConfig } },
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
