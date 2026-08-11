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

const createPushManager = (branch: Partial<RxDBBranch> | undefined, remoteAdapter: object = {}) => {
  const branchRepository = { update: vi.fn(async () => undefined) };
  const getLocalRepositories = vi.fn(async () => ({ branchRepository }));
  const getRemoteRepositories = vi.fn(async () => ({ adapter: remoteAdapter }));
  const vm = {
    getCurrentBranch: vi.fn(async () => branch),
    getLocalRepositories,
    getRemoteRepositories
  } as unknown as VersionManager;

  return { vm, branchRepository, getLocalRepositories, getRemoteRepositories };
};

describe('push-branch', () => {
  it('skips a missing branch and the main branch', async () => {
    const missing = createPushManager(undefined);
    const main = createPushManager({ id: 'main' });

    await expect(pushBranch(missing.vm)).resolves.toEqual({ synced: 0, skipped: [] });
    await expect(pushBranch(main.vm)).resolves.toEqual({ synced: 0, skipped: ['main'] });
    expect(missing.getRemoteRepositories).not.toHaveBeenCalled();
    expect(main.getRemoteRepositories).not.toHaveBeenCalled();
  });

  it('skips adapters without branch push support', async () => {
    const harness = createPushManager({ id: 'feature' });

    await expect(pushBranch(harness.vm)).resolves.toEqual({ synced: 0, skipped: [] });
    expect(harness.getLocalRepositories).not.toHaveBeenCalled();
  });

  it('pushes the branch payload and marks a newly synced local branch as remote', async () => {
    const result = { synced: 1, skipped: [] };
    const pushBranches = vi.fn(async () => result);
    const branch = {
      id: 'feature',
      fromChangeId: 42,
      local: true,
      remote: false,
      parentId: 'main'
    } satisfies Partial<RxDBBranch>;
    const harness = createPushManager(branch, { pushBranches });

    await expect(pushBranch(harness.vm)).resolves.toBe(result);
    expect(pushBranches).toHaveBeenCalledWith([
      {
        id: 'feature',
        fromChangeId: 42,
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

    expect(notSynced.getLocalRepositories).not.toHaveBeenCalled();
    expect(alreadyRemote.getLocalRepositories).not.toHaveBeenCalled();
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
