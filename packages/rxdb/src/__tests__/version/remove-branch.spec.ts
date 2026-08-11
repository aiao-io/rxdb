import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { RxDBError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { remove_branch } from '../../version/remove-branch.js';
import { VersionManager } from '../../version/VersionManager.js';
import { createTransactionStub } from '../fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type RemoveAdapterMock = {
  removeMany: ReturnType<typeof vi.fn>;
  getRepository: (EntityType: EntityType) => unknown;
  transaction: ReturnType<typeof createTransactionStub>;
};
type FindQuery = {
  where: {
    rules: Array<{ field: string; value?: unknown }>;
  };
};

describe('remove_branch', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock;
  let mockChangeRepository: FindRepositoryMock;
  let mockAdapter: RemoveAdapterMock;

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn()
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    // 「查 → 删」整段搬进了事务：仓库改由 executor 给，删除改走 `executor.removeMany()`。
    // 打桩把两者都转发回原来的 mock，因此下面各用例的断言对象与语义都不变。
    const host = {
      removeMany: vi.fn().mockResolvedValue(undefined),
      getRepository: (EntityType: EntityType) =>
        (EntityType as unknown) === RxDBBranch ? mockBranchRepository : mockChangeRepository
    };
    mockAdapter = { ...host, transaction: createTransactionStub(host) };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: mockAdapter
      })
    } as unknown as VersionManager;
  });

  it('should throw error when trying to remove main branch', async () => {
    await expect(remove_branch(mockVersion, 'main')).rejects.toThrow(RxDBError);
    await expect(remove_branch(mockVersion, 'main')).rejects.toThrow('Cannot remove main branch');
  });

  it('should throw error if branch does not exist', async () => {
    mockBranchRepository.find.mockResolvedValue([]);

    await expect(remove_branch(mockVersion, 'non-existent')).rejects.toThrow(RxDBError);
    await expect(remove_branch(mockVersion, 'non-existent')).rejects.toThrow("Branch 'non-existent' not found");
  });

  it('should throw error if trying to remove activated branch', async () => {
    const activeBranch = {
      id: 'feature',
      activated: true
    };

    mockBranchRepository.find.mockResolvedValue([activeBranch]);

    await expect(remove_branch(mockVersion, 'feature')).rejects.toThrow(RxDBError);
    await expect(remove_branch(mockVersion, 'feature')).rejects.toThrow(
      "Cannot remove active branch 'feature'. Switch to another branch first."
    );
  });

  it('should throw error if branch has child branches', async () => {
    const branch = {
      id: 'parent',
      activated: false
    };

    const branchChange = {
      id: 100,
      branchId: 'parent'
    };

    const childBranch = {
      id: 'child',
      parentId: 'parent'
    };

    // 先按 parentId 判子分支查询，再落到「按 id 取分支本身」——
    // 两个查询都带 `id` 规则（子分支查询里是 `id != parent`），顺序反了会误判
    mockBranchRepository.find.mockImplementation((query: FindQuery) => {
      if (query.where.rules.some(r => r.field === 'parentId' && r.value === 'parent')) {
        return Promise.resolve([childBranch]);
      }
      if (query.where.rules.some(r => r.field === 'id' && r.value === 'parent')) {
        return Promise.resolve([branch]);
      }
      return Promise.resolve([]);
    });

    mockChangeRepository.find.mockResolvedValue([branchChange]);

    await expect(remove_branch(mockVersion, 'parent')).rejects.toThrow(RxDBError);
  });

  /**
   * RXD-059：子分支检测不能靠「父分支有哪些 change」反推。
   *
   * 原实现只在父分支存在 change 时才去找子分支，且用 `child.fromChangeId ∈ 父分支的 changeIds`
   * 反推拓扑。一个还没产生任何 change 的分支被开出子分支后即可被删除，留下 `parentId` 指向
   * 不存在分支的孤儿 —— 而孤儿又会被 `find_switch_branch_step` 的「父节点缺失即当作到根」
   * 静默吞掉（RXD-058），于是切分支时只还原半条路径，损坏无声。
   */
  it('拒绝删除没有 change 但有子分支的父分支', async () => {
    const branch = { id: 'parent', activated: false };
    const childBranch = { id: 'child', parentId: 'parent' };

    mockBranchRepository.find.mockImplementation((query: FindQuery) => {
      if (query.where.rules.some(r => r.field === 'id' && r.value === 'parent')) {
        return Promise.resolve([branch]);
      }
      if (query.where.rules.some(r => r.field === 'parentId' && r.value === 'parent')) {
        return Promise.resolve([childBranch]);
      }
      return Promise.resolve([]);
    });
    // 关键：父分支一条 change 都没有
    mockChangeRepository.find.mockResolvedValue([]);

    await expect(remove_branch(mockVersion, 'parent')).rejects.toThrow(
      "Cannot remove branch 'parent' because it has child branches"
    );
    expect(mockAdapter.removeMany).not.toHaveBeenCalled();
  });

  it('should successfully remove branch when child branch query returns empty array', async () => {
    const branch = {
      id: 'feature',
      activated: false
    };

    const change = {
      id: 200,
      branchId: 'feature'
    };

    mockBranchRepository.find
      .mockResolvedValueOnce([branch]) // 查找分支
      .mockResolvedValueOnce([]); // 没有子分支，返回空数组

    mockChangeRepository.find.mockResolvedValue([change]);

    await remove_branch(mockVersion, 'feature');

    expect(mockAdapter.removeMany).toHaveBeenCalledWith([change, branch]);
  });

  it('should successfully remove branch without changes', async () => {
    const branch = {
      id: 'feature',
      activated: false
    };

    mockBranchRepository.find.mockImplementation((query: FindQuery) => {
      if (query.where.rules.some(r => r.field === 'parentId')) return Promise.resolve([]);
      return Promise.resolve([branch]);
    });
    mockChangeRepository.find.mockResolvedValue([]);

    await remove_branch(mockVersion, 'feature');

    expect(mockAdapter.removeMany).toHaveBeenCalledWith([branch]);
  });

  it('should successfully remove branch with changes but no child branches', async () => {
    const branch = {
      id: 'feature',
      activated: false
    };

    const change1 = {
      id: 100,
      branchId: 'feature'
    };

    const change2 = {
      id: 101,
      branchId: 'feature'
    };

    mockBranchRepository.find
      .mockResolvedValueOnce([branch]) // 查找分支
      .mockResolvedValueOnce(null); // 没有子分支，返回 null/falsy

    mockChangeRepository.find.mockResolvedValue([change1, change2]);

    await remove_branch(mockVersion, 'feature');

    expect(mockAdapter.removeMany).toHaveBeenCalledWith([change1, change2, branch]);
  });

  it('should handle branch with changes and check child branches correctly', async () => {
    const branch = {
      id: 'old-feature',
      activated: false
    };

    const change = {
      id: 200,
      branchId: 'old-feature'
    };

    mockBranchRepository.find
      .mockResolvedValueOnce([branch]) // 查找分支
      .mockResolvedValueOnce(null); // 检查返回 null（没有子分支）

    mockChangeRepository.find.mockResolvedValue([change]);

    await remove_branch(mockVersion, 'old-feature');

    expect(mockAdapter.removeMany).toHaveBeenCalledWith([change, branch]);
    expect(mockBranchRepository.find).toHaveBeenCalledTimes(2);
    expect(mockBranchRepository.find).toHaveBeenNthCalledWith(2, {
      where: {
        combinator: 'and',
        rules: [
          { field: 'parentId', operator: '=', value: 'old-feature' },
          { field: 'id', operator: '!=', value: 'old-feature' }
        ]
      },
      limit: 1
    });
  });
});
