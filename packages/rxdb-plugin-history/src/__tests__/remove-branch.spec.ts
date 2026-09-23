import {
  type EntityType,
  RxDBBranch,
  type RxDBBranchRemovalContext,
  RxDBError,
  type RxDBSystemContribution,
  type TransactionExecutor
} from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remove_branch } from '../remove-branch.js';
import { VersionManager } from '../VersionManager.js';
import { createTransactionExecutorStub } from './fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type RemoveAdapterMock = {
  removeMany: ReturnType<typeof vi.fn>;
  getRepository: (EntityType: EntityType) => unknown;
  transaction: ReturnType<typeof vi.fn>;
};
type FindQuery = {
  where: {
    rules: Array<{ field: string; value?: unknown }>;
  };
};

/** 一次 `removeBranchRows` 调用被看见的样子。 */
interface BranchRowsCall {
  readonly branchId: string;
  /** 本次调用拿到的执行器**是不是** `remove_branch` 那个事务的执行器。 */
  readonly executor: RxDBBranchRemovalContext['executor'];
  /** 调用发生时本次事务已经删过多少批——用来判定「排在分支行之前」。 */
  readonly removalsBefore: number;
}

/**
 * 造一个只记账、不删行的系统贡献。
 *
 * @param calls - 共享的记账数组，按真实调用顺序追加
 * @param countRemovals - 读一下本次事务到此为止删过几批
 * @param impl - 覆盖 `removeBranchRows` 的行为（用于「贡献方抛错」那一支）
 *
 * @remarks
 * 不用真实插件的贡献：本文件测的是 `remove_branch` 那一侧的契约——有没有调、拿到的是不是
 * 同一个执行器、排不排在分支行之前、抛错让不让它穿出去。换成真插件，断言会同时压在
 * 「插件删了哪几张表」上，于是插件加一张表、本文件跟着红，而红的这一侧什么都不用改。
 * 删了什么由 `@aiao/rxdb-plugin-working-tree` 自己的 `remove-branch-aba.spec.ts` 守。
 */
function createRecordingContribution(
  calls: BranchRowsCall[],
  countRemovals: () => number,
  impl?: () => Promise<void>
): RxDBSystemContribution {
  return {
    capability: 'probe',
    version: 1,
    packageSpecifier: '@aiao/rxdb-plugin-probe',
    entities: [],
    createInitialRows: () => [],
    createMigrations: () => [],
    bootstrapExisting: async () => undefined,
    writeBranchRows: async () => undefined,
    removeBranchRows: async ({ executor, branchId }) => {
      calls.push({ branchId, executor, removalsBefore: countRemovals() });
      await impl?.();
    },
    prepareBranchSwitch: async () => undefined
  };
}

describe('remove_branch', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: FindRepositoryMock;
  let mockChangeRepository: FindRepositoryMock;
  let mockAdapter: RemoveAdapterMock;
  let branchRowsCalls: BranchRowsCall[];
  let systemContributions: RxDBSystemContribution[];
  let transactionExecutor: TransactionExecutor;

  beforeEach(() => {
    branchRowsCalls = [];
    systemContributions = [];

    mockBranchRepository = {
      find: vi.fn()
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    // 「查 → 删」整段搬进了事务：仓库改由 executor 给，删除改走 `executor.removeMany()`。
    // 打桩把两者都转发回原来的 mock，因此下面各用例的断言对象与语义都不变。
    //
    // 不走 `createTransactionStub`：那个 helper 把 executor 造在自己肚子里，而本文件要
    // **按引用**断言贡献方拿到的就是这一个（见下方「执行器同一性」那条）。自己造一份留住它。
    const host = {
      removeMany: vi.fn().mockResolvedValue(undefined),
      getRepository: (EntityType: EntityType) =>
        (EntityType as unknown) === RxDBBranch ? mockBranchRepository : mockChangeRepository
    };
    transactionExecutor = createTransactionExecutorStub(host);
    mockAdapter = {
      ...host,
      transaction: vi.fn(async (fun: (executor: TransactionExecutor) => Promise<unknown>) => fun(transactionExecutor))
    };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: mockAdapter
      }),
      // 贡献方在删分支行之前被无条件遍历一遍（`RxDBSystemContribution.removeBranchRows`），
      // 所以这个字段不是可选布景：缺了它 `remove_branch` 当场 TypeError。
      rxdb: { systemContributions }
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

  describe('贡献方的分支级行清理（FR-044）', () => {
    /** 布景：一条可删的分支加一条它名下的 change。 */
    const seedRemovableBranch = () => {
      const branch = { id: 'feature', activated: false };
      const change = { id: 300, branchId: 'feature' };
      mockBranchRepository.find.mockImplementation((query: FindQuery) => {
        if (query.where.rules.some(r => r.field === 'parentId')) return Promise.resolve([]);
        return Promise.resolve([branch]);
      });
      mockChangeRepository.find.mockResolvedValue([change]);
      return { branch, change };
    };

    it('每个贡献方都被调到，且拿到的是本次事务的执行器', async () => {
      systemContributions.push(
        createRecordingContribution(branchRowsCalls, () => mockAdapter.removeMany.mock.calls.length)
      );
      seedRemovableBranch();

      await remove_branch(mockVersion, 'feature');

      // 自己另开一个事务的话，中间失败留下的是「分支没了、贡献行还在」，
      // 而那些行按 id 挂靠——同名重建出来的新分支会逐字命中它们。按引用比，
      // 不比「是不是一个 executor」：形状相同的另一个执行器属于另一个事务。
      expect(
        branchRowsCalls.map(call => ({ branchId: call.branchId, sameExecutor: call.executor === transactionExecutor }))
      ).toEqual([{ branchId: 'feature', sameExecutor: true }]);
    });

    it('排在分支行被删之前', async () => {
      systemContributions.push(
        createRecordingContribution(branchRowsCalls, () => mockAdapter.removeMany.mock.calls.length)
      );
      seedRemovableBranch();

      await remove_branch(mockVersion, 'feature');

      // 反过来（先删分支行再调贡献）时，贡献方读到的是一条已经不存在的分支——
      // 而它要清的那几张表全按这条分支的 id 挂靠。
      expect(branchRowsCalls[0].removalsBefore).toBe(0);
      expect(mockAdapter.removeMany).toHaveBeenCalledTimes(1);
    });

    it('贡献方抛错时整条删除失败，分支行一行都没删', async () => {
      systemContributions.push(
        createRecordingContribution(
          branchRowsCalls,
          () => mockAdapter.removeMany.mock.calls.length,
          async () => {
            throw new RxDBError('贡献方清理失败');
          }
        )
      );
      seedRemovableBranch();

      // 吞掉它的话，留下的是一条「分支没了、贡献行还在」的库，而这种残留
      // 与一条正常的老分支在形状上分辨不出来。
      await expect(remove_branch(mockVersion, 'feature')).rejects.toThrow('贡献方清理失败');
      expect(mockAdapter.removeMany).not.toHaveBeenCalled();
    });

    it('一个贡献方都没有时照常删', async () => {
      const { branch, change } = seedRemovableBranch();

      await remove_branch(mockVersion, 'feature');

      expect(mockAdapter.removeMany).toHaveBeenCalledWith([change, branch]);
    });
  });
});
