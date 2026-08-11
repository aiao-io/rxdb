import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBranches } from '../../version/sync-branches.js';
import { VersionManager } from '../../version/VersionManager.js';

type BranchRepositoryMock = {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
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
  let mockRemoteAdapter: RemoteAdapterMock;
  let pullBranchesMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockBranchRepository = {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    };

    pullBranchesMock = vi.fn();
    mockRemoteAdapter = { pullBranches: pullBranchesMock };

    mockVersion = {
      getLocalRepositories: vi.fn().mockResolvedValue({
        // 落库整段走事务，事务体内只能用 executor 作用域的仓库（RXD-035）。
        adapter: {
          transaction: (fun: (executor: unknown) => Promise<unknown>) =>
            fun({ getRepository: () => mockBranchRepository })
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

    expect(result).toEqual({ created: 0, updated: 0, total: 0 });
  });

  it('should return empty result if no remote branches', async () => {
    pullBranchesMock.mockResolvedValue([]);

    const result = await syncBranches(mockVersion);

    expect(result).toEqual({ created: 0, updated: 0, total: 0 });
  });

  it('should create local entries for new remote branches', async () => {
    pullBranchesMock.mockResolvedValue([
      { id: 'feature-a', fromChangeId: 10, parentId: 'main' },
      { id: 'feature-b', fromChangeId: 20, parentId: 'main' }
    ]);
    mockBranchRepository.find.mockResolvedValue([LOCAL_MAIN]);

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.total).toBe(2);
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

    const result = await syncBranches(mockVersion);

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.total).toBe(3);
  });
});
