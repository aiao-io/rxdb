import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { getAllRepositorySyncStatus } from '../../version/get-all-repository-sync-status.js';

interface QueryRule {
  field: string;
  value: unknown;
}

interface QueryOptions {
  where?: {
    rules: QueryRule[];
  };
}

type SyncFind = (options: QueryOptions) => Promise<RxDBSync[]>;
type ChangeFind = (options: QueryOptions) => Promise<RxDBChange[]>;
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

function createEntityType(name: string, sync: SyncOptions): EntityType {
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

const FullEntity = createEntityType('AllFull', FULL_SYNC);
const RemoteEntity = createEntityType('AllRemote', REMOTE_SYNC);
const LocalEntity = createEntityType('AllLocal', LOCAL_SYNC);
const NoneEntity = createEntityType('AllNone', NONE_SYNC);
const ALL_ENTITIES = [FullEntity, RemoteEntity, LocalEntity, NoneEntity];

function createSyncRecord(entity: string, enabled: boolean, lastPullRemoteChangeId: number | null): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  Object.assign(record, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    syncType: 'full',
    lastPushedChangeId: entity === 'AllFull' ? 7 : null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastPullRemoteChangeId,
    enabled,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  return record;
}

function getRuleValue(options: QueryOptions, field: string): unknown {
  return options.where?.rules.find(rule => rule.field === field)?.value;
}

function createChanges(count: number): RxDBChange[] {
  return Array.from({ length: count }, () => Object.create(RxDBChange.prototype) as RxDBChange);
}

function createAllStatusHarness() {
  const syncRecords = new Map<string, RxDBSync>([
    ['public:AllFull:main', createSyncRecord('AllFull', true, 10)],
    ['public:AllRemote:main', createSyncRecord('AllRemote', false, 4)],
    ['public:AllNone:main', createSyncRecord('AllNone', true, null)]
  ]);
  const pushableCounts = new Map<string, number>([
    ['AllFull', 2],
    ['AllLocal', 0]
  ]);
  const remoteCounts = new Map<string, { count: number; latestChangeId: number }>([
    ['public:AllFull', { count: 3, latestChangeId: 13 }],
    ['public:AllRemote', { count: 2, latestChangeId: 6 }]
  ]);
  const syncFind = vi.fn<SyncFind>(async options => {
    const id = getRuleValue(options, 'id');
    const record = typeof id === 'string' ? syncRecords.get(id) : undefined;
    return record ? [record] : [];
  });
  const changeFind = vi.fn<ChangeFind>(async options => {
    const entity = getRuleValue(options, 'entity');
    return createChanges(typeof entity === 'string' ? (pushableCounts.get(entity) ?? 0) : 0);
  });
  const syncRepository = { find: syncFind } as unknown as IRepository<typeof RxDBSync>;
  const changeRepository = { find: changeFind } as unknown as IRepository<typeof RxDBChange>;
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      if (EntityClass === RxDBChange) return changeRepository;
      throw new Error('Unexpected repository request');
    })
  };
  const getChangeCount = vi.fn<GetChangeCount>(async (_sinceId, repositoryFilter) => {
    const entity = repositoryFilter?.[0];
    return entity ? (remoteCounts.get(entity) ?? { count: 0, latestChangeId: 0 }) : { count: 0, latestChangeId: 0 };
  });
  const rxdb = {
    config: {
      entities: ALL_ENTITIES,
      sync: FULL_SYNC
    },
    versionManager: {
      getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
      getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
      getRemoteRepositories: vi.fn(async () => ({ adapter: { getChangeCount } }))
    }
  } as unknown as RxDB;

  return { rxdb, syncFind, changeFind, getChangeCount };
}

function entityNames(statuses: Awaited<ReturnType<typeof getAllRepositorySyncStatus>>): string[] {
  return statuses.map(status => status.repository.entity);
}

describe('getAllRepositorySyncStatus', () => {
  it('calls the real status implementation for every configured entity', async () => {
    const harness = createAllStatusHarness();

    const statuses = await getAllRepositorySyncStatus(harness.rxdb);

    expect(
      statuses.map(status => ({
        entity: status.repository.entity,
        syncType: status.syncType,
        enabled: status.enabled,
        pushableCount: status.pushableCount,
        pullableCount: status.pullableCount
      }))
    ).toEqual([
      { entity: 'AllFull', syncType: 'full', enabled: true, pushableCount: 2, pullableCount: 3 },
      { entity: 'AllRemote', syncType: 'remote', enabled: false, pushableCount: 0, pullableCount: 2 },
      // RXD-029：local 两个方向都不可同步，`enabled` 恒为 false（原先报 true）
      { entity: 'AllLocal', syncType: 'local', enabled: false, pushableCount: 0, pullableCount: 0 },
      { entity: 'AllNone', syncType: 'none', enabled: false, pushableCount: 0, pullableCount: 0 }
    ]);
    expect(harness.syncFind).toHaveBeenCalled();
    // 只有 AllFull 需要算 pushableCount；AllLocal 是 local-only（不可推），不再白扫一遍变更表
    expect(harness.changeFind).toHaveBeenCalledTimes(1);
    expect(harness.getChangeCount).toHaveBeenCalledTimes(2);
  });

  it('filters by sync type and treats an empty sync type list as no filter', async () => {
    const harness = createAllStatusHarness();

    const selected = await getAllRepositorySyncStatus(harness.rxdb, { syncType: ['full', 'remote'] });
    const unfiltered = await getAllRepositorySyncStatus(harness.rxdb, { syncType: [] });

    expect(entityNames(selected)).toEqual(['AllFull', 'AllRemote']);
    expect(entityNames(unfiltered)).toEqual(['AllFull', 'AllRemote', 'AllLocal', 'AllNone']);
  });

  it('filters both enabled states', async () => {
    const harness = createAllStatusHarness();

    const enabled = await getAllRepositorySyncStatus(harness.rxdb, { enabled: true });
    const disabled = await getAllRepositorySyncStatus(harness.rxdb, { enabled: false });

    // RXD-029：AllLocal 从「启用」挪到「禁用」—— 它本来就不可能同步
    expect(entityNames(enabled)).toEqual(['AllFull']);
    expect(entityNames(disabled)).toEqual(['AllRemote', 'AllLocal', 'AllNone']);
  });

  it('filters both pending-change states', async () => {
    const harness = createAllStatusHarness();

    const pending = await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: true });
    const settled = await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: false });

    expect(entityNames(pending)).toEqual(['AllFull', 'AllRemote']);
    expect(entityNames(settled)).toEqual(['AllLocal', 'AllNone']);
  });

  it('applies sync type, enabled, and pending filters together', async () => {
    const harness = createAllStatusHarness();

    const statuses = await getAllRepositorySyncStatus(harness.rxdb, {
      syncType: ['full', 'local'],
      enabled: true,
      hasPendingChanges: true
    });

    expect(entityNames(statuses)).toEqual(['AllFull']);
  });
});
