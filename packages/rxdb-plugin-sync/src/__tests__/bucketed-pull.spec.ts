import {
  Entity,
  EntityBase,
  getRxDBChangeKey,
  parseRxDBChangeKey,
  PropertyType,
  RxDBChange,
  RxDBSync,
  WorktreeTableSet,
  type EntityType,
  type RemoteChange,
  type RuleGroup,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { pullBucketedRepositoryIfSupported } from '../bucketed-pull.js';
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
    pullBucketSnapshot: ReturnType<typeof vi.fn>;
    pullBucketChanges: ReturnType<typeof vi.fn>;
  };
  repoSync: RxDBSync;
  progress: RxDBSyncBucketProgress[];
  mappings: RxDBSyncBucketRow[];
  entities: Record<string, unknown>[];
  changes: RxDBChange[];
  localAdapter: unknown;
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

const createHarness = (options: HarnessOptions): BucketHarness => {
  const repoSync = createSyncRecord();
  const progress: RxDBSyncBucketProgress[] = [];
  const mappings: RxDBSyncBucketRow[] = [];
  const changes = [...(options.localChanges ?? [])];
  const entities = [...(options.entities ?? [])];
  const allRows = (EntityType: unknown): unknown[] => {
    if (EntityType === RxDBSyncBucketProgress) return progress;
    if (EntityType === RxDBSyncBucketRow) return mappings;
    if (EntityType === RxDBChange) return changes;
    if (EntityType === RxDBSync) return [repoSync];
    if (EntityType === BucketPullItem) return entities;
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

  const localAdapter = {
    getRepository,
    transaction: vi.fn(async (callback: (executor: unknown) => Promise<unknown>) =>
      callback({
        tableSet: WorktreeTableSet.MAIN,
        getRepository,
        mergeChanges
      })
    )
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
    pullBucketSnapshot: vi.fn(
      async (
        _namespace: string,
        _entity: string,
        bucket: string,
        filter: RuleGroup | undefined,
        offset: number,
        limit: number
      ) => {
        const rows = options.snapshotRows[bucket] ?? [];
        const filtered = filter ? rows.filter(row => matchesFilter(row, filter)) : rows;
        return filtered.slice(offset, offset + limit);
      }
    ),
    pullBucketChanges: vi.fn(
      async (sinceId: number, limit: number, _namespace: string, _entity: string, bucket: string) =>
        (options.changes[bucket] ?? []).filter(change => change.id > sinceId).slice(0, limit)
    )
  };

  const sm = {
    rxdb: {
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

  return { sm, adapter, repoSync, progress, mappings, entities, changes, localAdapter };
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

const pull = (harness: BucketHarness, filter?: RuleGroup, limit = 2) =>
  pullBucketedRepositoryIfSupported(
    harness.sm,
    harness.adapter as never,
    harness.localAdapter as never,
    BucketPullItem,
    harness.repoSync,
    'public',
    'BucketPullItem',
    'main',
    { limit, fetchAll: true, includeRelated: false },
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
    expect(harness.adapter.pullBucketSnapshot.mock.calls.map(call => call[4])).toEqual([0, 1, 2]);
    expect(harness.adapter.pullBucketChanges.mock.calls.map(call => call[0])).toEqual([2, 3]);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['one', 'two']);
    expect(harness.entities.find(item => item['id'] === 'one')?.['value']).toBe('updated');
    expect(harness.progress[0]).toMatchObject({ snapshotComplete: true, snapshotOffset: 2, cursor: 3 });
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
        offset: number,
        limit: number
      ) => {
        const rows: Record<string, Record<string, unknown>[]> = {
          public: [row('public')],
          'tenant:2': [row('tenant-2')]
        };
        return (rows[bucket] ?? []).slice(offset, offset + limit);
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
      async (_namespace, _entity, bucket, _filter, offset, limit) => {
        if (bucket === 'broken') throw new Error('broken bucket');
        return healthyRows.slice(offset, offset + limit);
      }
    );

    const failed = await pull(harness);
    expect(failed?.failures).toHaveLength(1);
    expect(harness.entities).toEqual([row('healthy')]);

    harness.adapter.pullBucketSnapshot.mockImplementation(async (_namespace, _entity, bucket, _filter, offset, limit) =>
      (bucket === 'broken' ? [row('broken')] : [row('healthy')]).slice(offset, offset + limit)
    );
    const recovered = await pull(harness);
    expect(recovered?.failures).toHaveLength(0);
    expect(harness.entities.map(item => item['id']).sort()).toEqual(['broken', 'healthy']);
  });
});
