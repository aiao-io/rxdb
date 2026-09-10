import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDBBranch } from '../../system/branch.js';
import { RxDBSync } from '../../system/sync.js';
import { getAncestorBranchIds } from '../../version/branch-utils.js';
import { pushBranch } from '../../version/push-branch.js';
import { getOrCreateSyncRecord } from '../../version/sync-record-utils.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { createTestDB } from '../fixtures/test-db-setup.js';

const createBranchManager = (find: ReturnType<typeof vi.fn>): VersionManager => {
  const branchRepository = { find };
  const adapter = { getRepository: vi.fn(() => branchRepository) };
  return {
    getLocalRepositories: vi.fn(async () => ({ adapter }))
  } as unknown as VersionManager;
};

describe('branch-utils', () => {
  it('returns main without opening the local adapter', async () => {
    const getLocalRepositories = vi.fn();
    const vm = { getLocalRepositories } as unknown as VersionManager;

    await expect(getAncestorBranchIds(vm, 'main')).resolves.toEqual(['main']);
    expect(getLocalRepositories).not.toHaveBeenCalled();
  });

  it('walks parent branches in order and stops when the chain ends', async () => {
    const find = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'feature', parentId: 'dev' }])
      .mockResolvedValueOnce([{ id: 'dev', parentId: 'main' }])
      .mockResolvedValueOnce([{ id: 'main', parentId: null }]);
    const vm = createBranchManager(find);

    await expect(getAncestorBranchIds(vm, 'feature')).resolves.toEqual(['feature', 'dev', 'main']);
    expect(find).toHaveBeenCalledTimes(3);
    expect(find.mock.calls.map(([options]) => options.where.rules[0].value)).toEqual(['feature', 'dev', 'main']);
  });

  it('stops at missing parents and cycles', async () => {
    const missing = createBranchManager(vi.fn().mockResolvedValue([]));
    const cycle = createBranchManager(
      vi
        .fn()
        .mockResolvedValueOnce([{ id: 'feature', parentId: 'dev' }])
        .mockResolvedValueOnce([{ id: 'dev', parentId: 'feature' }])
    );

    await expect(getAncestorBranchIds(missing, 'feature')).resolves.toEqual(['feature']);
    await expect(getAncestorBranchIds(cycle, 'feature')).resolves.toEqual(['feature', 'dev']);
  });
});

/**
 * @param branch - `getCurrentBranch()` 交回的分支
 * @param remoteAdapter - 远端适配器桩
 * @param localChanges - 本地 `RxDBChange` 表内容，用于 `fromChangeId` 的本地 → 远端翻译。
 * 分叉点在本地不存在时 `toRemoteFromChangeId` 会抛错（分支表与变更表已不一致，不能猜）。
 */
const createPushManager = (
  branch: Partial<RxDBBranch> | undefined,
  remoteAdapter: object = {},
  localChanges: Array<{ id: number; remoteId: number | null }> = []
) => {
  const branchRepository = { update: vi.fn(async () => undefined) };
  const changeRepository = {
    find: vi.fn(async (query: { where: { rules: Array<{ value: number }> } }) =>
      localChanges.filter(change => change.id === query.where.rules[0].value)
    )
  };
  const getLocalRepositories = vi.fn(async () => ({ branchRepository, changeRepository }));
  const getRemoteRepositories = vi.fn(async () => ({ adapter: remoteAdapter }));
  const vm = {
    getCurrentBranch: vi.fn(async () => branch),
    getLocalRepositories,
    getRemoteRepositories
  } as unknown as VersionManager;

  return { vm, branchRepository, changeRepository, getLocalRepositories, getRemoteRepositories };
};

describe('push-branch', () => {
  it('skips a missing branch and the main branch', async () => {
    const missing = createPushManager(undefined);
    const main = createPushManager({ id: 'main' });

    await expect(pushBranch(missing.vm)).resolves.toEqual({ synced: 0, skipped: [], forkPointPending: false });
    await expect(pushBranch(main.vm)).resolves.toEqual({
      synced: 0,
      skipped: ['main'],
      forkPointPending: false
    });
    expect(missing.getRemoteRepositories).not.toHaveBeenCalled();
    expect(main.getRemoteRepositories).not.toHaveBeenCalled();
  });

  it('skips adapters without branch push support', async () => {
    const harness = createPushManager({ id: 'feature' });

    await expect(pushBranch(harness.vm)).resolves.toEqual({ synced: 0, skipped: [], forkPointPending: false });
    expect(harness.getLocalRepositories).not.toHaveBeenCalled();
  });

  it('pushes the branch payload and marks a newly synced local branch as remote', async () => {
    const pushBranches = vi.fn(async () => ({ synced: 1, skipped: [] }));
    const branch = {
      id: 'feature',
      fromChangeId: 42,
      local: true,
      remote: false,
      parentId: 'main'
    } satisfies Partial<RxDBBranch>;
    // 本地 42 号变更已推送，远端认得它的 9042
    const harness = createPushManager(branch, { pushBranches }, [{ id: 42, remoteId: 9042 }]);

    await expect(pushBranch(harness.vm)).resolves.toEqual({ synced: 1, skipped: [], forkPointPending: false });
    // 上行的必须是远端 id：本地 id 对远端毫无意义，原样发过去会指向一条无关变更
    expect(pushBranches).toHaveBeenCalledWith([
      {
        id: 'feature',
        fromChangeId: 9042,
        local: true,
        remote: true,
        parentId: 'main'
      }
    ]);
    expect(harness.branchRepository.update).toHaveBeenCalledWith(
      branch,
      expect.objectContaining({ remote: true, updatedAt: expect.any(Date) })
    );
  });

  it('分叉点还没推上去时发 null 并报告 forkPointPending', async () => {
    // pushBranch 必然早于变更推送（远端分支行要先在，变更才挂得上去），所以分叉点
    // 常常还没有 remoteId。此时唯一诚实的选择是发 null 并把这件事报给调用方，
    // 由 push() 在变更推完后重推一次分支补全远端那一行。
    const pushBranches = vi.fn(async () => ({ synced: 1, skipped: [] }));
    const harness = createPushManager(
      { id: 'feature', fromChangeId: 42, local: true, remote: true, parentId: 'main' },
      { pushBranches },
      [{ id: 42, remoteId: null }]
    );

    await expect(pushBranch(harness.vm)).resolves.toEqual({ synced: 1, skipped: [], forkPointPending: true });
    expect(pushBranches).toHaveBeenCalledWith([expect.objectContaining({ fromChangeId: null })]);
  });

  it('分叉点在本地变更表里不存在时抛错，不猜一个 id 发出去', async () => {
    const pushBranches = vi.fn(async () => ({ synced: 1, skipped: [] }));
    const harness = createPushManager(
      { id: 'feature', fromChangeId: 42, local: true, remote: true, parentId: 'main' },
      { pushBranches },
      []
    );

    await expect(pushBranch(harness.vm)).rejects.toThrow(/RxDBChange id=42/);
    expect(pushBranches).not.toHaveBeenCalled();
  });

  it('does not rewrite the local branch when nothing synced or it was already remote', async () => {
    const notSynced = createPushManager(
      { id: 'feature', remote: false },
      { pushBranches: vi.fn(async () => ({ synced: 0, skipped: [] })) }
    );
    const alreadyRemote = createPushManager(
      { id: 'feature', remote: true },
      { pushBranches: vi.fn(async () => ({ synced: 1, skipped: [] })) }
    );

    await pushBranch(notSynced.vm);
    await pushBranch(alreadyRemote.vm);

    expect(notSynced.branchRepository.update).not.toHaveBeenCalled();
    expect(alreadyRemote.branchRepository.update).not.toHaveBeenCalled();
  });
});

describe('sync-record-utils', () => {
  let cleanup: () => Promise<void>;
  let instantiateSyncRecord: () => RxDBSync;

  beforeAll(async () => {
    const database = await createTestDB();
    cleanup = database.cleanup;
    instantiateSyncRecord = () => database.rxdb.entityManager.instantiate(RxDBSync);
  });

  afterAll(async () => {
    await cleanup();
  });

  it('returns an existing branch-scoped sync record', async () => {
    const existing = Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, { id: 'public:User:main' });
    const find = vi.fn(async () => [existing]);
    const create = vi.fn();
    const repository = { find, create } as unknown as IRepository<typeof RxDBSync>;

    await expect(
      getOrCreateSyncRecord(
        repository,
        {
          namespace: 'public',
          entity: 'User',
          branchId: 'main',
          syncType: 'full'
        },
        instantiateSyncRecord
      )
    ).resolves.toBe(existing);
    expect(find).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'public:User:main' }]
      },
      limit: 1
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a fully initialized sync record when none exists', async () => {
    const find = vi.fn(async () => []);
    const create = vi.fn(async (record: RxDBSync) => record);
    const repository = { find, create } as unknown as IRepository<typeof RxDBSync>;

    const record = await getOrCreateSyncRecord(
      repository,
      {
        namespace: 'tenant',
        entity: 'Post',
        branchId: 'feature',
        syncType: 'filter'
      },
      instantiateSyncRecord
    );

    expect(record).toBeInstanceOf(RxDBSync);
    expect(record).toMatchObject({
      id: 'tenant:Post:feature',
      namespace: 'tenant',
      entity: 'Post',
      branchId: 'feature',
      syncType: 'filter',
      lastPushedChangeId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      lastPullRemoteChangeId: null,
      enabled: true
    });
    expect(record.createdAt).toBeInstanceOf(Date);
    expect(record.updatedAt).toBeInstanceOf(Date);
    expect(create).toHaveBeenCalledWith(record);
  });
});
