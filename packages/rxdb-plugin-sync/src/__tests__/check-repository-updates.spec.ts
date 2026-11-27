import {
  createEntitySyncResolver,
  type EntityMetadata,
  type EntityType,
  type IRepository,
  type RuleGroup,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  type SyncOptions,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { checkRepositoryUpdates } from '../check-repository-updates.js';
import { RemoteBackendMismatchError } from '../remote-backend.js';
import { RxDBSyncBucketProgress } from '../scoped-sync.entity.js';
import { filterFingerprint } from '../scoped-sync.js';
import { noIdentityDeclared } from './fixtures/no-identity-declared.js';
import { METADATA } from './fixtures/private-symbols.js';

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
const FullEntity = createEntityType('CheckFull', FULL_SYNC);

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
  /** 远端此刻报告的身份，缺省 `backend-a` */
  backendId?: string;

  /** 分支 id → 父分支 id，`getAncestorBranchIds` 沿它向上走 */
  branchParents?: Readonly<Record<string, string | null>>;

  /** 分支 id → 该分支上的计数结果；给定时按 `branchId` 逐分支应答，未列出的分支直接报错 */
  remoteResultByBranch?: Readonly<Record<string, RemoteCount>>;

  /** 本库推上去、本地记着的远端 id（`RxDBChange.remoteId`），按游标查到的那些 */
  ownRemoteIds?: readonly number[];
}

function createCheckHarness(options: CheckHarnessOptions) {
  const syncFind = vi.fn<SyncFind>(async () => options.syncRecords ?? []);
  const syncUpdate = vi.fn();
  const syncRepository = { find: syncFind, update: syncUpdate } as unknown as IRepository<typeof RxDBSync>;
  // `getAncestorBranchIds` 沿 parentId 逐级向上查，非 main 分支才会走到这里
  const branchParents = options.branchParents ?? {};
  const branchFind = vi.fn(async (query: QueryOptions): Promise<RxDBBranch[]> => {
    const id = query.where?.rules.find(rule => rule.field === 'id')?.value;
    if (typeof id !== 'string') return [];
    return [{ id, parentId: branchParents[id] ?? null } as RxDBBranch];
  });
  const branchRepository = { find: branchFind } as unknown as IRepository<typeof RxDBBranch>;
  const changeFind = vi.fn(async () => (options.ownRemoteIds ?? []).map(remoteId => ({ remoteId })));
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      if (EntityClass === RxDBBranch) return branchRepository;
      if (EntityClass === RxDBChange) return { find: changeFind };
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
  const backendId = vi.fn(async () => options.backendId ?? 'backend-a');
  const remoteAdapter = options.remoteConfigured === false ? undefined : { getChangeCount, backendId };
  const getCurrentBranch = vi.fn(async () => ({ id: options.branchId ?? 'main' }));
  const getLocalRepositories = vi.fn(async () => ({ adapter: localAdapter }));
  const getRemoteRepositories = vi.fn(async () => ({ adapter: remoteAdapter }));
  const reportError = vi.fn();
  const syncManager = {
    getCurrentBranch,
    getLocalRepositories,
    getRemoteRepositories
  };
  const rxdb = {
    entitySync: createEntitySyncResolver(options.globalSync ?? FULL_SYNC),
    config: {
      entities: options.entities,
      sync: options.globalSync ?? FULL_SYNC
    },
    syncState: { reportError },
    ...noIdentityDeclared,
    syncManager
  } as unknown as RxDB;
  Object.assign(syncManager, { rxdb });

  return {
    rxdb,
    syncFind,
    syncUpdate,
    reportError,
    changeFind,
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

  describe('本库自己推上去的变更（US-233）', () => {
    it('只拉的远端实体没有推上去的变更，不去扫本地变更表', async () => {
      const harness = createCheckHarness({
        entities: [PullEntity],
        syncRecords: [createSyncRecord('CheckPull', 40)],
        remoteResult: { count: 3, latestChangeId: 43 },
        ownRemoteIds: [41]
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toMatchObject({
        pendingCount: 3
      });
      expect(harness.changeFind).not.toHaveBeenCalled();
    });

    it('刷新之后也不算待拉：游标之后的远端变更减去本地记着 remoteId 的那几条', async () => {
      // 远端游标 40 之后有 3 条，其中 41、42 是本库上一次会话推上去的：刷新后 clientId 换了，靠 clientId 认不出来
      const harness = createCheckHarness({
        entities: [FullEntity],
        syncRecords: [createSyncRecord('CheckFull', 40)],
        remoteResult: { count: 3, latestChangeId: 43 },
        ownRemoteIds: [41, 42]
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckFull')).resolves.toMatchObject({
        pendingCount: 1,
        hasUpdates: true
      });
      expect(harness.changeFind).toHaveBeenCalledWith({
        where: {
          combinator: 'and',
          rules: [
            { field: 'namespace', operator: '=', value: 'public' },
            { field: 'entity', operator: '=', value: 'CheckFull' },
            { field: 'branchId', operator: 'in', value: ['main'] },
            { field: 'remoteId', operator: '>', value: 40 }
          ]
        }
      });
    });

    it('压缩推送把几条本地变更记成同一个远端 id：按远端 id 去重再减', async () => {
      const harness = createCheckHarness({
        entities: [FullEntity],
        syncRecords: [createSyncRecord('CheckFull', 40)],
        remoteResult: { count: 2, latestChangeId: 42 },
        ownRemoteIds: [41, 41]
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckFull')).resolves.toMatchObject({
        pendingCount: 1,
        hasUpdates: true
      });
    });

    it('游标之后全是本库推上去的：没有待拉', async () => {
      const harness = createCheckHarness({
        entities: [FullEntity],
        syncRecords: [createSyncRecord('CheckFull', 40)],
        remoteResult: { count: 2, latestChangeId: 42 },
        ownRemoteIds: [41, 42]
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckFull')).resolves.toMatchObject({
        pendingCount: 0,
        hasUpdates: false
      });
    });
  });

  describe('远端身份', () => {
    const boundTo = (remoteBackendId: string | null): RxDBSync =>
      Object.assign(createSyncRecord('CheckPull', 500), { remoteBackendId });

    it('游标属于另一个远端时拒绝去数：拿它数出来的 0 看着可信，其实是拉空', async () => {
      const harness = createCheckHarness({
        entities: [PullEntity],
        syncRecords: [boundTo('backend-old')],
        backendId: 'backend-new'
      });

      const error = await checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull').catch(
        (rejection: unknown) => rejection
      );

      expect(error).toBeInstanceOf(RemoteBackendMismatchError);
      expect(error).toMatchObject({ backendId: 'backend-new', boundBackendIds: ['backend-old'] });
      expect(harness.reportError).toHaveBeenCalledWith(error);
      expect(harness.getChangeCount).not.toHaveBeenCalled();
    });

    it('游标属于当前远端时照常计数', async () => {
      const harness = createCheckHarness({
        entities: [PullEntity],
        syncRecords: [boundTo('backend-a')],
        remoteResult: { count: 2, latestChangeId: 502 }
      });

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull')).resolves.toMatchObject({
        pendingCount: 2,
        hasUpdates: true
      });
      expect(harness.reportError).not.toHaveBeenCalled();
    });

    it('状态查询只比对不绑定：未绑定的旧记录原样留着', async () => {
      const harness = createCheckHarness({ entities: [PullEntity], syncRecords: [boundTo(null)] });

      await checkRepositoryUpdates(harness.rxdb, 'public', 'CheckPull');

      expect(harness.syncUpdate).not.toHaveBeenCalled();
      expect(harness.getChangeCount).toHaveBeenCalled();
    });
  });
});

describe('checkRepositoryUpdates：按区同步的实体', () => {
  const ACTIVE: RuleGroup = { combinator: 'and', rules: [{ field: 'active', operator: '=', value: true }] };
  const BucketedEntity = createEntityType('CheckBucketed', {
    type: SyncType.Filter,
    local: LOCAL_ADAPTER,
    remote: { ...REMOTE_ADAPTER, filter: () => ACTIVE }
  } as SyncOptions);

  /** 一行分区进度；缺省属于替身远端此刻的身份 `backend-a` */
  const progress = (
    fingerprint: string,
    cursor: number,
    bucket = 'public',
    remoteBackendId = 'backend-a'
  ): RxDBSyncBucketProgress =>
    Object.assign(Object.create(RxDBSyncBucketProgress.prototype) as RxDBSyncBucketProgress, {
      namespace: 'public',
      entity: 'CheckBucketed',
      branchId: 'main',
      bucket,
      filterFingerprint: fingerprint,
      cursor,
      snapshotComplete: true,
      remoteBackendId
    });

  const createBucketedHarness = (
    progresses: RxDBSyncBucketProgress[],
    snapshotPoint: number,
    pointsByBucket: Readonly<Record<string, number>> = { public: snapshotPoint },
    countsByBucket: Readonly<Record<string, number>> = {},
    own: { ids: readonly number[]; inBucket: Readonly<Record<string, number>> } = { ids: [], inBucket: {} }
  ) => {
    const repositories = new Map<unknown, unknown>([
      [RxDBSync, { find: vi.fn(async () => []) }],
      [RxDBSyncBucketProgress, { find: vi.fn(async () => progresses) }],
      [RxDBChange, { find: vi.fn(async () => own.ids.map(remoteId => ({ remoteId }))) }]
    ]);
    const localAdapter = { getRepository: vi.fn((EntityClass: unknown) => repositories.get(EntityClass)) };
    const remoteAdapter = {
      backendId: vi.fn(async () => 'backend-a'),
      getChangeCount: vi.fn(),
      getCallerBuckets: vi.fn(async () => Object.keys(pointsByBucket)),
      getEntitySyncInfo: vi.fn(async () => ({ bucketed: true })),
      getBucketSnapshotPoint: vi.fn(
        async (_namespace: string, _entity: string, bucket: string) => pointsByBucket[bucket]
      ),
      // 游标之后的变更条数；给了 id 时只数这些 id 里落在这个区的（US-233）
      getBucketChangeCount: vi.fn(
        async (
          _namespace: string,
          _entity: string,
          bucket: string,
          _afterId: number,
          _branchIds: readonly string[],
          ids?: readonly number[]
        ) => (ids === undefined ? countsByBucket[bucket] : Math.min(own.inBucket[bucket] ?? 0, ids.length))
      )
    };
    const syncManager = {
      getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
      getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
      getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter }))
    };
    const rxdb = {
      entitySync: createEntitySyncResolver(FULL_SYNC),
      config: { entities: [BucketedEntity], sync: FULL_SYNC },
      syncState: { reportError: vi.fn() },
      ...noIdentityDeclared,
      syncManager
    } as unknown as RxDB;
    Object.assign(syncManager, { rxdb });
    return { rxdb, remoteAdapter };
  };

  // 分支深度评审 #6：换了远端，旧远端的进度行因为清理被挡（RxDBBucketCleanupBlockedError）留着。pull() 认得出它属于
  // 别的远端、会从头重拉；状态查询拿它的大游标去比，就会报「已全部同步」
  it('换了远端、旧远端的进度行还留着：只按当前远端的进度算，与 pull() 同口径（没有进度就要补快照）', async () => {
    const current = filterFingerprint(ACTIVE);
    const harness = createBucketedHarness([progress(current, 50, 'public', 'backend-old')], 10);

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckBucketed' },
      remoteLatestChangeId: 10,
      localLastPullRemoteChangeId: null,
      pendingCount: 1,
      hasUpdates: true
    });
  });

  it('同步规则改过、旧指纹的进度还没清：只按 pull() 会用的那份规则的进度算', async () => {
    const current = filterFingerprint(ACTIVE);
    // 旧规则（不带 filter）那份进度停在 3，当前规则的进度已追到水位 10
    const harness = createBucketedHarness([progress('all', 3), progress(current, 10)], 10);

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckBucketed' },
      remoteLatestChangeId: 10,
      localLastPullRemoteChangeId: 10,
      pendingCount: 0,
      hasUpdates: false
    });
    expect(harness.remoteAdapter.getBucketSnapshotPoint).toHaveBeenCalledWith('public', 'CheckBucketed', 'public', [
      'main'
    ]);
    expect(harness.remoteAdapter.getChangeCount).not.toHaveBeenCalled();
  });

  it('一个区拉失败、停在旧游标：别的区游标再大，也照样报有更新，条数按那个区游标之后的真实变更算（US-233）', async () => {
    const current = filterFingerprint(ACTIVE);
    const harness = createBucketedHarness(
      [progress(current, 10, 'public'), progress(current, 3, 'tenant:1')],
      10,
      { public: 10, 'tenant:1': 8 },
      { 'tenant:1': 2 }
    );

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckBucketed' },
      remoteLatestChangeId: 10,
      localLastPullRemoteChangeId: 10,
      // 不是 8 - 3：变更号是全库共用的，两者之差把别的实体、别的区的变更都算了进来
      pendingCount: 2,
      hasUpdates: true
    });
    expect(harness.remoteAdapter.getBucketChangeCount).toHaveBeenCalledTimes(1);
    expect(harness.remoteAdapter.getBucketChangeCount).toHaveBeenCalledWith('public', 'CheckBucketed', 'tenant:1', 3, [
      'main'
    ]);
  });

  it('游标之后只有本库推上去的变更（刷新之后也一样）：不算待拉（US-233）', async () => {
    const current = filterFingerprint(ACTIVE);
    const harness = createBucketedHarness(
      [progress(current, 68)],
      142,
      { public: 142 },
      { public: 2 },
      {
        ids: [70, 71],
        inBucket: { public: 2 }
      }
    );

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'CheckBucketed' },
      remoteLatestChangeId: 142,
      localLastPullRemoteChangeId: 68,
      pendingCount: 0,
      hasUpdates: false
    });
    expect(harness.remoteAdapter.getBucketChangeCount).toHaveBeenLastCalledWith(
      'public',
      'CheckBucketed',
      'public',
      68,
      ['main'],
      [70, 71]
    );
  });

  it('本库推上去的变更分在几个区：每个区只减落在自己区里的那几条（US-233）', async () => {
    const current = filterFingerprint(ACTIVE);
    // 公开区游标 68 之后远端有 3 条；本库推上去的 70、71、72 里只有两条落在公开区
    const harness = createBucketedHarness(
      [progress(current, 68)],
      142,
      { public: 142 },
      { public: 3 },
      {
        ids: [70, 71, 72],
        inBucket: { public: 2 }
      }
    );

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toMatchObject({
      pendingCount: 1,
      hasUpdates: true
    });
  });

  it('本库推上去的远端 id 很多：分批问，每批不超过 100 个，免得请求地址过长', async () => {
    const current = filterFingerprint(ACTIVE);
    const ids = Array.from({ length: 150 }, (_, index) => 1000 + index);
    const harness = createBucketedHarness(
      [progress(current, 999)],
      2000,
      { public: 2000 },
      { public: 150 },
      {
        ids,
        inBucket: { public: 150 }
      }
    );

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toMatchObject({
      pendingCount: 0
    });
    const batches = harness.remoteAdapter.getBucketChangeCount.mock.calls
      .map(call => call[5])
      .filter(batch => batch !== undefined);
    expect(batches.map(batch => batch.length)).toEqual([100, 50]);
  });

  it('当前规则还没有进度：下一次拉取要先补快照，算有更新', async () => {
    const harness = createBucketedHarness([progress('all', 10)], 10);

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toMatchObject({
      localLastPullRemoteChangeId: null,
      pendingCount: 1,
      hasUpdates: true
    });
  });

  // RV-01a21194e68f7aacb5782c196d2ea870：先问可读分区、再逐个问快照点，两次之间分区可能被撤销，
  // 服务端对它报未授权。拉取按分区记失败、其他分区照常，状态查询同口径，不整体抛错
  describe('问快照点时分区已被撤销', () => {
    const notAuthorized = () =>
      Object.assign(new Error('rxdb: bucket is not authorized for the current caller'), { code: '42501' });

    const createRevokingHarness = () => {
      const current = filterFingerprint(ACTIVE);
      return createBucketedHarness([progress(current, 10, 'public'), progress(current, 3, 'tenant:1')], 10, {
        public: 10,
        'tenant:1': 8
      });
    };

    it('重读可读分区确认它已不在：跳过它，其他分区照常计数', async () => {
      const harness = createRevokingHarness();
      harness.remoteAdapter.getCallerBuckets
        .mockResolvedValueOnce(['public', 'tenant:1'])
        .mockResolvedValueOnce(['public']);
      harness.remoteAdapter.getBucketSnapshotPoint.mockImplementation(
        async (_namespace: string, _entity: string, bucket: string) => {
          if (bucket === 'tenant:1') throw notAuthorized();
          return 10;
        }
      );

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).resolves.toEqual({
        repository: { namespace: 'public', entity: 'CheckBucketed' },
        remoteLatestChangeId: 10,
        localLastPullRemoteChangeId: 10,
        pendingCount: 0,
        hasUpdates: false
      });
      expect(harness.remoteAdapter.getCallerBuckets).toHaveBeenCalledTimes(2);
    });

    it('分区仍在可读列表里却失败：原样抛出，不当作撤销吞掉', async () => {
      const harness = createRevokingHarness();
      const failure = new Error('network down');
      harness.remoteAdapter.getBucketSnapshotPoint.mockImplementation(
        async (_namespace: string, _entity: string, bucket: string) => {
          if (bucket === 'tenant:1') throw failure;
          return 10;
        }
      );

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).rejects.toBe(failure);
    });

    it('重读可读分区也失败：确认不了撤销，抛原来那个错误', async () => {
      const harness = createRevokingHarness();
      const failure = notAuthorized();
      harness.remoteAdapter.getCallerBuckets
        .mockResolvedValueOnce(['public', 'tenant:1'])
        .mockRejectedValueOnce(new Error('network down'));
      harness.remoteAdapter.getBucketSnapshotPoint.mockImplementation(
        async (_namespace: string, _entity: string, bucket: string) => {
          if (bucket === 'tenant:1') throw failure;
          return 10;
        }
      );

      await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'CheckBucketed')).rejects.toBe(failure);
    });
  });
});
