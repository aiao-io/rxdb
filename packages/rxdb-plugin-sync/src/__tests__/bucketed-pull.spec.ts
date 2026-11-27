import {
  Entity,
  EntityBase,
  getRxDBChangeKey,
  getRxDBEntityIdentityKey,
  parseRxDBChangeKey,
  PropertyType,
  RelationKind,
  RxDBChange,
  RxDBSync,
  WorktreeTableSet,
  type EntityType,
  type RemoteChange,
  type RuleGroup,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBBucketCleanupBlockedError } from '../bucket-cleanup-blocked-error.js';
import { pullBucketedRepositoryIfSupported } from '../bucketed-pull.js';
import { RemoteBackendMismatchError } from '../remote-backend.js';
import { RxDBSyncBucketProgress, RxDBSyncBucketRow } from '../scoped-sync.entity.js';
import type { SyncManager } from '../SyncManager.js';

@Entity({
  name: 'BucketPullItem',
  properties: [
    { name: 'value', type: PropertyType.string },
    { name: 'active', type: PropertyType.boolean }
  ]
})
class BucketPullItem extends EntityBase {
  value!: string;
  active!: boolean;
}

/** 引用分区实体的本地行：非空多对一，默认 `ON DELETE RESTRICT`，被引用的行删不掉 */
@Entity({
  name: 'BucketPullChild',
  properties: [{ name: 'note', type: PropertyType.string }],
  relations: [
    { name: 'item', kind: RelationKind.MANY_TO_ONE, mappedEntity: 'BucketPullItem', mappedProperty: 'children' }
  ]
})
class BucketPullChild extends EntityBase {
  note!: string;
  itemId!: string;
}

interface QueryRule {
  field: string;
  operator: string;
  value?: unknown;
}

interface QueryOptions {
  where?: { rules?: QueryRule[] };
  orderBy?: { field: string; sort: 'asc' | 'desc' }[];
}

interface HarnessOptions {
  buckets: string[];
  snapshotRows: Record<string, Record<string, unknown>[]>;
  changes: Record<string, RemoteChange[]>;
  snapshotPoint?: number;
  localChanges?: RxDBChange[];
  entities?: Record<string, unknown>[];
}

interface BucketHarness {
  sm: SyncManager;
  adapter: {
    getCallerBuckets: ReturnType<typeof vi.fn>;
    getEntitySyncInfo: ReturnType<typeof vi.fn>;
    getBucketSnapshotPoint: ReturnType<typeof vi.fn>;
    getBucketChangeCount: ReturnType<typeof vi.fn>;
    pullBucketSnapshot: ReturnType<typeof vi.fn>;
    pullBucketChanges: ReturnType<typeof vi.fn>;
  };
  repoSync: RxDBSync;
  progress: RxDBSyncBucketProgress[];
  mappings: RxDBSyncBucketRow[];
  entities: Record<string, unknown>[];
  /** 引用分区行的本地行（{@link BucketPullChild}） */
  children: Record<string, unknown>[];
  changes: RxDBChange[];
  localAdapter: {
    executor: { tableSet: WorktreeTableSet };
  };
}

const identityKey = (value: unknown): string => String(value);

const createSyncRecord = (): RxDBSync =>
  Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, {
    id: 'public:BucketPullItem:main',
    namespace: 'public',
    entity: 'BucketPullItem',
    branchId: 'main',
    syncType: 'filter',
    lastPushedChangeId: null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastPullRemoteChangeId: null,
    remoteBackendId: 'backend-test',
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });

const createChange = (
  id: number,
  entityId: string,
  type: RemoteChange['type'],
  patch: Record<string, unknown> | null,
  beforeData?: Record<string, unknown> | null,
  afterData?: Record<string, unknown> | null,
  bucket = 'public'
): RemoteChange =>
  ({
    id,
    namespace: 'public',
    entity: 'BucketPullItem',
    entityId,
    branchId: 'main',
    type,
    patch,
    inversePatch: type === 'INSERT' ? null : { value: 'old' },
    beforeData,
    afterData,
    bucket,
    createdAt: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`),
    updatedAt: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`)
  }) as RemoteChange;

/** 与参考 SQL 的 rxdb_pull_bucket_snapshot 同语义：按 id 升序，从上一页最后一个 id 之后接着取 */
const snapshotPage = (
  rows: Record<string, unknown>[],
  afterId: string | null,
  limit: number
): Record<string, unknown>[] =>
  [...rows]
    .sort((left, right) => String(left['id']).localeCompare(String(right['id'])))
    .filter(item => afterId === null || String(item['id']) > afterId)
    .slice(0, limit);

const createHarness = (options: HarnessOptions): BucketHarness => {
  const repoSync = createSyncRecord();
  const progress: RxDBSyncBucketProgress[] = [];
  const mappings: RxDBSyncBucketRow[] = [];
  const changes = [...(options.localChanges ?? [])];
  const entities = [...(options.entities ?? [])];
  const children: Record<string, unknown>[] = [];
  const allRows = (EntityType: unknown): unknown[] => {
    if (EntityType === RxDBSyncBucketProgress) return progress;
    if (EntityType === RxDBSyncBucketRow) return mappings;
    if (EntityType === RxDBChange) return changes;
    if (EntityType === RxDBSync) return [repoSync];
    if (EntityType === BucketPullItem) return entities;
    if (EntityType === BucketPullChild) return children;
    throw new Error('Unexpected repository request');
  };

  const matches = (row: unknown, rule: QueryRule): boolean => {
    const actual = Reflect.get(row as object, rule.field);
    if (rule.operator === '=') return actual === rule.value;
    if (rule.operator === '>') return typeof actual === 'number' && actual > Number(rule.value);
    if (rule.operator === 'in') {
      const values = Array.isArray(rule.value) ? rule.value : [];
      return values.some(value => value === actual || String(value) === String(actual));
    }
    throw new Error(`Unsupported test operator ${rule.operator}`);
  };

  const repositoryFor = (EntityType: unknown) => {
    const rows = allRows(EntityType);
    return {
      find: vi.fn(async (options: unknown) => {
        const query = (options ?? {}) as QueryOptions;
        const rules = query.where?.rules ?? [];
        const result = rows.filter(row => rules.every(rule => matches(row, rule)));
        for (const order of query.orderBy ?? []) {
          result.sort((left, right) => {
            const leftValue = Reflect.get(left as object, order.field);
            const rightValue = Reflect.get(right as object, order.field);
            const compared = String(leftValue).localeCompare(String(rightValue));
            return order.sort === 'asc' ? compared : -compared;
          });
        }
        return result;
      }),
      create: vi.fn(async (row: unknown) => {
        rows.push(row);
        return row;
      }),
      update: vi.fn(async (row: unknown, patch: Record<string, unknown>) => {
        Object.assign(row as object, patch);
        return row;
      }),
      remove: vi.fn(async (row: unknown) => {
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
        return row;
      })
    };
  };

  const repositories = new Map<unknown, ReturnType<typeof repositoryFor>>();
  const getRepository = (EntityType: unknown) => {
    const existing = repositories.get(EntityType);
    if (existing) return existing;
    const repository = repositoryFor(EntityType);
    repositories.set(EntityType, repository);
    return repository;
  };

  const mergeChanges = vi.fn(async (actions: SwitchVersionActions) => {
    const apply = (key: string, patch: Record<string, unknown> | null, operation: 'upsert' | 'delete') => {
      const [, , entityId] = parseRxDBChangeKey(key);
      const index = entities.findIndex(entity => identityKey(entity['id']) === identityKey(entityId));
      if (operation === 'delete') {
        // 与真实本地库一致：被 RESTRICT 外键引用的行删不掉，整个事务失败
        if (children.some(child => identityKey(child['itemId']) === identityKey(entityId))) {
          throw new Error('FOREIGN KEY constraint failed');
        }
        if (index >= 0) entities.splice(index, 1);
        return;
      }
      if (!patch) return;
      if (index >= 0) Object.assign(entities[index], patch);
      else entities.push({ ...patch });
    };
    for (const [key, action] of actions.inserts) apply(key, action.patch, 'upsert');
    for (const [key, action] of actions.updates) apply(key, action.patch, 'upsert');
    for (const [key] of actions.deletes) apply(key, null, 'delete');
  });

  const executor = { tableSet: WorktreeTableSet.MAIN, getRepository, mergeChanges };
  const localAdapter = {
    getRepository,
    executor,
    transaction: vi.fn(async (callback: (executor: unknown) => Promise<unknown>) => callback(executor))
  };

  const adapter = {
    getCallerBuckets: vi.fn(async () => options.buckets),
    getEntitySyncInfo: vi.fn(async () => ({
      namespace: 'public',
      entity: 'BucketPullItem',
      tableName: 'bucket_pull_item',
      bucketed: true
    })),
    getBucketSnapshotPoint: vi.fn(async () => options.snapshotPoint ?? 1),
    getBucketChangeCount: vi.fn(async () => 0),
    pullBucketSnapshot: vi.fn(
      async (
        _namespace: string,
        _entity: string,
        bucket: string,
        filter: RuleGroup | undefined,
        afterId: string | null,
        limit: number
      ) => {
        const rows = options.snapshotRows[bucket] ?? [];
        const filtered = filter ? rows.filter(row => matchesFilter(row, filter)) : rows;
        return snapshotPage(filtered, afterId, limit);
      }
    ),
    pullBucketChanges: vi.fn(
      async (sinceId: number, limit: number, _namespace: string, _entity: string, bucket: string) =>
        (options.changes[bucket] ?? []).filter(change => change.id > sinceId).slice(0, limit)
    )
  };

  const sm = {
    rxdb: {
      config: { entities: [BucketPullItem, BucketPullChild] },
      context: { clientId: 'client-test' },
      entityManager: {
        instantiate: (EntityType: EntityType) => Object.create(EntityType.prototype) as InstanceType<EntityType>
      },
      dispatchEvent: vi.fn()
    },
    remoteBackendId: 'backend-test',
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    verifyRemoteBackend: vi.fn(async () => undefined)
  } as unknown as SyncManager;

  return { sm, adapter, repoSync, progress, mappings, entities, children, changes, localAdapter };
};

const matchesFilter = (row: Record<string, unknown>, filter: RuleGroup): boolean => {
  if (filter.rules.length === 0) return filter.combinator === 'and';
  const results = filter.rules.map(rule => {
    if ('rules' in rule) return matchesFilter(row, rule);
    if (!('value' in rule)) return false;
    const actual = row[rule.field];
    if (rule.operator === '=') return actual === rule.value;
    if (rule.operator === '!=') return actual !== rule.value;
    return false;
  });
  return filter.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
};

const pull = (harness: BucketHarness, filter?: RuleGroup, limit = 2, fetchAll = true) =>
  pullBucketedRepositoryIfSupported(
    harness.sm,
    harness.adapter as never,
    harness.localAdapter as never,
    BucketPullItem,
    harness.repoSync,
    'public',
    'BucketPullItem',
    'main',
    { limit, fetchAll, includeRelated: false },
    filter
  );

const activeFilter: RuleGroup = {
  combinator: 'and',
  rules: [{ field: 'active', operator: '=', value: true }]
};

const row = (id: string, active = true): Record<string, unknown> => ({ id, value: `value-${id}`, active });

describe('bucketed pull', () => {
  it('先分页快照，再从快照点继续拉增量', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('one'), row('two')] },
      changes: {
        public: [createChange(3, 'one', 'UPDATE', { value: 'updated' }, row('one'), row('one'))]
      },
      snapshotPoint: 2
    });

    const result = await pull(harness, undefined, 1);

    expect(result).toMatchObject({ pulled: 3, applied: 3, hasMore: false });
    expect(harness.adapter.pullBucketSnapshot.mock.calls.map(call => call[4])).toEqual([null, 'one', 'two']);
    expect(harness.adapter.pullBucketChanges.mock.calls.map(call => call[0])).toEqual([2, 3]);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['one', 'two']);
    expect(harness.entities.find(item => item['id'] === 'one')?.['value']).toBe('updated');
    expect(harness.progress[0]).toMatchObject({ snapshotComplete: true, snapshotAfterId: 'two', cursor: 3 });
  });

  // RV-01a21194e6b6742e98c9d90c0a3e6270：快照与增量同口径受 fetchAll 约束，默认只拉一页并以 hasMore 告知
  it('没要 fetchAll 时快照一页一停：进度落库、报 hasMore，下一次从上一页最后一个 id 接着拉，快照拉完才拉增量', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('a'), row('b'), row('c')] },
      changes: {
        public: [createChange(2, 'a', 'UPDATE', { value: 'updated' }, row('a'), row('a'))]
      },
      snapshotPoint: 1
    });

    const first = await pull(harness, undefined, 2, false);

    expect(first).toMatchObject({ pulled: 2, applied: 2, hasMore: true });
    expect(harness.adapter.pullBucketSnapshot.mock.calls.map(call => call[4])).toEqual([null]);
    expect(harness.adapter.pullBucketChanges).not.toHaveBeenCalled();
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['a', 'b']);
    expect(harness.progress[0]).toMatchObject({ snapshotComplete: false, snapshotAfterId: 'b', cursor: 0 });

    const second = await pull(harness, undefined, 2, false);

    expect(second).toMatchObject({ pulled: 2, applied: 2, hasMore: false });
    expect(harness.adapter.pullBucketSnapshot.mock.calls.map(call => call[4])).toEqual([null, 'b']);
    expect(harness.adapter.pullBucketChanges.mock.calls.map(call => call[0])).toEqual([1]);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['a', 'b', 'c']);
    expect(harness.entities.find(item => item['id'] === 'a')?.['value']).toBe('updated');
    expect(harness.progress[0]).toMatchObject({ snapshotComplete: true, snapshotAfterId: 'c', cursor: 2 });
  });

  it('加入新分区并清理退出分区的本地行', async () => {
    const harness = createHarness({
      buckets: ['public', 'tenant:1'],
      snapshotRows: { public: [row('public')], 'tenant:1': [row('tenant-1')] },
      changes: {},
      snapshotPoint: 1
    });
    await pull(harness);

    harness.adapter.getCallerBuckets.mockResolvedValue(['public', 'tenant:2']);
    const snapshots = harness.adapter.pullBucketSnapshot;
    snapshots.mockImplementation(
      async (
        _namespace: string,
        _entity: string,
        bucket: string,
        _filter: RuleGroup | undefined,
        afterId: string | null,
        limit: number
      ) => {
        const rows: Record<string, Record<string, unknown>[]> = {
          public: [row('public')],
          'tenant:2': [row('tenant-2')]
        };
        return snapshotPage(rows[bucket] ?? [], afterId, limit);
      }
    );
    await pull(harness);

    expect(harness.entities.map(item => item['id']).sort()).toEqual(['public', 'tenant-2']);
    expect(harness.progress.map(item => item.bucket).sort()).toEqual(['public', 'tenant:2']);
  });

  it('条件放宽补齐历史范围，收窄后删除旧范围行', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('active', true), row('inactive', false)] },
      changes: {},
      snapshotPoint: 1
    });
    await pull(harness, activeFilter);
    expect(harness.entities.map(item => item['id'])).toEqual(['active']);

    await pull(harness);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['active', 'inactive']);

    await pull(harness, activeFilter);
    expect(harness.entities.map(item => item['id'])).toEqual(['active']);
  });

  it('行换区通过旧区移除和新区写入完成迁移', async () => {
    const harness = createHarness({
      buckets: ['public', 'tenant:1'],
      snapshotRows: { public: [row('moved')], 'tenant:1': [] },
      changes: {},
      snapshotPoint: 1
    });
    await pull(harness);

    harness.adapter.pullBucketChanges.mockImplementation(
      async (sinceId: number, limit: number, _namespace: string, _entity: string, bucket: string) => {
        const movedDelete = createChange(2, 'moved', 'DELETE', null, null, null, 'public');
        const movedInsert = createChange(
          3,
          'moved',
          'INSERT',
          row('moved', true),
          null,
          row('moved', true),
          'tenant:1'
        );
        return (bucket === 'public' ? [movedDelete] : [movedInsert])
          .filter(change => change.id > sinceId)
          .slice(0, limit);
      }
    );

    await pull(harness);

    expect(harness.entities).toEqual([row('moved', true)]);
    expect(harness.mappings.map(item => item.bucket)).toEqual(['tenant:1']);
  });

  it('实体规则变化导致的离开条件会自动删除', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('item', true)] },
      changes: {
        public: [createChange(2, 'item', 'UPDATE', { active: false }, row('item', true), row('item', false))]
      },
      snapshotPoint: 1
    });
    await pull(harness, activeFilter);
    await pull(harness, activeFilter);

    expect(harness.entities).toEqual([]);
  });

  it('存在未推送本地变更时跳过远端删除', async () => {
    const localChange = Object.assign(Object.create(RxDBChange.prototype) as RxDBChange, {
      id: 1,
      namespace: 'public',
      entity: 'BucketPullItem',
      entityId: 'item',
      branchId: 'main',
      type: 'UPDATE',
      patch: { value: 'local' },
      inversePatch: { value: 'value-item' },
      remoteId: null,
      rejectedAt: null,
      revertChangeId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('item')] },
      changes: { public: [createChange(2, 'item', 'DELETE', null, null, null)] },
      snapshotPoint: 1,
      localChanges: [localChange],
      entities: [{ ...row('item'), value: 'local' }]
    });
    await pull(harness);
    await pull(harness);

    expect(harness.entities).toEqual([{ ...row('item'), value: 'local' }]);
    expect(getRxDBChangeKey(localChange)).toContain('BucketPullItem');
  });

  it('一个分区失败时其他分区继续推进，失败分区下次可续拉', async () => {
    const harness = createHarness({
      buckets: ['broken', 'healthy'],
      snapshotRows: { broken: [row('broken')], healthy: [row('healthy')] },
      changes: {},
      snapshotPoint: 1
    });
    const healthyRows = [row('healthy')];
    harness.adapter.pullBucketSnapshot.mockImplementation(
      async (_namespace, _entity, bucket, _filter, afterId, limit) => {
        if (bucket === 'broken') throw new Error('broken bucket');
        return snapshotPage(healthyRows, afterId, limit);
      }
    );

    const failed = await pull(harness);
    expect(failed?.failures).toHaveLength(1);
    expect(harness.entities).toEqual([row('healthy')]);

    harness.adapter.pullBucketSnapshot.mockImplementation(
      async (_namespace, _entity, bucket, _filter, afterId, limit) =>
        snapshotPage(bucket === 'broken' ? [row('broken')] : [row('healthy')], afterId, limit)
    );
    const recovered = await pull(harness);
    expect(recovered?.failures).toHaveLength(0);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['broken', 'healthy']);
  });
  it('快照翻页之间远端删掉已读的行：下一页从上一页最后一个 id 接着读，幸存行一行不少', async () => {
    const remoteRows = [row('a'), row('b'), row('c')];
    const harness = createHarness({ buckets: ['public'], snapshotRows: {}, changes: {}, snapshotPoint: 1 });
    harness.adapter.pullBucketSnapshot.mockImplementation(
      async (_namespace, _entity, _bucket, _filter, afterId: string | null, limit: number) => {
        const page = snapshotPage(remoteRows, afterId, limit);
        // 第一页读完之后，另一台设备删掉了已经读过的 a
        if (afterId === null) remoteRows.splice(0, 1);
        return page;
      }
    );

    await pull(harness, undefined, 1);

    expect(harness.adapter.pullBucketSnapshot.mock.calls.map(call => call[4])).toEqual([null, 'a', 'b', 'c']);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['a', 'b', 'c']);
  });

  it('快照点与拉取同口径：只算当前分支及其祖先', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('one')] },
      changes: {},
      snapshotPoint: 1
    });

    await pull(harness);

    expect(harness.adapter.getBucketSnapshotPoint).toHaveBeenCalledWith('public', 'BucketPullItem', 'public', ['main']);
  });

  it('退出分区时保留还没推送的离线编辑', async () => {
    const harness = createHarness({
      buckets: ['public', 'tenant:1'],
      snapshotRows: { public: [row('public')], 'tenant:1': [row('tenant-1')] },
      changes: {},
      snapshotPoint: 1
    });
    await pull(harness);
    harness.changes.push(
      Object.assign(Object.create(RxDBChange.prototype) as RxDBChange, {
        id: 1,
        namespace: 'public',
        entity: 'BucketPullItem',
        entityId: 'tenant-1',
        branchId: 'main',
        type: 'UPDATE',
        patch: { value: 'offline' },
        inversePatch: { value: 'value-tenant-1' },
        remoteId: null,
        rejectedAt: null,
        revertChangeId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    );

    harness.adapter.getCallerBuckets.mockResolvedValue(['public']);
    await pull(harness);

    expect(harness.entities.map(item => item['id']).sort()).toEqual(['public', 'tenant-1']);
    expect(harness.progress.map(item => item.bucket)).toEqual(['public']);
  });

  it('行换进先处理的已授权分区：后处理的旧分区的 DELETE 不删本地行', async () => {
    const harness = createHarness({
      buckets: ['public', 'tenant:1'],
      snapshotRows: { public: [], 'tenant:1': [row('moved')] },
      changes: {},
      snapshotPoint: 1
    });
    await pull(harness);

    harness.adapter.pullBucketChanges.mockImplementation(
      async (sinceId: number, limit: number, _namespace: string, _entity: string, bucket: string) => {
        const movedDelete = createChange(2, 'moved', 'DELETE', null, null, null, 'tenant:1');
        const movedInsert = createChange(3, 'moved', 'INSERT', row('moved'), null, row('moved'), 'public');
        return (bucket === 'tenant:1' ? [movedDelete] : [movedInsert])
          .filter(change => change.id > sinceId)
          .slice(0, limit);
      }
    );
    await pull(harness);

    expect(harness.entities).toEqual([row('moved')]);
    expect(harness.mappings.map(item => item.bucket)).toEqual(['public']);
  });

  it('拉取途中换挂到可写检出位：落库事务一行都不写，分区记为失败', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('one')] },
      changes: {},
      snapshotPoint: 1
    });
    harness.localAdapter.executor.tableSet = WorktreeTableSet.of('wt_a1', []);

    const result = await pull(harness);

    expect(result?.failures.map(failure => failure.error.message)).toEqual([
      expect.stringContaining('同步只在主检出位上跑')
    ]);
    expect(harness.entities).toEqual([]);
    expect(harness.mappings).toEqual([]);
  });
  it('快照翻到第二页时远端换了身份：这一页不落库，已落库的页连同进度一起清掉，分区记为失败', async () => {
    const harness = createHarness({
      buckets: ['public'],
      snapshotRows: { public: [row('a'), row('b'), row('c')] },
      changes: {},
      snapshotPoint: 1
    });
    const mismatch = new RemoteBackendMismatchError('backend-rebuilt', ['backend-test']);
    // 入口、快照点之后、第一页之后各核对一次，第二页之后对不上
    vi.mocked(harness.sm.verifyRemoteBackend)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(mismatch);

    const result = await pull(harness, undefined, 1);

    expect(result?.failures.map(failure => failure.error)).toEqual([mismatch]);
    expect(harness.adapter.pullBucketSnapshot).toHaveBeenCalledTimes(2);
    expect(harness.entities).toEqual([]);
    expect(harness.mappings).toEqual([]);
    expect(harness.progress).toEqual([]);
  });

  // 评审 M1：多对一非空外键默认 ON DELETE RESTRICT，删被引用的行会让整个清理事务失败
  describe('清理时还被本地别的行引用的行（M1）', () => {
    it('撤销的分区：没被引用的照删，被引用的连同映射与进度行留着、记一条失败；引用没了下一次拉取删掉', async () => {
      const harness = createHarness({
        buckets: ['public', 'tenant:1'],
        snapshotRows: { public: [row('p')], 'tenant:1': [row('t1'), row('t2')] },
        changes: {},
        snapshotPoint: 1
      });
      await pull(harness);
      harness.children.push({ id: 'c1', note: 'order line', itemId: 't1' });

      harness.adapter.getCallerBuckets.mockResolvedValue(['public']);
      const revoked = await pull(harness);

      expect(revoked?.failures.map(failure => failure.error)).toEqual([expect.any(RxDBBucketCleanupBlockedError)]);
      expect(revoked?.failures[0].error).toMatchObject({
        bucket: 'tenant:1',
        entityIds: ['t1'],
        referencedBy: [{ namespace: 'public', entity: 'BucketPullChild' }]
      });
      expect(harness.entities.map(item => item['id']).sort()).toEqual(['p', 't1']);
      expect(harness.mappings.filter(item => item.bucket === 'tenant:1').map(item => item.entityId)).toEqual([
        getRxDBEntityIdentityKey('t1')
      ]);
      expect(harness.progress.map(item => item.bucket).sort()).toEqual(['public', 'tenant:1']);

      harness.children.length = 0;
      const retried = await pull(harness);

      expect(retried?.failures).toEqual([]);
      expect(harness.entities.map(item => item['id'])).toEqual(['p']);
      expect(harness.mappings.map(item => item.bucket)).toEqual(['public']);
      expect(harness.progress.map(item => item.bucket)).toEqual(['public']);
    });

    it('拉取途中离开分区的行还被引用：留在本机、映射留着，同一批的其余变更照常落库，游标照常推进', async () => {
      const harness = createHarness({
        buckets: ['public'],
        snapshotRows: { public: [row('a'), row('b')] },
        changes: {
          public: [
            createChange(2, 'a', 'DELETE', null, null, null),
            createChange(3, 'b', 'UPDATE', { value: 'updated' }, row('b'), row('b'))
          ]
        },
        snapshotPoint: 1
      });
      harness.children.push({ id: 'c1', note: 'order line', itemId: 'a' });

      const result = await pull(harness, undefined, 10);

      expect(result?.failures.map(failure => failure.error)).toEqual([expect.any(RxDBBucketCleanupBlockedError)]);
      expect(harness.entities.map(item => item['id']).sort()).toEqual(['a', 'b']);
      expect(harness.entities.find(item => item['id'] === 'b')?.['value']).toBe('updated');
      expect(harness.mappings.map(item => item.entityId).sort()).toEqual(
        ['a', 'b'].map(getRxDBEntityIdentityKey).sort()
      );
      expect(harness.progress[0]).toMatchObject({ cursor: 3, snapshotComplete: true });
    });

    it('撤销分区的清理出错只记这一条失败，不挡同一实体仍有授权的分区', async () => {
      const harness = createHarness({
        buckets: ['public', 'tenant:1'],
        snapshotRows: { public: [row('p')], 'tenant:1': [row('t1')] },
        changes: {},
        snapshotPoint: 1
      });
      await pull(harness);
      const executor = harness.localAdapter.executor as unknown as {
        getRepository(EntityType: unknown): { find: ReturnType<typeof vi.fn> };
      };
      executor.getRepository(BucketPullChild).find.mockRejectedValueOnce(new Error('disk I/O error'));
      harness.adapter.pullBucketChanges.mockImplementation(async (sinceId: number) =>
        [createChange(2, 'p', 'UPDATE', { value: 'updated' }, row('p'), row('p'))].filter(change => change.id > sinceId)
      );

      harness.adapter.getCallerBuckets.mockResolvedValue(['public']);
      const result = await pull(harness);

      expect(result?.failures.map(failure => failure.error.message)).toEqual(['disk I/O error']);
      expect(harness.entities.find(item => item['id'] === 'p')?.['value']).toBe('updated');
      expect(harness.progress.map(item => item.bucket).sort()).toEqual(['public', 'tenant:1']);
    });
  });
});
