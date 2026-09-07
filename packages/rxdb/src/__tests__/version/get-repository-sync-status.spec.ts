import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { getRepositorySyncStatus } from '../../version/get-repository-sync-status.js';

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

const FullEntity = createEntityType('StatusFull', FULL_SYNC);
const RemoteEntity = createEntityType('StatusRemote', REMOTE_SYNC);
const LocalEntity = createEntityType('StatusLocal', LOCAL_SYNC);
const NoneEntity = createEntityType('StatusNone', NONE_SYNC);

function createSyncRecord(entity: string, overrides: Partial<RxDBSync> = {}): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  Object.assign(record, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    syncType: 'full',
    lastPushedChangeId: null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastPullRemoteChangeId: null,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
  });
  return record;
}

function createChanges(count: number): RxDBChange[] {
  return Array.from({ length: count }, () => Object.create(RxDBChange.prototype) as RxDBChange);
}

interface StatusHarnessOptions {
  entities: EntityType[];
  branchId?: string;
  syncRecords?: RxDBSync[];
  changes?: RxDBChange[];
  remoteResult?: { count: number; latestChangeId: number };
  remoteConfigured?: boolean;
  globalSync?: SyncOptions;
}

function createStatusHarness(options: StatusHarnessOptions) {
  const branchId = options.branchId ?? 'main';
  const syncFind = vi.fn<SyncFind>(async () => options.syncRecords ?? []);
  const changeFind = vi.fn<ChangeFind>(async () => options.changes ?? []);
  const syncRepository = { find: syncFind } as unknown as IRepository<typeof RxDBSync>;
  const changeRepository = { find: changeFind } as unknown as IRepository<typeof RxDBChange>;
  // 远端计数覆盖整条祖先链，`getAncestorBranchIds` 会沿 parentId 上溯；
  // 这里的分支都直接挂在 main 下
  const branchFind = vi.fn(async (): Promise<RxDBBranch[]> => [{ id: branchId, parentId: 'main' } as RxDBBranch]);
  const branchRepository = { find: branchFind } as unknown as IRepository<typeof RxDBBranch>;
  const getRepository = vi.fn((EntityClass: unknown) => {
    if (EntityClass === RxDBSync) return syncRepository;
    if (EntityClass === RxDBChange) return changeRepository;
    if (EntityClass === RxDBBranch) return branchRepository;
    throw new Error('Unexpected repository request');
  });
  const localAdapter = { getRepository };
  // `remoteResult` 描述的是**当前分支**上的远端变更；祖先分支上没有，返回零。
  // 计数跨祖先链相加，用同一个值应答所有分支会让每条祖先都凭空翻一倍。
  const getChangeCount = vi.fn<GetChangeCount>(async (_sinceId, _repositoryFilter, queriedBranchId) => {
    if (queriedBranchId !== branchId) return { count: 0, latestChangeId: 0 };
    return options.remoteResult ?? { count: 0, latestChangeId: 0 };
  });
  const remoteAdapter = options.remoteConfigured === false ? undefined : { getChangeCount };
  const getCurrentBranch = vi.fn(async () => ({ id: branchId }));
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
    changeFind,
    getChangeCount,
    getCurrentBranch,
    getLocalRepositories,
    getRemoteRepositories
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getRepositorySyncStatus', () => {
  it('rejects an unregistered entity before opening repositories', async () => {
    const harness = createStatusHarness({ entities: [FullEntity] });

    await expect(getRepositorySyncStatus(harness.rxdb, 'public', 'Missing')).rejects.toThrow(
      'Entity not found: public.Missing'
    );
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.getLocalRepositories).not.toHaveBeenCalled();
  });

  it('returns persisted watermarks and counts both pushable and pullable changes', async () => {
    const lastPushedAt = new Date('2026-02-01T00:00:00.000Z');
    const lastPulledAt = new Date('2026-02-02T00:00:00.000Z');
    const syncRecord = createSyncRecord('StatusFull', {
      id: 'public:StatusFull:feature',
      branchId: 'feature',
      enabled: false,
      lastPushedChangeId: 10,
      lastPushedAt,
      lastPulledAt,
      lastPullRemoteChangeId: 20
    });
    const harness = createStatusHarness({
      entities: [FullEntity],
      branchId: 'feature',
      syncRecords: [syncRecord],
      changes: createChanges(2),
      remoteResult: { count: 3, latestChangeId: 23 }
    });

    await expect(getRepositorySyncStatus(harness.rxdb, 'public', 'StatusFull')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'StatusFull' },
      branchId: 'feature',
      syncType: 'full',
      enabled: false,
      lastPushedChangeId: 10,
      lastPushedAt,
      lastPulledAt,
      lastPullRemoteChangeId: 20,
      pushableCount: 2,
      pullableCount: 3
    });
    expect(harness.syncFind).toHaveBeenCalledTimes(2);
    expect(harness.syncFind).toHaveBeenNthCalledWith(1, {
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'public:StatusFull:feature' }]
      },
      limit: 1
    });
    expect(harness.changeFind).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'namespace', operator: '=', value: 'public' },
          { field: 'entity', operator: '=', value: 'StatusFull' },
          { field: 'branchId', operator: '=', value: 'feature' },
          { field: 'remoteId', operator: '=', value: null },
          { field: 'revertChangeId', operator: '=', value: null },
          { field: 'id', operator: '>', value: 10 }
        ]
      }
    });
    expect(harness.getChangeCount).toHaveBeenCalledWith(20, ['public:StatusFull'], 'feature');
  });

  it('uses default state and an unbounded push query when no sync record exists', async () => {
    const harness = createStatusHarness({
      entities: [FullEntity],
      syncRecords: [],
      changes: [],
      remoteResult: { count: 0, latestChangeId: 0 }
    });

    const status = await getRepositorySyncStatus(harness.rxdb, 'public', 'StatusFull');

    expect(status).toEqual({
      repository: { namespace: 'public', entity: 'StatusFull' },
      branchId: 'main',
      syncType: 'full',
      enabled: true,
      lastPushedChangeId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      lastPullRemoteChangeId: null,
      pushableCount: 0,
      pullableCount: 0
    });
    expect(harness.changeFind.mock.calls[0][0].where?.rules).toEqual([
      { field: 'namespace', operator: '=', value: 'public' },
      { field: 'entity', operator: '=', value: 'StatusFull' },
      { field: 'branchId', operator: '=', value: 'main' },
      { field: 'remoteId', operator: '=', value: null },
      { field: 'revertChangeId', operator: '=', value: null }
    ]);
    expect(harness.getChangeCount).toHaveBeenCalledWith(0, ['public:StatusFull'], 'main');
  });

  it('pulls but never scans local changes for a remote-only entity', async () => {
    const harness = createStatusHarness({
      entities: [RemoteEntity],
      changes: createChanges(5),
      remoteResult: { count: 4, latestChangeId: 9 }
    });

    const status = await getRepositorySyncStatus(harness.rxdb, 'public', 'StatusRemote');

    expect(status.syncType).toBe('remote');
    expect(status.pushableCount).toBe(0);
    expect(status.pullableCount).toBe(4);
    expect(harness.changeFind).not.toHaveBeenCalled();
    expect(harness.getChangeCount).toHaveBeenCalledWith(0, ['public:StatusRemote'], 'main');
  });

  // local-only 的定义是「只在本地、不与远端同步」，因此**没有任何可推之物**：
  // pushableCount 必须是 0，也不该为此白扫一遍本地变更表。
  // 此前这里锁定 pushableCount=3，等于把私有本地数据算作待推送队列。
  it('reports nothing pushable and never opens a remote adapter for a local-only entity', async () => {
    const harness = createStatusHarness({
      entities: [LocalEntity],
      changes: createChanges(3),
      remoteResult: { count: 99, latestChangeId: 99 }
    });

    const status = await getRepositorySyncStatus(harness.rxdb, 'public', 'StatusLocal');

    expect(status.syncType).toBe('local');
    // RXD-029：`enabled` 与能力矩阵同源 —— local 两个方向都不可同步，
    // 报 `true` 等于告诉界面「同步开着呢」，而它永远不会动
    expect(status.enabled).toBe(false);
    expect(status.pushableCount).toBe(0);
    expect(status.pullableCount).toBe(0);
    expect(harness.changeFind).not.toHaveBeenCalled();
    expect(harness.getRemoteRepositories).not.toHaveBeenCalled();
    expect(harness.getChangeCount).not.toHaveBeenCalled();
  });

  it('forces enabled to false and skips both directions for a no-sync entity', async () => {
    const syncRecord = createSyncRecord('StatusNone', { enabled: true });
    const harness = createStatusHarness({
      entities: [NoneEntity],
      syncRecords: [syncRecord],
      changes: createChanges(3),
      remoteResult: { count: 4, latestChangeId: 4 }
    });

    const status = await getRepositorySyncStatus(harness.rxdb, 'public', 'StatusNone');

    expect(status.syncType).toBe('none');
    expect(status.enabled).toBe(false);
    expect(status.pushableCount).toBe(0);
    expect(status.pullableCount).toBe(0);
    expect(harness.changeFind).not.toHaveBeenCalled();
    expect(harness.getRemoteRepositories).not.toHaveBeenCalled();
  });

  it('propagates the error when the remote adapter is unavailable', async () => {
    const harness = createStatusHarness({
      entities: [FullEntity],
      remoteConfigured: false
    });

    await expect(getRepositorySyncStatus(harness.rxdb, 'public', 'StatusFull')).rejects.toThrow(
      'Remote adapter not configured'
    );
  });
});
