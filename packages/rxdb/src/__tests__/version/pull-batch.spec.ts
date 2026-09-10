import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { PullBatchRequest } from '../../rxdb-adapter.js';
import { ConflictDetectedEvent, type RxDBEvent } from '../../rxdb-events.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { RemoteChange } from '../../system/system.interface.js';
import { pullBatch } from '../../version/pull-batch.js';
import type { PullResult, SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { getRxDBChangeKey } from '../../version/VersionManager.utils.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

const FULL_SYNC: SyncOptions = {
  type: SyncType.Full,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'remote' }
};

const LOCAL_SYNC: SyncOptions = {
  type: SyncType.None,
  local: { adapter: 'sqlite' }
};

@Entity({
  name: 'PullBatchParent',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullBatchParent extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullBatchChild',
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullBatchParent',
      mappedProperty: 'children'
    }
  ]
})
class PullBatchChild extends EntityBase {
  value!: string;
  parent!: PullBatchParent;
  parentId!: string;
}

@Entity({
  name: 'PullBatchIdle',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullBatchIdle extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullBatchNone',
  sync: {
    type: SyncType.None,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'remote' }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullBatchNone extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullBatchLocal',
  sync: LOCAL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullBatchLocal extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullBatchFilter',
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'sqlite' },
    remote: {
      adapter: 'remote',
      filter: (): RuleGroup => ({ combinator: 'and', rules: [] })
    }
  },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullBatchFilter extends EntityBase {
  value!: string;
}

@Entity({
  namespace: 'tenant',
  name: 'PullBatchParent',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class TenantPullBatchParent extends EntityBase {
  value!: string;
}

type QueryRule = {
  field: string;
  operator: '=' | '>' | 'in';
  value: unknown;
};

type QueryOptions = {
  where?: {
    combinator: 'and' | 'or';
    rules: QueryRule[];
  };
  limit?: number;
  orderBy?: Array<{
    field: string;
    sort: 'asc' | 'desc';
  }>;
};

type PullChanges = (
  sinceId: number,
  limit: number,
  repositoryFilter?: string[],
  filter?: RuleGroup,
  branchId?: string
) => Promise<RemoteChange[]>;

type PullChangesBatch = (requests: PullBatchRequest[], limit: number, branchIds?: string[]) => Promise<RemoteChange[]>;

type MergeChanges = (actions: SwitchVersionActions, localChanges?: unknown, disableTriggers?: boolean) => Promise<void>;

interface HarnessOptions {
  entities: EntityType[];
  sync?: SyncOptions;
  syncRecords?: RxDBSync[];
  localChanges?: RxDBChange[];
  branchId?: string;
  branches?: RxDBBranch[];
  clientId?: string;
  batchChanges?: RemoteChange[];
  fallbackChanges?: (...args: Parameters<PullChanges>) => RemoteChange[];
  useBatch?: boolean;
}

interface RemoteChangeInput {
  id: number;
  namespace?: string;
  entity: string;
  entityId: string;
  type?: RemoteChange['type'];
  patch?: RemoteChange['patch'];
  inversePatch?: RemoteChange['inversePatch'];
  clientId?: string;
  localId?: number | null;
  branchId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  return 0;
}

function matchesRule(item: object, rule: QueryRule): boolean {
  const value = Reflect.get(item, rule.field) as unknown;

  if (rule.operator === '=') return Object.is(value, rule.value);
  if (rule.operator === '>') {
    return typeof value === 'number' && typeof rule.value === 'number' && value > rule.value;
  }
  if (rule.operator === 'in') {
    return Array.isArray(rule.value) && rule.value.some(candidate => Object.is(candidate, value));
  }

  return false;
}

function matchesWhere(item: object, where: NonNullable<QueryOptions['where']>): boolean {
  const matches = where.rules.map(rule => matchesRule(item, rule));
  return where.combinator === 'and' ? matches.every(Boolean) : matches.some(Boolean);
}

function filterItems<T extends { id: unknown }>(items: T[], options?: QueryOptions): T[] {
  const result = options?.where ? items.filter(item => matchesWhere(item, options.where!)) : [...items];
  const order = options?.orderBy?.[0];

  if (order) {
    const direction = order.sort === 'asc' ? 1 : -1;
    result.sort(
      (left, right) => direction * compareValues(Reflect.get(left, order.field), Reflect.get(right, order.field))
    );
  }

  return options?.limit == null ? result : result.slice(0, options.limit);
}

function createRepository<T extends { id: unknown }>(items: T[]) {
  return {
    find: vi.fn(async (options?: QueryOptions): Promise<T[]> => filterItems(items, options)),
    create: vi.fn(async (item: T): Promise<T> => {
      items.push(item);
      return item;
    }),
    update: vi.fn(async (item: T, patch: Partial<T>): Promise<T> => {
      Object.assign(item, patch);
      return item;
    })
  };
}

function createSyncRecord(
  entity: string,
  branchId: string,
  lastPullRemoteChangeId: number | null,
  lastPushedChangeId: number | null = null,
  namespace = 'public'
): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = `${namespace}:${entity}:${branchId}`;
  record.namespace = namespace;
  record.entity = entity;
  record.branchId = branchId;
  record.syncType = 'full';
  record.lastPushedChangeId = lastPushedChangeId;
  record.lastPushedAt = null;
  record.lastPulledAt = null;
  record.lastPullRemoteChangeId = lastPullRemoteChangeId;
  record.enabled = true;
  record.createdAt = new Date('2026-01-01T00:00:00.000Z');
  record.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return record;
}

function createLocalChange(id: number, entity: string, entityId: string, createdAt: Date): RxDBChange {
  const change = Object.create(RxDBChange.prototype) as RxDBChange;
  change.id = id;
  change.namespace = 'public';
  change.entity = entity;
  change.entityId = entityId as RxDBChange['entityId'];
  change.branchId = 'main';
  change.type = 'UPDATE';
  change.patch = { value: 'local' };
  change.inversePatch = { value: 'base' };
  change.remoteId = null;
  change.revertChangeId = null;
  change.createdAt = createdAt;
  change.updatedAt = createdAt;
  return change;
}

function createBranch(id: string, parentId: string | null): RxDBBranch {
  const branch = Object.create(RxDBBranch.prototype) as RxDBBranch;
  branch.id = id;
  branch.parentId = parentId;
  branch.activated = id === 'feature';
  branch.local = true;
  branch.remote = true;
  branch.fromChangeId = null;
  branch.createdAt = new Date('2026-01-01T00:00:00.000Z');
  branch.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return branch;
}

function createRemoteChange(input: RemoteChangeInput): RemoteChange {
  const createdAt = input.createdAt ?? new Date(`2026-01-01T00:00:${String(input.id).padStart(2, '0')}.000Z`);

  return {
    id: input.id,
    namespace: input.namespace ?? 'public',
    entity: input.entity,
    entityId: input.entityId,
    branchId: input.branchId ?? 'main',
    type: input.type ?? 'UPDATE',
    patch: 'patch' in input ? input.patch : { value: `remote-${input.id}` },
    inversePatch: 'inversePatch' in input ? input.inversePatch : { value: `base-${input.id}` },
    clientId: input.clientId,
    localId: input.localId,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt
  };
}

function createHarness(options: HarnessOptions) {
  const syncRecords = [...(options.syncRecords ?? [])];
  const localChanges = [...(options.localChanges ?? [])];
  const branches = [...(options.branches ?? [])];
  const syncRepository = createRepository(syncRecords);
  const changeRepository = createRepository(localChanges);
  const branchRepository = createRepository(branches);
  const mergeChanges = vi.fn<MergeChanges>(async () => undefined);
  const getRepository = vi.fn((EntityClass: unknown) => {
    if (EntityClass === RxDBSync) return syncRepository;
    if (EntityClass === RxDBChange) return changeRepository;
    if (EntityClass === RxDBBranch) return branchRepository;
    throw new Error('Unexpected local repository request');
  });
  // 直通替身：只记录调用与嵌套深度，真正的回滚语义由适配器套件的集成测试覆盖
  // C2：事务回调收到 executor；替身把 getRepository / mergeChanges 转发回本 mock 适配器
  const transaction = vi.fn(async (fun: (executor: never) => Promise<unknown>) =>
    fun(createTransactionExecutorStub({ getRepository, mergeChanges }) as never)
  );
  const localAdapter = {
    getRepository,
    mergeChanges,
    transaction
  };
  const pullChanges = vi.fn<PullChanges>(async (...args) => options.fallbackChanges?.(...args) ?? []);
  const pullChangesBatch = vi.fn<PullChangesBatch>(async () => options.batchChanges ?? []);
  const remoteAdapter = options.useBatch === false ? { pullChanges } : { pullChanges, pullChangesBatch };
  const dispatchEvent = vi.fn<(event: RxDBEvent) => void>();
  const branchId = options.branchId ?? 'main';
  const vm = {
    rxdb: {
      config: {
        entities: options.entities,
        sync: options.sync ?? FULL_SYNC
      },
      context: { clientId: options.clientId ?? 'local-client' },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: branchId }))
  } as unknown as VersionManager;

  return {
    vm,
    syncRecords,
    localChanges,
    syncRepository,
    changeRepository,
    branchRepository,
    localAdapter,
    transaction,
    pullChanges,
    pullChangesBatch,
    mergeChanges,
    dispatchEvent
  };
}

describe('pullBatch 生产路径', () => {
  it('rejects before touching adapters when the remote adapter is not configured', async () => {
    const harness = createHarness({ entities: [PullBatchParent], sync: LOCAL_SYNC });

    await expect(pullBatch(harness.vm)).rejects.toThrow('Remote adapter not configured.');

    expect(harness.vm.getRemoteRepositories).not.toHaveBeenCalled();
    expect(harness.vm.getLocalRepositories).not.toHaveBeenCalled();
  });

  it('returns an empty result when none, local, and filter repositories are all skipped', async () => {
    const harness = createHarness({ entities: [PullBatchNone, PullBatchLocal, PullBatchFilter] });

    const result = await pullBatch(harness.vm, { limit: 5 });

    expect(result).toEqual({
      pulled: 0,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: false,
      historyInvalidated: false,
      failures: []
    });
    expect(harness.syncRepository.find).not.toHaveBeenCalled();
    expect(harness.syncRepository.create).not.toHaveBeenCalled();
    expect(harness.pullChangesBatch).not.toHaveBeenCalled();
    expect(harness.pullChanges).not.toHaveBeenCalled();
  });

  it('uses per-repository watermarks, dependency order, compaction, conflict merge, and watermark updates', async () => {
    const parentSync = createSyncRecord('PullBatchParent', 'main', 10);
    const childSync = createSyncRecord('PullBatchChild', 'main', 20, 100);
    const idleSync = createSyncRecord('PullBatchIdle', 'main', null);
    const ownMapped = createLocalChange(
      101,
      'PullBatchParent',
      'parent-own-mapped',
      new Date('2026-01-01T00:00:01.000Z')
    );
    const childPending = createLocalChange(102, 'PullBatchChild', 'child-1', new Date('2026-01-01T00:00:10.000Z'));
    const batchChanges = [
      createRemoteChange({ id: 21, entity: 'PullBatchChild', entityId: 'child-1' }),
      createRemoteChange({ id: 9, entity: 'PullBatchParent', entityId: 'parent-stale' }),
      createRemoteChange({ id: 19, entity: 'PullBatchChild', entityId: 'child-stale' }),
      createRemoteChange({
        id: 22,
        entity: 'PullBatchChild',
        entityId: 'child-1',
        patch: { status: 'done' },
        inversePatch: { status: 'todo' },
        clientId: 'other-client'
      }),
      createRemoteChange({
        id: 11,
        entity: 'PullBatchParent',
        entityId: 'parent-own-no-local-id',
        clientId: 'local-client',
        localId: null
      }),
      createRemoteChange({
        id: 12,
        entity: 'PullBatchParent',
        entityId: 'parent-own-mapped',
        clientId: 'local-client',
        localId: 101
      }),
      createRemoteChange({
        id: 13,
        entity: 'PullBatchParent',
        entityId: 'parent-cancelled',
        type: 'INSERT',
        patch: { value: 'temporary' },
        inversePatch: null
      }),
      createRemoteChange({
        id: 14,
        entity: 'PullBatchParent',
        entityId: 'parent-cancelled',
        type: 'DELETE',
        patch: null,
        inversePatch: null,
        clientId: 'other-client'
      })
    ];
    const harness = createHarness({
      entities: [PullBatchChild, PullBatchIdle, PullBatchLocal, PullBatchParent],
      syncRecords: [parentSync, childSync, idleSync],
      localChanges: [ownMapped, childPending],
      batchChanges
    });

    const result = await pullBatch(harness.vm, { limit: 4, fetchAll: false });

    expect(harness.pullChangesBatch).toHaveBeenCalledWith(
      [
        { namespace: 'public', entity: 'PullBatchParent', sinceId: 10 },
        { namespace: 'public', entity: 'PullBatchChild', sinceId: 20 },
        { namespace: 'public', entity: 'PullBatchIdle', sinceId: 0 }
      ],
      12,
      ['main']
    );
    expect(result).toEqual({
      pulled: 6,
      compacted: 3,
      applied: 1,
      hasMore: true,
      conflictsResolved: 1,
      conflictsDeferred: 0,
      persistedProgress: true,
      historyInvalidated: true,
      failures: []
    });
    expect(ownMapped.remoteId).toBe(12);
    expect(childPending.remoteId).toBe(22);
    expect(parentSync.lastPullRemoteChangeId).toBe(14);
    expect(childSync.lastPullRemoteChangeId).toBe(22);
    expect(parentSync.lastPulledAt).toBeInstanceOf(Date);
    expect(childSync.lastPulledAt).toBeInstanceOf(Date);
    expect(harness.syncRepository.update.mock.calls.map(([record]) => record.entity)).toEqual([
      'PullBatchParent',
      'PullBatchChild'
    ]);
    expect(harness.mergeChanges).toHaveBeenCalledTimes(1);

    const [actions, localChanges, disableTriggers] = harness.mergeChanges.mock.calls[0];
    expect([...actions.updates]).toEqual([
      [
        getRxDBChangeKey(batchChanges[0]!),
        {
          patch: { value: 'remote-21', status: 'done' },
          inversePatch: { value: 'base-21', status: 'todo' }
        }
      ]
    ]);
    expect(actions.inserts.size).toBe(0);
    expect(actions.deletes.size).toBe(0);
    expect(localChanges).toBeUndefined();
    expect(disableTriggers).toBe(true);
    expect(harness.dispatchEvent.mock.calls[0]?.[0]).toBeInstanceOf(ConflictDetectedEvent);

    expect(idleSync.lastPullRemoteChangeId).toBeNull();
    expect(harness.syncRepository.create).not.toHaveBeenCalled();
  });

  /**
   * 批量拉取此前写死 `new LWWConflictResolver()`，调用方给的解决器完全够不着 ——
   * 同一个自定义策略走 `pullRepository` 生效、走 `pull()` 默认的批量路径静默失效。
   * 上一个用例是 LWW 的基线（同样的冲突判 KEEP_REMOTE，`applied: 1`），
   * 这里换成 KEEP_LOCAL，结果必须跟着变。
   */
  it('批量拉取使用调用方传入的冲突解决器，而不是写死的 LWW', async () => {
    const childSync = createSyncRecord('PullBatchChild', 'main', 20, 100);
    const childPending = createLocalChange(102, 'PullBatchChild', 'child-1', new Date('2026-01-01T00:00:10.000Z'));
    const conflicting = createRemoteChange({
      id: 22,
      entity: 'PullBatchChild',
      entityId: 'child-1',
      patch: { status: 'done' },
      inversePatch: { status: 'todo' },
      clientId: 'other-client'
    });
    const harness = createHarness({
      entities: [PullBatchChild],
      syncRecords: [childSync],
      localChanges: [childPending],
      batchChanges: [conflicting]
    });
    const resolve = vi.fn(async () => ({ type: 'KEEP_LOCAL' }) as const);

    const result = await pullBatch(harness.vm, { limit: 4, conflictResolver: { resolve } });

    expect(resolve).toHaveBeenCalledTimes(1);
    // KEEP_LOCAL：冲突算解决了，但远端那条不落库
    expect(result).toMatchObject({ pulled: 1, applied: 0, conflictsResolved: 1 });
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('keeps same-named entities isolated by namespace', async () => {
    const publicSync = createSyncRecord('PullBatchParent', 'main', 0);
    const tenantSync = createSyncRecord('PullBatchParent', 'main', 0, null, 'tenant');
    const batchChanges = [
      createRemoteChange({ id: 1, entity: 'PullBatchParent', entityId: 'public-record' }),
      createRemoteChange({
        id: 2,
        namespace: 'tenant',
        entity: 'PullBatchParent',
        entityId: 'tenant-record'
      })
    ];
    const harness = createHarness({
      entities: [PullBatchParent, TenantPullBatchParent],
      syncRecords: [publicSync, tenantSync],
      batchChanges
    });

    await pullBatch(harness.vm);

    expect(harness.pullChangesBatch).toHaveBeenCalledWith(
      [
        { namespace: 'public', entity: 'PullBatchParent', sinceId: 0 },
        { namespace: 'tenant', entity: 'PullBatchParent', sinceId: 0 }
      ],
      2000,
      ['main']
    );
    expect(harness.syncRepository.update.mock.calls.map(([record]) => record.id)).toEqual([
      'public:PullBatchParent:main',
      'tenant:PullBatchParent:main'
    ]);
    expect(harness.mergeChanges.mock.calls.map(([actions]) => [...actions.updates.keys()])).toEqual([
      [getRxDBChangeKey(batchChanges[0]!)],
      [getRxDBChangeKey(batchChanges[1]!)]
    ]);
  });

  it('does not replay own changes without a local mapping and still advances the watermark', async () => {
    const parentSync = createSyncRecord('PullBatchParent', 'main', null);
    const harness = createHarness({
      entities: [PullBatchParent],
      syncRecords: [parentSync],
      batchChanges: [
        createRemoteChange({
          id: 1,
          entity: 'PullBatchParent',
          entityId: 'own-without-local-id',
          clientId: 'local-client',
          localId: null
        }),
        createRemoteChange({
          id: 2,
          entity: 'PullBatchParent',
          entityId: 'own-missing-local-record',
          clientId: 'local-client',
          localId: 404
        })
      ]
    });

    const result = await pullBatch(harness.vm);

    expect(result).toEqual({
      pulled: 2,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      // 只回填了 remoteId、推进了水位线：applied=0 但写已经提交
      persistedProgress: true,
      historyInvalidated: false,
      failures: []
    });
    expect(harness.pullChangesBatch).toHaveBeenCalledWith(
      [{ namespace: 'public', entity: 'PullBatchParent', sinceId: 0 }],
      1000,
      ['main']
    );
    expect(harness.changeRepository.find).toHaveBeenCalledTimes(1);
    expect(harness.changeRepository.update).not.toHaveBeenCalled();
    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect(harness.syncRecords[0]?.lastPullRemoteChangeId).toBe(2);
  });

  /**
   * RXD-067：fallback 对「每个仓库 × 每个祖先分支」分别取 `limit` 条后直接 `flat()`，
   * 水位线却推到合并结果的最大 id。某个分支的高 id 会把水位推过另一个分支尚未消费的低 id，
   * 那些变更从此被 `c.id > lastPullRemoteChangeId` 永久跳过。
   *
   * 场景：limit=2，feature 分支有 100/101，main 分支有 1/2/3/4（本轮只返回 1/2）。
   * 修复前水位被推到 101，main 的 3/4 再也拉不到。
   */
  it('does not let a high-id ancestor branch push the watermark past another branch pending changes', async () => {
    const parentSync = createSyncRecord('PullBatchParent', 'feature', 0);
    const harness = createHarness({
      entities: [PullBatchParent],
      syncRecords: [parentSync],
      branchId: 'feature',
      branches: [createBranch('feature', 'main'), createBranch('main', null)],
      useBatch: false,
      fallbackChanges: (_sinceId, limitArg, _entities, _filter, ancestorBranchId) => {
        const ids = ancestorBranchId === 'feature' ? [100, 101] : [1, 2, 3, 4];
        return ids
          .slice(0, limitArg)
          .map(id =>
            createRemoteChange({ id, entity: 'PullBatchParent', entityId: `p-${id}`, branchId: ancestorBranchId })
          );
      }
    });

    await pullBatch(harness.vm, { limit: 2 });

    // 只能消费全局排序后的前 limit 条（main 的 1/2），水位不得跳到 feature 的 101
    expect(harness.syncRecords[0]?.lastPullRemoteChangeId).toBe(2);
  });

  it('falls back to every repository and ancestor branch when batch pull is unavailable', async () => {
    const parentSync = createSyncRecord('PullBatchParent', 'feature', 3);
    const childSync = createSyncRecord('PullBatchChild', 'feature', 7);
    const harness = createHarness({
      entities: [PullBatchChild, PullBatchParent],
      syncRecords: [parentSync, childSync],
      branchId: 'feature',
      branches: [createBranch('feature', 'main'), createBranch('main', null)],
      useBatch: false
    });

    const result = await pullBatch(harness.vm, { limit: 2 });

    expect(harness.pullChangesBatch).not.toHaveBeenCalled();
    expect(harness.pullChanges.mock.calls).toEqual([
      [3, 2, ['public:PullBatchParent'], undefined, 'feature'],
      [3, 2, ['public:PullBatchParent'], undefined, 'main'],
      [7, 2, ['public:PullBatchChild'], undefined, 'feature'],
      [7, 2, ['public:PullBatchChild'], undefined, 'main']
    ]);
    expect(harness.branchRepository.find).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      pulled: 0,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: false,
      historyInvalidated: false,
      failures: []
    });
  });

  /**
   * `pull({ fetchAll: true })` 是文档化的公开 API（VersionManager.ts 的 @example），
   * pull.ts 也把它透传进了 pullBatch —— 但 pullBatch 从来没读过这个字段，
   * 调用方以为拉全了，实际只拉了一批。
   */
  describe('fetchAll', () => {
    /** 每轮只返回 limit 条、且随水位线推进的远端桩 */
    const createPagedHarness = (total: number) => {
      const harness = createHarness({
        entities: [PullBatchParent],
        syncRecords: [createSyncRecord('PullBatchParent', 'main', 0)],
        branches: [createBranch('main', null)]
      });
      const all = Array.from({ length: total }, (_, i) =>
        createRemoteChange({ id: i + 1, entity: 'PullBatchParent', entityId: `parent-${i + 1}` })
      );
      harness.pullChangesBatch.mockImplementation(async (requests, limit) => {
        const sinceId = requests[0]?.sinceId ?? 0;
        return all.filter(change => change.id > sinceId).slice(0, limit);
      });
      return harness;
    };

    it('fetchAll 为真时循环拉取直到远端排空', async () => {
      const harness = createPagedHarness(3);

      const result = await pullBatch(harness.vm, { limit: 1, fetchAll: true });

      expect(result.pulled).toBe(3);
      expect(result.hasMore).toBe(false);
      // 3 轮取数 + 1 轮确认排空
      expect(harness.pullChangesBatch).toHaveBeenCalledTimes(4);
    });

    it('不传 fetchAll 时维持单批语义，并如实报告 hasMore', async () => {
      const harness = createPagedHarness(3);

      const result = await pullBatch(harness.vm, { limit: 1 });

      expect(result.pulled).toBe(1);
      expect(result.hasMore).toBe(true);
      expect(harness.pullChangesBatch).toHaveBeenCalledTimes(1);
    });

    /**
     * 逐轮拉取时中途失败：前几轮已经落库且水位线已推进。
     * 把原始错误裸抛出去，调用方不知道已经应用了多少 —— 重试从新水位线继续，
     * 中间那段既不重放也不告警。
     */
    it('中途失败时带回已完成部分的统计', async () => {
      const harness = createPagedHarness(3);
      let round = 0;
      const boom = new Error('remote exploded');
      harness.mergeChanges.mockImplementation(async () => {
        round++;
        if (round > 1) throw boom;
        return undefined;
      });

      const error = await pullBatch(harness.vm, { limit: 1, fetchAll: true }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RxDBPartialSyncError);
      const partial = error as RxDBPartialSyncError<PullResult>;
      expect(partial.cause).toBe(boom);
      // 第一轮已应用，必须如实回报
      expect(partial.result.applied).toBe(1);
    });

    it('一条都没应用就失败时，照常抛原始错误', async () => {
      const harness = createPagedHarness(3);
      const boom = new Error('remote exploded');
      harness.mergeChanges.mockRejectedValue(boom);

      await expect(pullBatch(harness.vm, { limit: 1, fetchAll: true })).rejects.toBe(boom);
    });

    /**
     * RXD-031：`applied` 不是「已持久化」的全集。回填自己推送变更的 `remoteId`、
     * 推进 `lastPullRemoteChangeId` 都是已提交的写入，但它们一条 `applied` 都不产生。
     * 只看 `applied` 会把「水位线已前移」的轮次判成「什么都没发生」，裸抛原始错误 ——
     * 调用方重试从新水位线继续，中间那段既不重放也不告警。
     */
    it('只回填 remoteId、推进水位线的轮次也算已持久化进度', async () => {
      const localChange = createLocalChange(7, 'PullBatchParent', 'own-1', new Date('2026-01-01T00:00:00.000Z'));
      const harness = createHarness({
        entities: [PullBatchParent],
        syncRecords: [createSyncRecord('PullBatchParent', 'main', 0)],
        branches: [createBranch('main', null)],
        localChanges: [localChange]
      });
      const boom = new Error('remote exploded');
      const all = [
        createRemoteChange({
          id: 1,
          entity: 'PullBatchParent',
          entityId: 'own-1',
          clientId: 'local-client',
          localId: 7
        }),
        createRemoteChange({ id: 2, entity: 'PullBatchParent', entityId: 'other-1' })
      ];
      harness.pullChangesBatch.mockImplementation(async (requests, limit) => {
        const sinceId = requests[0]?.sinceId ?? 0;
        return all.filter(change => change.id > sinceId).slice(0, limit);
      });
      harness.mergeChanges.mockRejectedValue(boom);

      const error = await pullBatch(harness.vm, { limit: 1, fetchAll: true }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RxDBPartialSyncError);
      const partial = error as RxDBPartialSyncError<PullResult>;
      expect(partial.cause).toBe(boom);
      // 第一轮只回填了 remoteId：没有实体数据变化，但水位线已经推进
      expect(partial.result.applied).toBe(0);
      expect(partial.result.persistedProgress).toBe(true);
      expect(partial.result.historyInvalidated).toBe(false);
      expect(localChange.remoteId).toBe(1);
    });

    /**
     * RXD-031：远端变更被压缩全抵消（INSERT → DELETE）时 `pulled > 0` 但 `applied === 0`，
     * 本地实体数据一个字节都没变。此时不能声称历史边界失效。
     */
    it('远端变更全被压缩抵消时不标记历史边界失效', async () => {
      const harness = createHarness({
        entities: [PullBatchParent],
        syncRecords: [createSyncRecord('PullBatchParent', 'main', 0)],
        branches: [createBranch('main', null)],
        batchChanges: [
          createRemoteChange({
            id: 1,
            entity: 'PullBatchParent',
            entityId: 'ghost',
            type: 'INSERT',
            patch: { value: 'ghost' },
            inversePatch: null
          }),
          createRemoteChange({
            id: 2,
            entity: 'PullBatchParent',
            entityId: 'ghost',
            type: 'DELETE',
            patch: null,
            inversePatch: null
          })
        ]
      });

      const result = await pullBatch(harness.vm);

      expect(result.pulled).toBe(2);
      expect(result.applied).toBe(0);
      expect(result.persistedProgress).toBe(true);
      expect(result.historyInvalidated).toBe(false);
      expect(harness.mergeChanges).not.toHaveBeenCalled();
    });
  });

  /**
   * 逐仓库应用 + 逐仓库推进水位线：第 k 个仓库失败时前 k-1 个的数据与水位线都已落库，
   * 重试从新水位线继续，中间那段静默消失。整批必须在一个事务里。
   */
  describe('原子性', () => {
    it('整批仓库的应用与水位线推进在同一个事务内', async () => {
      const parentSync = createSyncRecord('PullBatchParent', 'main', 0);
      const childSync = createSyncRecord('PullBatchChild', 'main', 0);
      const harness = createHarness({
        entities: [PullBatchParent, PullBatchChild],
        syncRecords: [parentSync, childSync],
        branches: [createBranch('main', null)],
        batchChanges: [
          createRemoteChange({ id: 1, entity: 'PullBatchParent', entityId: 'parent-1' }),
          createRemoteChange({ id: 2, entity: 'PullBatchChild', entityId: 'child-1' })
        ]
      });

      let depth = 0;
      const depthAtEachMerge: number[] = [];
      harness.transaction.mockImplementation(async (fun: (executor: never) => Promise<unknown>) => {
        depth++;
        try {
          return await fun(
            createTransactionExecutorStub({
              getRepository: harness.localAdapter.getRepository,
              mergeChanges: harness.mergeChanges
            }) as never
          );
        } finally {
          depth--;
        }
      });
      harness.mergeChanges.mockImplementation(async () => {
        depthAtEachMerge.push(depth);
        return undefined;
      });

      await pullBatch(harness.vm, { limit: 10 });

      expect(harness.transaction).toHaveBeenCalledTimes(1);
      expect(depthAtEachMerge.length).toBeGreaterThan(1);
      expect(depthAtEachMerge.every(d => d === 1)).toBe(true);
    });

    it('远端拉取发生在事务之外，不把网络往返圈进事务窗口', async () => {
      const harness = createHarness({
        entities: [PullBatchParent],
        syncRecords: [createSyncRecord('PullBatchParent', 'main', 0)],
        branches: [createBranch('main', null)],
        batchChanges: [createRemoteChange({ id: 1, entity: 'PullBatchParent', entityId: 'parent-1' })]
      });

      let inTransaction = false;
      let pullDuringTransaction = false;
      harness.transaction.mockImplementation(async (fun: (executor: never) => Promise<unknown>) => {
        inTransaction = true;
        try {
          return await fun(
            createTransactionExecutorStub({
              getRepository: harness.localAdapter.getRepository,
              mergeChanges: harness.mergeChanges
            }) as never
          );
        } finally {
          inTransaction = false;
        }
      });
      harness.pullChangesBatch.mockImplementation(async () => {
        if (inTransaction) pullDuringTransaction = true;
        return [createRemoteChange({ id: 1, entity: 'PullBatchParent', entityId: 'parent-1' })];
      });

      await pullBatch(harness.vm, { limit: 10 });

      expect(harness.pullChangesBatch).toHaveBeenCalled();
      expect(pullDuringTransaction).toBe(false);
    });
  });
});

// RXD-029：批量拉取按 syncType 内联跳过（none/local/filter），从不看 `enabled`
describe('pullBatch 尊重 RxDBSync.enabled（RXD-029）', () => {
  it('skips repositories whose sync record is disabled', async () => {
    const disabled = createSyncRecord('PullBatchParent', 'main', 0);
    disabled.enabled = false;
    const harness = createHarness({
      entities: [PullBatchParent],
      syncRecords: [disabled],
      branches: [createBranch('main', null)],
      batchChanges: [createRemoteChange({ id: 1, entity: 'PullBatchParent', entityId: 'parent-1' })]
    });

    const result = await pullBatch(harness.vm, { limit: 5 });

    expect(result.pulled).toBe(0);
    expect(harness.pullChangesBatch).not.toHaveBeenCalled();
    expect(harness.pullChanges).not.toHaveBeenCalled();
  });
});
