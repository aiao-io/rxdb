import {
  type EntityManager,
  type EntityType,
  InvalidBranchIdError,
  type LocalRxDBChangeRepository,
  RxDB,
  RxDBBranch,
  type RxDBBranchCreationContext,
  RxDBError,
  type RxDBSystemContribution,
  SyncType,
  type TransactionExecutor
} from '@aiao/rxdb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { create_branch, get_current_branch_last_change } from '../create-branch.js';
import { VersionManager } from '../VersionManager.js';
import { createMockAdapter } from './fixtures/test-db-setup.js';
import { createTransactionExecutorStub } from './fixtures/transaction-executor-stub.js';

type FindRepositoryMock = { find: ReturnType<typeof vi.fn> };
type SyncConfigStub = { remote?: { adapter: string } };

/** 一次 `writeBranchRows` 调用被看见的样子。 */
interface BranchRowsCall {
  readonly branchId: string;
  /** 本次调用拿到的执行器**是不是** `create_branch` 那个事务的执行器。 */
  readonly executor: RxDBBranchCreationContext['executor'];
  /** 调用发生时，本次事务已经写过多少行——用来判定「排在分支行之后」。 */
  readonly branchRowsWrittenBefore: number;
}

/**
 * 造一个只记账、不写行的系统贡献。
 *
 * @param capability - 能力名，用来在断言里区分多个贡献方；类型跟着契约走（首字母不得大写）
 * @param calls - 共享的记账数组，按真实调用顺序追加
 * @param impl - 覆盖 `writeBranchRows` 的行为（用于「贡献方抛错」那一支）
 *
 * @remarks
 * 这里**不**用真实插件的贡献：本文件测的是核心 `create_branch` 那一侧的契约——
 * 有没有调、拿到的是不是同一个执行器、排不排在分支行之后、抛错让不让它穿出去。
 * 换成真插件，断言就会同时压在「插件写了什么行」上，于是插件改一个字段名，
 * 核心的 spec 跟着红——而红的这一侧什么都不用改。行的内容由
 * `@aiao/rxdb-plugin-working-tree` 自己的 spec 守。
 */
function createRecordingContribution(
  capability: Uncapitalize<string>,
  calls: BranchRowsCall[],
  countCreatedBranches: () => number,
  impl?: () => Promise<void>
): RxDBSystemContribution {
  return {
    capability,
    version: 1,
    packageSpecifier: `@aiao/rxdb-plugin-${capability}`,
    entities: [],
    createInitialRows: () => [],
    createMigrations: () => [],
    bootstrapExisting: async () => undefined,
    writeBranchRows: async (_entityManager, { executor, branchId }) => {
      calls.push({ branchId, executor, branchRowsWrittenBefore: countCreatedBranches() });
      await impl?.();
    },
    // 本文件只压 `create_branch` 那一侧的接缝；删分支的清理与切换分支的前置判定分别由
    // `remove_branch` 与 `VersionManager.switchBranch` 调，各自有 spec 守。
    removeBranchRows: async () => undefined,
    prepareBranchSwitch: async () => undefined,
    takeOverBranchSwitch: async () => 'not_applicable' as const,
    settleBranchSwitchFailure: async () => undefined
  };
}

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
  let savedRows: object[];
  let entityManager: EntityManager;
  let syncConfig: SyncConfigStub;
  let getRemoteRepositoriesMock: ReturnType<typeof vi.fn>;
  let branchRowsCalls: BranchRowsCall[];
  let systemContributions: RxDBSystemContribution[];
  let transactionExecutor: TransactionExecutor;

  beforeEach(() => {
    syncConfig = {};
    getRemoteRepositoriesMock = vi.fn();
    entityManager = createEntityManager();
    savedRows = [];
    branchRowsCalls = [];
    systemContributions = [];

    mockBranchRepository = {
      find: vi.fn(),
      create: vi.fn(async (entity: object) => entity)
    };

    mockChangeRepository = {
      find: vi.fn()
    };

    // 「查重 → 解析分叉点 → 写入」整段搬进了事务，事务内的仓库由 executor 给。
    // 打桩把它转发回同一组 mock，因此下面各用例断言的可观测行为不变。
    //
    // 不走 `createTransactionStub`：那个 helper 把 executor 造在自己肚子里，而本文件要
    // **按引用**断言贡献方拿到的就是这一个（见下方「执行器同一性」那条）。自己造一份留住它。
    transactionExecutor = createTransactionExecutorStub({
      getRepository: (EntityType: EntityType) => {
        if ((EntityType as unknown) === RxDBBranch) return mockBranchRepository;
        return mockChangeRepository;
      },
      saveMany: (entities: never[]) => {
        savedRows.push(...(entities as object[]));
      }
    });
    const transaction = vi.fn(async (fun: (executor: TransactionExecutor) => Promise<unknown>) =>
      fun(transactionExecutor)
    );

    mockVersion = {
      rxdb: { config: { sync: syncConfig }, entityManager, systemContributions },
      getLocalRepositories: vi.fn().mockResolvedValue({
        branchRepository: mockBranchRepository,
        changeRepository: mockChangeRepository,
        adapter: { transaction }
      }),
      getRemoteRepositories: getRemoteRepositoriesMock
    } as unknown as VersionManager;
  });

  // 哨兵 `'*active*'` 与用户分支 id 同处 `rxdb_branch.id` 一列。校验挡在**最前面**：
  // 排在查重之后的话，一条叫 `*active*` 的分支会先跑完本地查重、再跑一趟远端 RTT，
  // 最后才被拒——而它从第一个字符起就不可能可用。
  it('拒绝含 active 哨兵保留字符的分支 id，且不查库', async () => {
    await expect(create_branch(mockVersion, '*active*')).rejects.toThrow(InvalidBranchIdError);
    expect(mockBranchRepository.find).not.toHaveBeenCalled();
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

  it('每个系统贡献都被调到一次，拿到的是本事务的执行器与刚写下的分支 id', async () => {
    systemContributions.push(
      createRecordingContribution('alpha', branchRowsCalls, () => mockBranchRepository.create.mock.calls.length),
      createRecordingContribution('beta', branchRowsCalls, () => mockBranchRepository.create.mock.calls.length)
    );
    seedSourceBranch();

    await create_branch(mockVersion, 'feature-x');

    // 执行器同一性是这条断言的重点，不是「调到了」：贡献方若拿到的是绑在适配器上的那份仓库，
    // 它的写入会排在本事务**之后**，于是「分支行与贡献行同生共死」这条不变量静默失效——
    // 中间失败留下的是一条「分支在、贡献行不在」的分支，而它与一条正常的老分支形状上分辨不出来。
    expect(
      branchRowsCalls.map(call => ({ branchId: call.branchId, sameExecutor: call.executor === transactionExecutor }))
    ).toEqual([
      { branchId: 'feature-x', sameExecutor: true },
      { branchId: 'feature-x', sameExecutor: true }
    ]);
    // 排在 `branchRepository.create(branch)` **之后**：贡献行按 branchId 引用分支行，
    // 先写贡献行会在有外键的后端上当场违约，在没有外键的后端上则悄悄建成孤儿。
    expect(branchRowsCalls.map(call => call.branchRowsWrittenBefore)).toEqual([1, 1]);
  });

  it('贡献方抛错时整条 create_branch 抛出去，不被吞掉', async () => {
    const failure = new Error('contribution refused');
    systemContributions.push(
      createRecordingContribution(
        'alpha',
        branchRowsCalls,
        () => mockBranchRepository.create.mock.calls.length,
        async () => {
          throw failure;
        }
      ),
      createRecordingContribution('beta', branchRowsCalls, () => mockBranchRepository.create.mock.calls.length)
    );
    seedSourceBranch();

    // 吞掉等于把一条半成品分支当成功返回。而且必须**当场**中断：
    // 串行遍历时第一个贡献方抛错，后面的就不该再写自己那几行——那些行会随事务回滚，
    // 但在没有真事务的后端上就是实打实的垃圾。
    await expect(create_branch(mockVersion, 'feature-x')).rejects.toThrow(failure);
    expect(branchRowsCalls.map(call => call.branchId)).toEqual(['feature-x']);
  });

  it('一个贡献方都没有时照常建出分支', async () => {
    seedSourceBranch();

    // 没装任何贡献系统能力的插件是**最常见**的库，不是边角情况：这条断言守的是
    // 「遍历一个空数组」不会因为某天加进来的 `contributions[0]` 之类写法而炸。
    const branch = await create_branch(mockVersion, 'feature-x');

    expect(branch.id).toBe('feature-x');
    expect(branchRowsCalls).toEqual([]);
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
