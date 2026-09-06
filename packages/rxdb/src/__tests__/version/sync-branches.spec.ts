import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxDBChange } from '../../system/change.js';
import { syncBranches } from '../../version/sync-branches.js';
import { VersionManager } from '../../version/VersionManager.js';

type BranchRepositoryMock = {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
type ChangeRepositoryMock = { find: ReturnType<typeof vi.fn> };
type RemoteAdapterMock = { pullBranches?: ReturnType<typeof vi.fn> };

/**
 * 本地已有的 `main`。
 *
 * 用例里的远端分支都挂在 `main` 下，而 `syncBranches` 现在按「父在前」落库（RXD-035），
 * 父找不到就整批放弃。所以 `find` 必须交出 `main` —— 这也是真实形态：
 * `getCurrentBranch` 保证本地永远有一个 `main`，远端分支挂空父才是不可能发生的。
 */
const LOCAL_MAIN = { id: 'main', remote: true };

describe('syncBranches', () => {
  let mockVersion: VersionManager;
  let mockBranchRepository: BranchRepositoryMock;
  let mockChangeRepository: ChangeRepositoryMock;
  let mockRemoteAdapter: RemoteAdapterMock;
  let pullBranchesMock: ReturnType<typeof vi.fn>;

  /**
   * 让远端 change id 一律翻译得出本地 id。
   *
   * `fromChangeId` 跨端必须翻译（见 `branch-change-id.ts`），默认给一个恒成功的对照表，
   * 单独验证「翻译不出来」的用例再自行覆盖。
   */
  const resolveRemoteChangeIds = (map: Record<number, number>) => {
    mockChangeRepository.find.mockImplementation(async (query: { where: { rules: Array<{ value: number }> } }) => {
      const remoteId = query.where.rules[0].value;
      const localId = map[remoteId];
      return localId === undefined ? [] : [{ id: localId, remoteId }];
    });
  };

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    };
    mockChangeRepository = { find: vi.fn().mockResolvedValue([]) };

    pullBranchesMock = vi.fn();
    mockRemoteAdapter = { pullBranches: pullBranchesMock };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        // 落库整段走事务，事务体内只能用 executor 作用域的仓库（RXD-035）。
        adapter: {
          transaction: (fun: (executor: unknown) => Promise<unknown>) =>
            fun({
              getRepository: (entity: unknown) => (entity === RxDBChange ? mockChangeRepository : mockBranchRepository)
            })
        }
      }),
      getRemoteRepositories: vi.fn().mockResolvedValue({
        adapter: mockRemoteAdapter
      })
    } as unknown as VersionManager;
  });

  it('should return empty result if pullBranches not implemented', async () => {
    mockRemoteAdapter.pullBranches = undefined;

    const result = await syncBranches(mockVersion);

    expect(result).toEqual({ created: 0, updated: 0, total: 0, skipped: [] });
  });

  it('should return empty result if no remote branches', async () => {
    pullBranchesMock.mockResolvedValue([]);

    const result = await syncBranches(mockVersion);

    expect(result).toEqual({ created: 0, updated: 0, total: 0, skipped: [] });
  });

  it('should create local entries for new remote branches', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: 'feature-a', fromChangeId: 10, parentId: 'main' },
      { id: 'feature-b', fromChangeId: 20, parentId: 'main' }
    ]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 10: 101, 20: 202 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it('把远端 fromChangeId 翻译成本地 id 后才落库', async () => {
    // 远端 change id 与本地是两条独立自增序列，只有 RxDBChange.remoteId 把它们对上。
    // 原样写进本地分支行会让分叉点指向一条碰巧存在的无关变更，切分支时应用错误区间。
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 9042, parentId: 'main' }]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 9042: 17 });

    await syncBranches(mockVersion);

    expect(mockChangeRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { combinator: 'and', rules: [{ field: 'remoteId', operator: '=', value: 9042 }] }
      })
    );
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ fromChangeId: 17 }));
  });

  it('分叉点变更还没拉到本地时跳过该分支，不写 null 也不写远端 id', async () => {
    // 写 null 会被 find-switch-branch-step 当"分叉于根"，从第一条变更起算；
    // 写远端 id 会被当本地 id 消费。两者都是静默损坏，唯一无损的选择是本轮跳过。
    pullBranchesMock.mockResolvedValue([
      { id: 'feature-a', fromChangeId: 9042, parentId: 'main' },
      { id: 'feature-b', fromChangeId: 9043, parentId: 'main' }
    ]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);
    resolveRemoteChangeIds({ 9043: 18 });

    const result = await syncBranches(mockVersion);

    expect(result.skipped).toEqual(['feature-a']);
    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'feature-b', fromChangeId: 18 })
    );
  });

  it('远端分叉点为空时照常落库，不去翻译', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-root', fromChangeId: null, parentId: 'main' }]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);

    const result = await syncBranches(mockVersion);

    expect(mockChangeRepository.find).not.toHaveBeenCalled();
    expect(result.created).toBe(1);
    expect(mockBranchRepository.create).toHaveBeenCalledWith(expect.objectContaining({ fromChangeId: null }));
  });

  it('should update remote flag for existing local branches', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 10, parentId: 'main' }]);

    const localBranch = { id: 'feature-a', remote: false };
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN, localBranch]);

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockBranchRepository.update).toHaveBeenCalledWith(localBranch, expect.objectContaining({ remote: true }));
  });

  it('should skip branches already marked as remote', async () => {
    pullBranchesMock.mockResolvedValue([{ id: 'feature-a', fromChangeId: 10, parentId: 'main' }]);

    const localBranch = { id: 'feature-a', remote: true };
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN, localBranch]);

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(mockBranchRepository.update).not.toHaveBeenCalled();
  });

  it('should handle mixed scenario: new + existing + already-remote', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: 'remote-only', fromChangeId: 1, parentId: 'main' },
      { id: 'local-not-remote', fromChangeId: 2, parentId: 'main' },
      { id: 'already-synced', fromChangeId: 3, parentId: 'main' }
    ]);

    mockBranchRepository.find.mockResolvedValue([
      LOCAL_MAIN,
      { id: 'local-not-remote', remote: false },
      { id: 'already-synced', remote: true }
    ]);
    resolveRemoteChangeIds({ 1: 11 });

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.total).toBe(3);
  });
});
