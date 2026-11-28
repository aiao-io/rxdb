/**
 * @fileoverview 一轮数清全部仓库的待拉数（US-236）
 *
 * @remarks
 * 远端替身按同一张内存日志回答每一种问法（逐个数、按区数、一次数完）：一次数完的结果必须与逐个数的、
 * 与单仓的 `checkRepositoryUpdates` 一致，往返次数却与仓库数无关。
 */
import {
  createEntitySyncResolver,
  type EntityMetadata,
  type EntityType,
  getEntityMetadata,
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
import { countPendingByRepository } from '../pending-counts.js';
import { RemoteBackendMismatchError } from '../remote-backend.js';
import { RxDBSyncBucketProgress } from '../scoped-sync.entity.js';
import { filterFingerprint, type PendingChangeProbe } from '../scoped-sync.js';
import { noIdentityDeclared } from './fixtures/no-identity-declared.js';
import { METADATA } from './fixtures/private-symbols.js';

interface QueryRule {
  field: string;
  operator: string;
  value: unknown;
}

interface QueryOptions {
  where?: { combinator: 'and' | 'or'; rules: QueryRule[] };
  limit?: number;
}

const LOCAL_ADAPTER = { adapter: 'local' };
const REMOTE_ADAPTER = { adapter: 'remote' };
const FULL_SYNC: SyncOptions = { type: SyncType.Full, local: LOCAL_ADAPTER, remote: REMOTE_ADAPTER };
const REMOTE_SYNC: SyncOptions = { type: SyncType.None, remote: REMOTE_ADAPTER };
const LOCAL_SYNC: SyncOptions = { type: SyncType.None, local: LOCAL_ADAPTER };
const ACTIVE: RuleGroup = { combinator: 'and', rules: [{ field: 'active', operator: '=', value: true }] };
const FILTER_SYNC = {
  type: SyncType.Filter,
  local: LOCAL_ADAPTER,
  remote: { ...REMOTE_ADAPTER, filter: () => ACTIVE }
} as SyncOptions;

function createEntityType(name: string, sync: SyncOptions): EntityType {
  class TestEntity {
    id!: string;
  }
  Object.assign(TestEntity, { [METADATA]: { name, namespace: 'public', sync } as unknown as EntityMetadata });
  return TestEntity;
}

/** 推也拉、未分区 */
const Todo = createEntityType('PendingTodo', FULL_SYNC);
/** 只拉、未分区：本地没有推上去的变更 */
const Feed = createEntityType('PendingFeed', REMOTE_SYNC);
/** 按条件同步、远端登记为分区 */
const Catalog = createEntityType('PendingCatalog', FILTER_SYNC);
/** 只存本地：不数 */
const Draft = createEntityType('PendingDraft', LOCAL_SYNC);

/** 远端日志的一行 */
interface LogRow {
  id: number;
  entity: string;
  bucket: string | null;
  branchId: string;
}

interface Scenario {
  entities: EntityType[];
  records: RxDBSync[];
  progresses: RxDBSyncBucketProgress[];
  /** 本库推上去的变更（推送回执写下的远端 id） */
  own: { namespace: string; entity: string; branchId: string; remoteId: number }[];
  log: LogRow[];
  /** 远端登记为分区的实体 */
  bucketed: string[];
  /** 调用者可读的分区 */
  buckets: string[];
}

const syncRecord = (entity: string, lastPullRemoteChangeId: number): RxDBSync =>
  Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    lastPullRemoteChangeId,
    remoteBackendId: 'backend-a',
    enabled: true
  });

const progress = (bucket: string, cursor: number, snapshotComplete = true): RxDBSyncBucketProgress =>
  Object.assign(Object.create(RxDBSyncBucketProgress.prototype) as RxDBSyncBucketProgress, {
    namespace: 'public',
    entity: 'PendingCatalog',
    branchId: 'main',
    bucket,
    filterFingerprint: filterFingerprint(ACTIVE),
    cursor,
    snapshotComplete,
    remoteBackendId: 'backend-a'
  });

const row = (id: number, entity: string, bucket: string | null = null, branchId = 'main'): LogRow => ({
  id,
  entity,
  bucket,
  branchId
});

/** 未分区、只拉、按区（一个区快照没拉完）与只存本地的仓库混在一起 */
const MIXED: Scenario = {
  entities: [Todo, Feed, Catalog, Draft],
  records: [syncRecord('PendingTodo', 10), syncRecord('PendingFeed', 5)],
  progresses: [progress('public', 19), progress('tenant:t1', 0, false)],
  own: [
    { namespace: 'public', entity: 'PendingTodo', branchId: 'main', remoteId: 12 },
    { namespace: 'public', entity: 'PendingCatalog', branchId: 'main', remoteId: 21 }
  ],
  log: [
    row(11, 'PendingTodo'),
    row(12, 'PendingTodo'),
    row(13, 'PendingTodo'),
    row(6, 'PendingFeed'),
    row(7, 'PendingFeed'),
    // 别的分支：拉取不拉，也不算
    row(9, 'PendingFeed', null, 'feature'),
    // 游标之前
    row(18, 'PendingCatalog', 'public'),
    row(20, 'PendingCatalog', 'public'),
    row(21, 'PendingCatalog', 'public'),
    row(22, 'PendingCatalog', 'tenant:t1')
  ],
  bucketed: ['PendingCatalog'],
  buckets: ['public', 'tenant:t1']
};

/**
 * Todo：游标 10 之后 3 条，减去本库推的 12 → 2；Feed：游标 5 之后 main 上 2 条；
 * Catalog：公开区游标 19 之后 2 条、减去本库推的 21 → 1，租户区快照没拉完算 1 → 2
 */
const MIXED_PENDING = new Map([
  ['public:PendingTodo', 2],
  ['public:PendingFeed', 2],
  ['public:PendingCatalog', 2]
]);

const matches = (item: object, rules: readonly QueryRule[]): boolean =>
  rules.every(rule => {
    const value = Reflect.get(item, rule.field) as unknown;
    if (rule.operator === '=') return value === rule.value;
    if (rule.operator === 'in') return (rule.value as unknown[]).includes(value);
    if (rule.operator === '>') return typeof value === 'number' && value > (rule.value as number);
    throw new Error(`Unexpected operator: ${rule.operator}`);
  });

const localRepository = <T extends object>(rows: readonly T[]) => ({
  find: vi.fn(async (options: QueryOptions) => rows.filter(item => matches(item, options.where?.rules ?? [])))
});

/**
 * 远端问法：`plain` 只有通用日志计数；`one-by-one` 再加按区同步的逐个原语；`batch` 再加一次问完的两个方法
 */
type RemoteMode = 'plain' | 'one-by-one' | 'batch';

interface RoundOverrides {
  /** 远端此刻报告的身份，缺省与同步记录绑的 `backend-a` 相同 */
  backendId?: string;
  remoteConfigured?: boolean;
}

function createRound(scenario: Scenario, mode: RemoteMode, overrides: RoundOverrides = {}) {
  const rowsAfter = (entity: string, bucket: string | null, afterId: number) =>
    scenario.log.filter(item => item.entity === entity && item.bucket === bucket && item.id > afterId);
  const onBranches = (item: LogRow, branchIds: readonly string[]) => branchIds.includes(item.branchId);
  const infoOf = (namespace: string, entity: string) => ({
    namespace,
    entity,
    tableName: null,
    bucketed: scenario.bucketed.includes(entity)
  });

  const plain = {
    backendId: vi.fn(async () => overrides.backendId ?? 'backend-a'),
    getChangeCount: vi.fn(async (sinceId: number, repositoryFilter?: string[], branchId?: string) => {
      const entity = repositoryFilter?.[0]?.split(':')[1] ?? '';
      const rows = rowsAfter(entity, null, sinceId).filter(item => item.branchId === branchId);
      return { count: rows.length, latestChangeId: Math.max(sinceId, ...rows.map(item => item.id)) };
    })
  };
  const scoped = {
    getCallerBuckets: vi.fn(async () => [...scenario.buckets]),
    getEntitySyncInfo: vi.fn(async (namespace: string, entity: string) => infoOf(namespace, entity)),
    getBucketSnapshotPoint: vi.fn(
      async (_namespace: string, entity: string, bucket: string, branchIds: readonly string[] = []) =>
        Math.max(
          0,
          ...rowsAfter(entity, bucket, 0)
            .filter(item => onBranches(item, branchIds))
            .map(item => item.id)
        )
    ),
    getBucketChangeCount: vi.fn(
      async (
        _namespace: string,
        entity: string,
        bucket: string,
        afterId: number,
        branchIds: readonly string[],
        ids?: readonly number[]
      ) =>
        rowsAfter(entity, bucket, afterId).filter(
          item => onBranches(item, branchIds) && (ids === undefined || ids.includes(item.id))
        ).length
    )
  };
  const batch = {
    getEntitySyncInfos: vi.fn(async (entities: readonly { namespace: string; entity: string }[]) =>
      entities.map(({ namespace, entity }) => infoOf(namespace, entity))
    ),
    countPendingChanges: vi.fn(async (probes: readonly PendingChangeProbe[], branchIds: readonly string[]) =>
      probes.map(
        probe =>
          rowsAfter(probe.entity, probe.bucket, probe.afterId).filter(
            item => onBranches(item, branchIds) && !probe.excludeIds.includes(item.id)
          ).length
      )
    )
  };
  const adapters: Record<RemoteMode, object> = {
    plain,
    'one-by-one': { ...plain, ...scoped },
    batch: { ...plain, ...scoped, ...batch }
  };

  const repositories = new Map<unknown, unknown>([
    [RxDBSync, localRepository(scenario.records)],
    [RxDBSyncBucketProgress, localRepository(scenario.progresses)],
    [RxDBChange, localRepository(scenario.own)],
    [RxDBBranch, localRepository([])]
  ]);
  const localAdapter = { getRepository: vi.fn((EntityClass: unknown) => repositories.get(EntityClass)) };
  const syncManager = {
    getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getRemoteRepositories: vi.fn(async () => ({
      adapter: overrides.remoteConfigured === false ? undefined : adapters[mode]
    }))
  };
  const reportError = vi.fn();
  const rxdb = {
    entitySync: createEntitySyncResolver(FULL_SYNC),
    config: { entities: scenario.entities, sync: FULL_SYNC },
    syncState: { reportError },
    ...noIdentityDeclared,
    syncManager
  } as unknown as RxDB;
  Object.assign(syncManager, { rxdb });

  return {
    rxdb,
    metadatas: scenario.entities.map(EntityType => getEntityMetadata(EntityType)),
    remote: { ...plain, ...scoped, ...batch },
    syncManager,
    reportError
  };
}

describe('countPendingByRepository（US-236）', () => {
  it('适配器能一次数完：一轮只核一次远端身份、问一次登记信息与可读分区、数一次', async () => {
    const round = createRound(MIXED, 'batch');

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(MIXED_PENDING);

    expect(round.remote.backendId).toHaveBeenCalledOnce();
    expect(round.remote.getCallerBuckets).toHaveBeenCalledOnce();
    expect(round.remote.getEntitySyncInfos).toHaveBeenCalledOnce();
    // 只问能拉取的：只存本地的 Draft 不问
    expect(round.remote.getEntitySyncInfos).toHaveBeenCalledWith([
      { namespace: 'public', entity: 'PendingTodo' },
      { namespace: 'public', entity: 'PendingFeed' },
      { namespace: 'public', entity: 'PendingCatalog' }
    ]);
    expect(round.remote.countPendingChanges).toHaveBeenCalledOnce();
    expect(round.remote.countPendingChanges).toHaveBeenCalledWith(
      [
        { namespace: 'public', entity: 'PendingTodo', bucket: null, afterId: 10, excludeIds: [12] },
        { namespace: 'public', entity: 'PendingFeed', bucket: null, afterId: 5, excludeIds: [] },
        // 租户区快照没拉完：不用问远端就知道要补快照，算 1
        { namespace: 'public', entity: 'PendingCatalog', bucket: 'public', afterId: 19, excludeIds: [21] }
      ],
      ['main']
    );
    for (const single of [
      round.remote.getEntitySyncInfo,
      round.remote.getChangeCount,
      round.remote.getBucketChangeCount,
      round.remote.getBucketSnapshotPoint
    ]) {
      expect(single).not.toHaveBeenCalled();
    }
  });

  it('适配器只会逐个数：结果相同，身份与可读分区照样一轮只问一次', async () => {
    const round = createRound(MIXED, 'one-by-one');

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(MIXED_PENDING);

    expect(round.remote.backendId).toHaveBeenCalledOnce();
    expect(round.remote.getCallerBuckets).toHaveBeenCalledOnce();
    expect(round.remote.getEntitySyncInfo).toHaveBeenCalledTimes(3);
    expect(round.remote.getChangeCount).toHaveBeenCalledTimes(2);
    // 分区：先数游标之后的，再按本库推上去的 id 数落在这个区的有几条
    expect(round.remote.getBucketChangeCount.mock.calls).toEqual([
      ['public', 'PendingCatalog', 'public', 19, ['main']],
      ['public', 'PendingCatalog', 'public', 19, ['main'], [21]]
    ]);
    expect(round.remote.getBucketSnapshotPoint).not.toHaveBeenCalled();
  });

  it('远端不支持按区同步：不问登记信息与可读分区，全部按未分区日志数', async () => {
    const round = createRound({ ...MIXED, entities: [Todo, Feed, Draft] }, 'plain');

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(
      new Map([
        ['public:PendingTodo', 2],
        ['public:PendingFeed', 2]
      ])
    );
    expect(round.remote.getCallerBuckets).not.toHaveBeenCalled();
    expect(round.remote.getEntitySyncInfo).not.toHaveBeenCalled();
    expect(round.remote.getEntitySyncInfos).not.toHaveBeenCalled();
  });

  it.each(['batch', 'one-by-one'] as const)('与单仓的 checkRepositoryUpdates 同口径（%s）', async mode => {
    const round = createRound(MIXED, mode);

    const counts = await countPendingByRepository(round.rxdb, round.metadatas);

    for (const entity of ['PendingTodo', 'PendingFeed', 'PendingCatalog']) {
      const single = await checkRepositoryUpdates(round.rxdb, 'public', entity);
      expect(counts.get(`public:${entity}`)).toBe(single.pendingCount);
    }
  });

  it('没有能拉取的仓库：一个远端请求都不发', async () => {
    const round = createRound({ ...MIXED, entities: [Draft] }, 'batch');

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(new Map());

    expect(round.syncManager.getRemoteRepositories).not.toHaveBeenCalled();
    expect(round.remote.backendId).not.toHaveBeenCalled();
  });

  it('游标属于另一个远端：这一轮拒绝去数，错误写进同步状态', async () => {
    const round = createRound(MIXED, 'batch', { backendId: 'backend-new' });

    const error = await countPendingByRepository(round.rxdb, round.metadatas).catch((rejection: unknown) => rejection);

    expect(error).toBeInstanceOf(RemoteBackendMismatchError);
    expect(round.reportError).toHaveBeenCalledWith(error);
    expect(round.remote.countPendingChanges).not.toHaveBeenCalled();
  });

  it('有能拉取的仓库却没配远端：报错', async () => {
    const round = createRound(MIXED, 'batch', { remoteConfigured: false });

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).rejects.toThrow(
      'Remote adapter not configured'
    );
  });

  it('分区实体每个区都还没拉完快照：各算 1，不用问远端去数', async () => {
    const round = createRound({ ...MIXED, entities: [Catalog], progresses: [] }, 'batch');

    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(
      new Map([['public:PendingCatalog', 2]])
    );
    expect(round.remote.countPendingChanges).not.toHaveBeenCalled();
  });

  // RV-01a21194e68f7aacb5782c196d2ea870：先问可读分区、再逐个数，两次之间分区可能被撤销；与单仓同口径，确认它已不在才按 0 算
  it('逐个数时分区已被撤销：重读可读分区确认它已不在，按 0 算', async () => {
    const round = createRound({ ...MIXED, entities: [Catalog] }, 'one-by-one');
    round.remote.getCallerBuckets.mockResolvedValueOnce(['public', 'tenant:t1']).mockResolvedValueOnce(['tenant:t1']);
    round.remote.getBucketChangeCount.mockRejectedValueOnce(
      Object.assign(new Error('rxdb: bucket is not authorized for the current caller'), { code: '42501' })
    );

    // 公开区被撤销按 0 算；租户区快照没拉完仍算 1
    await expect(countPendingByRepository(round.rxdb, round.metadatas)).resolves.toEqual(
      new Map([['public:PendingCatalog', 1]])
    );
    expect(round.remote.getCallerBuckets).toHaveBeenCalledTimes(2);
  });

  it('逐个数时最多同时问 4 个，不把几十个仓库一齐压到远端', async () => {
    const entities = Array.from({ length: 10 }, (_, index) => createEntityType(`PendingMany${index}`, REMOTE_SYNC));
    const round = createRound({ ...MIXED, entities, records: [], own: [] }, 'plain');
    let inFlight = 0;
    let peak = 0;
    round.remote.getChangeCount.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 0));
      inFlight--;
      return { count: 1, latestChangeId: 1 };
    });

    const counts = await countPendingByRepository(round.rxdb, round.metadatas);

    expect([...counts.values()]).toEqual(Array.from({ length: 10 }, () => 1));
    expect(round.remote.getChangeCount).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
  });

  // 评审 F6：远端日志删掉了本库推上去的一条、只剩别人的一条。盲减本库推上去的 id 个数会抵掉别人的那一条，
  // 单仓报「已全部同步」而一次数完报 1；两个入口都要按远端实际存在的 id 排除
  it('远端日志删掉了本库推上去的那条：单仓与一次数完都数出别人的那一条', async () => {
    const trimmed: Scenario = {
      ...MIXED,
      entities: [Todo],
      records: [syncRecord('PendingTodo', 10)],
      own: [{ namespace: 'public', entity: 'PendingTodo', branchId: 'main', remoteId: 12 }],
      log: [row(11, 'PendingTodo')]
    };
    const round = createRound(trimmed, 'batch');

    const counts = await countPendingByRepository(round.rxdb, round.metadatas);
    const single = await checkRepositoryUpdates(round.rxdb, 'public', 'PendingTodo');

    expect(counts.get('public:PendingTodo')).toBe(1);
    expect(single).toMatchObject({ pendingCount: 1, hasUpdates: true, remoteLatestChangeId: 11 });
    expect(round.remote.countPendingChanges).toHaveBeenLastCalledWith(
      [{ namespace: 'public', entity: 'PendingTodo', bucket: null, afterId: 10, excludeIds: [12] }],
      ['main']
    );
  });
});
