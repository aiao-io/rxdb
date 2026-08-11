import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { ConflictDetectedEvent, ConflictPendingEvent } from '../../rxdb-events.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { RemoteChange } from '../../system/system.interface.js';
import type { ConflictResolver } from '../../version/conflict.js';
import { LWWConflictResolver } from '../../version/LWWConflictResolver.js';
import { pullBatch } from '../../version/pull-batch.js';
import { pullRepository } from '../../version/pull-repository.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

@Entity({
  name: 'PullConflictUser',
  properties: [{ name: 'name', type: PropertyType.string }]
})
class PullConflictUser extends EntityBase {
  name!: string;
}

type QueryRule = { field: string; operator: string; value: unknown };
type QueryOptions = {
  where?: { combinator: 'and' | 'or'; rules: QueryRule[] };
  limit?: number;
  orderBy?: Array<{ field: string; sort: 'asc' | 'desc' }>;
};

function matchesRule(item: Record<string, unknown>, rule: QueryRule): boolean {
  const value = item[rule.field];

  if (rule.operator === '=') {
    return value === rule.value;
  }

  if (rule.operator === '>') {
    return typeof value === 'number' && typeof rule.value === 'number' && value > rule.value;
  }

  if (rule.operator === 'in') {
    return Array.isArray(rule.value) && rule.value.includes(value);
  }

  throw new Error(`Unsupported operator in test repo: ${rule.operator}`);
}

function filterItems<T extends { id: unknown }>(items: T[], options?: QueryOptions): T[] {
  let result = [...items];

  if (options?.where) {
    result = result.filter(item => {
      const matches = options.where!.rules.map(rule => matchesRule(item as Record<string, unknown>, rule));
      return options.where!.combinator === 'and' ? matches.every(Boolean) : matches.some(Boolean);
    });
  }

  if (options?.orderBy?.length) {
    const [{ field, sort }] = options.orderBy;
    result.sort((left, right) => {
      const leftValue = left[field as keyof T] as number | string | Date | null | undefined;
      const rightValue = right[field as keyof T] as number | string | Date | null | undefined;

      if (leftValue == null && rightValue == null) return 0;
      if (leftValue == null) return sort === 'asc' ? -1 : 1;
      if (rightValue == null) return sort === 'asc' ? 1 : -1;
      if (leftValue < rightValue) return sort === 'asc' ? -1 : 1;
      if (leftValue > rightValue) return sort === 'asc' ? 1 : -1;
      return 0;
    });
  }

  if (options?.limit != null) {
    result = result.slice(0, options.limit);
  }

  return result;
}

function createRepository<T extends { id: unknown }>(items: T[]) {
  return {
    find: vi.fn(async (options?: QueryOptions) => filterItems(items, options)),
    count: vi.fn(async (options?: QueryOptions) => filterItems(items, options).length),
    create: vi.fn(async (entity: T) => {
      items.push(entity);
      return entity;
    }),
    update: vi.fn(async (entity: T, patch: Partial<T>) => {
      Object.assign(entity, patch);
      return entity;
    }),
    remove: vi.fn(async (entity: T) => {
      const index = items.indexOf(entity);
      if (index >= 0) {
        items.splice(index, 1);
      }
      return entity;
    })
  };
}

function createLocalChange(entityId: string, createdAt: string): RxDBChange {
  const change = Object.create(RxDBChange.prototype) as RxDBChange;
  change.id = 1;
  change.namespace = 'public';
  change.entity = 'PullConflictUser';
  change.entityId = entityId as RxDBChange['entityId'];
  change.branchId = 'main';
  change.type = 'UPDATE';
  change.patch = { name: 'local' };
  change.inversePatch = { name: 'base' };
  change.remoteId = null;
  change.revertChangeId = null;
  change.createdAt = new Date(createdAt);
  change.updatedAt = new Date(createdAt);
  return change;
}

function createSyncRecord(): RxDBSync {
  const syncRecord = Object.create(RxDBSync.prototype) as RxDBSync;
  syncRecord.id = 'public:PullConflictUser:main';
  syncRecord.namespace = 'public';
  syncRecord.entity = 'PullConflictUser';
  syncRecord.branchId = 'main';
  syncRecord.syncType = 'full';
  syncRecord.lastPushedChangeId = null;
  syncRecord.lastPushedAt = null;
  syncRecord.lastPulledAt = null;
  syncRecord.lastPullRemoteChangeId = null;
  syncRecord.enabled = true;
  syncRecord.createdAt = new Date('2026-01-01T00:00:00.000Z');
  syncRecord.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return syncRecord;
}

function createRemoteChange(entityId: string, createdAt: string, id = 100): RemoteChange {
  return {
    id,
    namespace: 'public',
    entity: 'PullConflictUser',
    entityId,
    branchId: 'main',
    type: 'UPDATE',
    patch: { name: 'remote' },
    inversePatch: { name: 'base' },
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt)
  };
}

function createVersionManager(remoteChanges: RemoteChange[], localChanges: RxDBChange[]) {
  const syncRecords: RxDBSync[] = [createSyncRecord()];
  const syncRepo = createRepository(syncRecords);
  const changeRepo = createRepository(localChanges);
  const mergeChanges = vi.fn(async () => undefined);
  const dispatchEvent = vi.fn();

  const getRepository = vi.fn((entityClass: unknown) => {
    if (entityClass === RxDBChange) return changeRepo;
    if (entityClass === RxDBSync) return syncRepo;
    throw new Error('Unexpected repository request');
  });
  const localAdapter = {
    getRepository,
    mergeChanges,
    // pullBatch 把整批仓库的应用与水位线推进包进一个事务，替身直通即可
    transaction: vi.fn(async (fun: (executor: never) => Promise<unknown>) =>
      fun(createTransactionExecutorStub({ getRepository, mergeChanges }) as never)
    ),
    saveMany: vi.fn(async () => undefined)
  };

  const remoteAdapter = {
    pullChanges: vi.fn(async (sinceId: number, limit: number, entities?: string[]) =>
      remoteChanges
        .filter(change => change.id > sinceId)
        .filter(change => (entities?.length ? entities.includes(`${change.namespace}:${change.entity}`) : true))
        .slice(0, limit)
    ),
    pullChangesBatch: vi.fn(async (requests: Array<{ entity: string; sinceId: number }>, limit: number) =>
      requests
        .flatMap(request =>
          remoteChanges.filter(change => change.entity === request.entity && change.id > request.sinceId)
        )
        .slice(0, limit)
    )
  };

  const vm = {
    rxdb: {
      config: {
        entities: [PullConflictUser],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'remote' }
        }
      },
      context: { clientId: 'local-client' },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: 'main' }))
  } as unknown as VersionManager;

  return {
    vm,
    localAdapter,
    remoteAdapter,
    changeRepo,
    syncRecords,
    dispatchEvent,
    mergeChanges
  };
}

describe('pull conflict resolution', () => {
  const entityId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pullRepository should keep remote changes when remote is newer', async () => {
    const localChange = createLocalChange(entityId, '2026-01-01T10:00:00.000Z');
    const remoteChange = createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 101);
    const { vm, mergeChanges, dispatchEvent } = createVersionManager([remoteChange], [localChange]);

    const result = await pullRepository(vm, 'public', 'PullConflictUser', {
      includeRelated: false,
      conflictResolver: new LWWConflictResolver()
    });

    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.conflictsResolved).toBe(1);
    expect(result.conflictsDeferred).toBe(0);
    expect(localChange.remoteId).toBe(101);
    expect(mergeChanges).toHaveBeenCalledTimes(1);

    const detectedEvent = dispatchEvent.mock.calls.find(call => call[0] instanceof ConflictDetectedEvent)?.[0];
    expect(detectedEvent).toBeInstanceOf(ConflictDetectedEvent);
    expect(detectedEvent.resolved).toBe(1);
  });

  // RXD-057：LWW 的 clientId tie-breaker 只在单测里被手工构造的 Conflict 覆盖过。
  // 生产链路上 `RxDBChange` 没有 clientId 列，`conflict.local.clientId` 恒为 undefined，
  // tie-breaker 永不触发、永远退回 KEEP_LOCAL —— 正是它要防的永久分叉。
  // 本地未同步的 change 按定义就是本客户端产生的，构造 Conflict 时必须打上当前 clientId。
  it('pullRepository should stamp the local clientId so the LWW tie-breaker converges', async () => {
    const sameTime = '2026-01-01T10:00:00.000Z';
    const localChange = createLocalChange(entityId, sameTime);
    const remoteChange = createRemoteChange(entityId, sameTime, 105);
    remoteChange.clientId = 'remote-client';
    const { vm, mergeChanges } = createVersionManager([remoteChange], [localChange]);

    const result = await pullRepository(vm, 'public', 'PullConflictUser', {
      includeRelated: false,
      conflictResolver: new LWWConflictResolver()
    });

    // 'local-client' < 'remote-client' → 两侧独立解算都应选中 remote-client 那条
    expect(result.conflictsResolved).toBe(1);
    expect(result.applied).toBe(1);
    expect(mergeChanges).toHaveBeenCalledTimes(1);
  });

  it('pullRepository should keep local changes when resolver returns KEEP_LOCAL', async () => {
    const localChange = createLocalChange(entityId, '2026-01-01T10:02:00.000Z');
    const remoteChange = createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 102);
    const { vm, mergeChanges } = createVersionManager([remoteChange], [localChange]);

    const customResolver: ConflictResolver = {
      resolve: vi.fn(async () => ({ type: 'KEEP_LOCAL' as const }))
    };

    const result = await pullRepository(vm, 'public', 'PullConflictUser', {
      includeRelated: false,
      conflictResolver: customResolver
    });

    expect(result.applied).toBe(0);
    expect(result.conflictsResolved).toBe(1);
    expect(result.conflictsDeferred).toBe(0);
    expect(localChange.remoteId).toBeNull();
    expect(mergeChanges).not.toHaveBeenCalled();
  });

  it('pullRepository should surface deferred conflicts without advancing the watermark', async () => {
    const localChange = createLocalChange(entityId, '2026-01-01T10:00:00.000Z');
    const remoteChange = createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 103);
    const { vm, syncRecords, mergeChanges, dispatchEvent } = createVersionManager([remoteChange], [localChange]);

    const customResolver: ConflictResolver = {
      resolve: vi.fn(async () => ({ type: 'DEFER' as const }))
    };

    await expect(
      pullRepository(vm, 'public', 'PullConflictUser', {
        includeRelated: false,
        conflictResolver: customResolver
      })
    ).rejects.toThrow('Only KEEP_LOCAL and KEEP_REMOTE can be applied automatically at runtime');

    expect(syncRecords[0]?.lastPullRemoteChangeId ?? null).toBeNull();
    expect(mergeChanges).not.toHaveBeenCalled();

    const pendingEvent = dispatchEvent.mock.calls.find(call => call[0] instanceof ConflictPendingEvent)?.[0];
    expect(pendingEvent).toBeInstanceOf(ConflictPendingEvent);
    expect(pendingEvent.conflicts).toHaveLength(1);
  });

  it('pullBatch should apply the default LWW resolver', async () => {
    const localChange = createLocalChange(entityId, '2026-01-01T10:00:00.000Z');
    const remoteChange = createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 104);
    const { vm, mergeChanges } = createVersionManager([remoteChange], [localChange]);

    const result = await pullBatch(vm, { limit: 100, fetchAll: false });

    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.conflictsResolved).toBe(1);
    expect(result.conflictsDeferred).toBe(0);
    expect(localChange.remoteId).toBe(104);
    expect(mergeChanges).toHaveBeenCalledTimes(1);
  });

  it('pullRepository should not re-apply own changes even when remote record has no localId', async () => {
    // 即使兼容远端记录缺少 localId，也必须按 clientId 识别自己的变更；
    // 不能让它进入 apply/conflict 链路
    const remoteChange: RemoteChange = {
      ...createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 105),
      clientId: 'local-client',
      localId: null
    };
    const { vm, mergeChanges, dispatchEvent } = createVersionManager([remoteChange], []);

    const result = await pullRepository(vm, 'public', 'PullConflictUser', {
      includeRelated: false,
      conflictResolver: new LWWConflictResolver()
    });

    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(0);
    expect(mergeChanges).not.toHaveBeenCalled();
    const conflictEvent = dispatchEvent.mock.calls.find(call => call[0] instanceof ConflictDetectedEvent)?.[0];
    expect(conflictEvent).toBeUndefined();
  });

  it('pullBatch should not re-apply own changes even when remote record has no localId', async () => {
    const remoteChange: RemoteChange = {
      ...createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 106),
      clientId: 'local-client',
      localId: null
    };
    const { vm, mergeChanges } = createVersionManager([remoteChange], []);

    const result = await pullBatch(vm, { limit: 100, fetchAll: false });

    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(0);
    expect(mergeChanges).not.toHaveBeenCalled();
  });

  it('pullRepository should still backfill remoteId when own change carries localId', async () => {
    const localChange = createLocalChange(entityId, '2026-01-01T10:00:00.000Z');
    const remoteChange: RemoteChange = {
      ...createRemoteChange(entityId, '2026-01-01T10:01:00.000Z', 107),
      clientId: 'local-client',
      localId: localChange.id
    };
    const { vm, mergeChanges } = createVersionManager([remoteChange], [localChange]);

    const result = await pullRepository(vm, 'public', 'PullConflictUser', {
      includeRelated: false,
      conflictResolver: new LWWConflictResolver()
    });

    expect(result.pulled).toBe(1);
    expect(result.applied).toBe(0);
    expect(localChange.remoteId).toBe(107);
    expect(mergeChanges).not.toHaveBeenCalled();
  });
});
