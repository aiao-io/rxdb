import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBSync } from '../../system/sync.js';
import { checkRepositoryUpdates } from '../../version/check-repository-updates.js';

interface QueryRule {
  field: string;
  operator: string;
  value: unknown;
}

interface QueryOptions {
  where?: {
    combinator: 'and' | 'or';
    rules: QueryRule[];
  };
  limit?: number;
}

type SyncFind = (options: QueryOptions) => Promise<RxDBSync[]>;
type GetChangeCount = (
  sinceId: number,
  repositoryFilter?: string[],
  branchId?: string
) => Promise<{ count: number; latestChangeId: number }>;

const LOCAL_ADAPTER = { adapter: 'local' };
const REMOTE_ADAPTER = { adapter: 'remote' };
const FULL_SYNC: SyncOptions = {
  type: SyncType.Full,
  local: LOCAL_ADAPTER,
  remote: REMOTE_ADAPTER
};
const REMOTE_SYNC: SyncOptions = {
  type: SyncType.None,
  remote: REMOTE_ADAPTER
};
const LOCAL_SYNC: SyncOptions = {
  type: SyncType.None,
  local: LOCAL_ADAPTER
};
const NONE_SYNC: SyncOptions = {
  type: SyncType.None,
  local: LOCAL_ADAPTER,
  remote: REMOTE_ADAPTER
};

function createEntityType(name: string, sync?: SyncOptions): EntityType {
  class TestEntity {
    id!: string;
  }

  Object.assign(TestEntity, {
    [METADATA]: {
      name,
      namespace: 'public',
      sync
    } as unknown as EntityMetadata
  });

  return TestEntity;
}

const PullEntity = createEntityType('CheckPull', REMOTE_SYNC);
const LocalEntity = createEntityType('CheckLocal', LOCAL_SYNC);
const NoneEntity = createEntityType('CheckNone', NONE_SYNC);
const InheritedEntity = createEntityType('CheckInherited');

function createSyncRecord(entity: string, lastPullRemoteChangeId: number | null): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  Object.assign(record, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    syncType: 'remote',
    lastPushedChangeId: null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastPullRemoteChangeId,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  return record;
}

interface CheckHarnessOptions {
  entities: EntityType[];
  branchId?: string;
  syncRecords?: RxDBSync[];
  remoteResult?: { count: number; latestChangeId: number };
  remoteConfigured?: boolean;
  globalSync?: SyncOptions;
}

function createCheckHarness(options: CheckHarnessOptions) {
  const syncFind = vi.fn<SyncFind>(async () => options.syncRecords ?? []);
  const syncRepository = { find: syncFind } as unknown as IRepository<typeof RxDBSync>;
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      throw new Error('Unexpected repository request');
    })
  };
  const getChangeCount = vi.fn<GetChangeCount>(async () => options.remoteResult ?? { count: 0, latestChangeId: 0 });
  const remoteAdapter = options.remoteConfigured === false ? undefined : { getChangeCount };
  const getCurrentBranch = vi.fn(async () => ({ id: options.branchId ?? 'main' }));
  const getLocalRepositories = vi.fn(async () => ({ adapter: localAdapter }));
  const getRemoteRepositories = vi.fn(async () => ({ adapter: remoteAdapter }));
  const rxdb = {
    config: {
      entities: options.entities,
      sync: options.globalSync ?? FULL_SYNC
    },
    versionManager: {
      getCurrentBranch,
      getLocalRepositories,
      getRemoteRepositories
    }
  } as unknown as RxDB;

  return {
    rxdb,
    syncFind,
    getChangeCount,
    getCurrentBranch,
    getLocalRepositories,
    getRemoteRepositories
  };
}

describe('checkRepositoryUpdates', () => {
  it('rejects an unregistered entity before querying synchronization state', async () => {
    const harness = createCheckHarness({ entities: [PullEntity] });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'Missing')).rejects.toThrow(
      'Entity not found: public.Missing'
    );
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.getLocalRepositories).not.toHaveBeenCalled();
    expect(harness.getRemoteRepositories).not.toHaveBeenCalled();
  });

  it.each([
    ['local-only', LocalEntity, 'CheckLocal'],
    ['no-sync', NoneEntity, 'CheckNone']
  ])('returns no updates for a %s entity without opening repositories', async (_label, EntityClass, entity) => {
    const harness = createCheckHarness({
      entities: [EntityClass],
      remoteResult: { count: 9, latestChangeId: 9 }
    });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', entity)).resolves.toEqual({
      repository: { namespace: 'public', entity },
      remoteLatestChangeId: 0,
      localLastPullRemoteChangeId: null,
      pendingCount: 0,
      hasUpdates: false
    });
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.getLocalRepositories).not.toHaveBeenCalled();
    expect(harness.getRemoteRepositories).not.toHaveBeenCalled();
  });

  it('uses zero as the remote watermark when no sync record exists', async () => {
    const harness = createCheckHarness({
      entities: [PullEntity],
      branchId: 'feature',
      syncRecords: [],
      remoteResult: { count: 5, latestChangeId: 12 }
    });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckPull' },
      remoteLatestChangeId: 12,
      localLastPullRemoteChangeId: null,
      pendingCount: 5,
      hasUpdates: true
    });
    expect(harness.syncFind).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'public:CheckPull:feature' }]
      },
      limit: 1
    });
    expect(harness.getChangeCount).toHaveBeenCalledWith(0, ['public:CheckPull'], 'feature');
  });

  it('passes the persisted remote watermark and reports an empty remote count', async () => {
    const harness = createCheckHarness({
      entities: [PullEntity],
      syncRecords: [createSyncRecord('CheckPull', 40)],
      remoteResult: { count: 0, latestChangeId: 40 }
    });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckPull' },
      remoteLatestChangeId: 40,
      localLastPullRemoteChangeId: 40,
      pendingCount: 0,
      hasUpdates: false
    });
    expect(harness.getChangeCount).toHaveBeenCalledWith(40, ['public:CheckPull'], 'main');
  });

  it('rejects when a pullable entity has no remote adapter', async () => {
    const harness = createCheckHarness({
      entities: [PullEntity],
      remoteConfigured: false
    });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).rejects.toThrow(
      'Remote adapter not configured'
    );
    expect(harness.syncFind).toHaveBeenCalledTimes(1);
    expect(harness.getChangeCount).not.toHaveBeenCalled();
  });

  it('inherits the global full-sync pull policy when entity metadata has no sync override', async () => {
    const harness = createCheckHarness({
      entities: [InheritedEntity],
      globalSync: FULL_SYNC,
      remoteResult: { count: 2, latestChangeId: 2 }
    });

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckInherited')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckInherited' },
      remoteLatestChangeId: 2,
      localLastPullRemoteChangeId: null,
      pendingCount: 2,
      hasUpdates: true
    });
    expect(harness.getChangeCount).toHaveBeenCalledWith(0, ['public:CheckInherited'], 'main');
  });
});
