import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBBranch } from '../../system/branch.js';
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

interface RemoteCount {
  count: number;
  latestChangeId: number;
}

interface CheckHarnessOptions {
  entities: EntityType[];
  branchId?: string;
  syncRecords?: RxDBSync[];
  remoteResult?: RemoteCount;
  remoteConfigured?: boolean;
  globalSync?: SyncOptions;

  /** 分支 id → 父分支 id，`getAncestorBranchIds` 沿它向上走 */
  branchParents?: Readonly<Record<string, string | null>>;

  /** 分支 id → 该分支上的计数结果；给定时按 `branchId` 逐分支应答，未列出的分支直接报错 */
  remoteResultByBranch?: Readonly<Record<string, RemoteCount>>;
}

function createCheckHarness(options: CheckHarnessOptions) {
  const syncFind = vi.fn<SyncFind>(async () => options.syncRecords ?? []);
  const syncRepository = { find: syncFind } as unknown as IRepository<typeof RxDBSync>;
  // `getAncestorBranchIds` 沿 parentId 逐级向上查，非 main 分支才会走到这里
  const branchParents = options.branchParents ?? {};
  const branchFind = vi.fn(async (query: QueryOptions): Promise<RxDBBranch[]> => {
    const id = query.where?.rules.find(rule => rule.field === 'id')?.value;
    if (typeof id !== 'string') return [];
    return [{ id, parentId: branchParents[id] ?? null } as RxDBBranch];
  });
  const branchRepository = { find: branchFind } as unknown as IRepository<typeof RxDBBranch>;
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      if (EntityClass === RxDBBranch) return branchRepository;
      throw new Error('Unexpected repository request');
    })
  };
  const getChangeCount = vi.fn<GetChangeCount>(async (_sinceId, _repositoryFilter, branchId) => {
    const byBranch = options.remoteResultByBranch;
    if (!byBranch) return options.remoteResult ?? { count: 0, latestChangeId: 0 };

    const found = byBranch[branchId ?? ''];
    // 不给缺失分支兜底成 0：那会把「问错了分支」伪装成「这个分支没有变更」
    if (!found) throw new Error(`Unexpected branch in getChangeCount: ${String(branchId)}`);
    return found;
  });
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

  /**
   * 计数范围必须和 `pullRepository` 的拉取范围一致 —— 都覆盖整条祖先链。
   *
   * `getChangeCount` 的 `branchId` 是精确匹配，只问当前分支时，父分支上的新变更一条都不计入：
   * `hasUpdates` 报 false、界面显示「已全部同步」，而 pull 其实还有东西要拉。
   */
  describe('counts across the ancestor branch chain', () => {
    const featureHarness = (remoteResultByBranch: Record<string, { count: number; latestChangeId: number }>) =>
      createCheckHarness({
        entities: [PullEntity],
        branchId: 'feature',
        branchParents: { feature: 'main', main: null },
        syncRecords: [],
        remoteResultByBranch
      });

    it('reports updates that exist only on the parent branch', async () => {
      const harness = featureHarness({
        feature: { count: 0, latestChangeId: 0 },
        main: { count: 3, latestChangeId: 41 }
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toMatchObject({
        remoteLatestChangeId: 41,
        pendingCount: 3,
        hasUpdates: true
      });
      expect(harness.getChangeCount.mock.calls.map(call => call[2])).toEqual(['feature', 'main']);
    });

    it('sums counts but takes the maximum change id', async () => {
      const harness = featureHarness({
        feature: { count: 2, latestChangeId: 30 },
        main: { count: 3, latestChangeId: 41 }
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toMatchObject({
        // 条数是两条分支之和；latestChangeId 是同一个远端序列上的位置，取 max 而非相加
        remoteLatestChangeId: 41,
        pendingCount: 5,
        hasUpdates: true
      });
    });
  });
});
