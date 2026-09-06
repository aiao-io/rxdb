import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType, UUID } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import { RepositorySyncErrorEvent, type RxDBEvent } from '../../rxdb-events.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { encodeRxDBChangeEntityId } from '../../system/change-codec.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { RemoteChange } from '../../system/system.interface.js';
import type { ConflictResolver } from '../../version/conflict.js';
import { pullRepository, type PullRepositoryResult } from '../../version/pull-repository.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { getRxDBChangeKey } from '../../version/VersionManager.utils.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

const FULL_SYNC: SyncOptions = {
  type: SyncType.Full,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'remote' }
};

@Entity({
  name: 'PullSliceItem',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullSliceItem extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullSliceParent',
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullSliceParent extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullSliceChild',
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullSliceParent',
      mappedProperty: 'children'
    }
  ]
})
class PullSliceChild extends EntityBase {
  value!: string;
}

const cascadeFilter = vi.fn((): RuleGroup => ({
  combinator: 'and',
  rules: [{ field: 'value', operator: '=', value: 'included' }]
}));

@Entity({
  name: 'PullFilterParent',
  sync: FULL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullFilterParent extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullFilterChild',
  sync: {
    type: SyncType.Filter,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'remote', filter: cascadeFilter }
  },
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullFilterParent',
      mappedProperty: 'children'
    }
  ]
})
class PullFilterChild extends EntityBase {
  value!: string;
}

// RXD-030：`SyncType.None` + 只配 local → `getSyncType` 判 `'local'`，
// 单仓路径会直接拒绝拉取（「没有 remote」）。级联路径此前根本不看这个策略。
@Entity({
  name: 'PullLocalOnlyParent',
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } },
  properties: [{ name: 'value', type: PropertyType.string }]
})
class PullLocalOnlyParent extends EntityBase {
  value!: string;
}

@Entity({
  name: 'PullPolicyChild',
  sync: FULL_SYNC,
  properties: [{ name: 'value', type: PropertyType.string }],
  relations: [
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'PullLocalOnlyParent',
      mappedProperty: 'children'
    }
  ]
})
class PullPolicyChild extends EntityBase {
  value!: string;
}

type PullChangesImplementation = (
  sinceId: number,
  limit: number,
  repositoryFilter?: string[],
  filter?: RuleGroup,
  branchId?: string
) => Promise<RemoteChange[]>;

type MergeChangesImplementation = (
  actions: SwitchVersionActions,
  localChanges?: unknown,
  disableTriggers?: boolean
) => Promise<void>;

interface HarnessOptions {
  entities?: EntityType[];
  sync?: SyncOptions;
  remoteChanges?: RemoteChange[];
  syncRecords?: RxDBSync[];
  localChanges?: RxDBChange[];
  pullChanges?: PullChangesImplementation;
  mergeChanges?: MergeChangesImplementation;
  clientId?: string;

  /** 当前激活分支，默认 `main` */
  currentBranchId?: string;

  /** 分支 id → 父分支 id，`getAncestorBranchIds` 沿它向上走 */
  branchParents?: Readonly<Record<string, string | null>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readRuleValue(options: unknown, field: string): unknown {
  if (!isRecord(options) || !isRecord(options['where'])) return undefined;
  const rules = options['where']['rules'];
  if (!Array.isArray(rules)) return undefined;

  for (const rule of rules) {
    if (isRecord(rule) && rule['field'] === field) return rule['value'];
  }

  return undefined;
}

// 同步记录按分支存：id 是 `${ns}:${entity}:${branchId}`，切分支就是换一条记录
function createSyncRecord(entity: string, lastPullRemoteChangeId: number | null = null, branchId = 'main'): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = `public:${entity}:${branchId}`;
  record.namespace = 'public';
  record.entity = entity;
  record.branchId = branchId;
  record.syncType = 'full';
  record.lastPushedChangeId = null;
  record.lastPushedAt = null;
  record.lastPulledAt = null;
  record.lastPullRemoteChangeId = lastPullRemoteChangeId;
  record.enabled = true;
  record.createdAt = new Date('2026-01-01T00:00:00.000Z');
  record.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return record;
}

function createRemoteChange(
  id: number,
  entity = 'PullSliceItem',
  entityId = `entity-${id}`,
  type: RemoteChange['type'] = 'UPDATE'
): RemoteChange {
  return {
    id,
    namespace: 'public',
    entity,
    entityId,
    branchId: 'main',
    type,
    patch: type === 'DELETE' ? null : { value: `remote-${id}` },
    inversePatch: type === 'INSERT' ? null : { value: `local-${id}` },
    createdAt: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`),
    updatedAt: new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`)
  };
}

function createLocalChange(entityId: string): RxDBChange {
  const change = Object.create(RxDBChange.prototype) as RxDBChange;
  change.id = 1;
  change.namespace = 'public';
  change.entity = 'PullSliceItem';
  change.entityId = entityId as UUID;
  change.branchId = 'main';
  change.type = 'UPDATE';
  change.patch = { value: 'local' };
  change.inversePatch = { value: 'base' };
  change.remoteId = null;
  change.revertChangeId = null;
  change.createdAt = new Date('2026-01-01T00:00:00.000Z');
  change.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return change;
}

function createHarness(options: HarnessOptions = {}) {
  const entities = options.entities ?? [PullSliceItem];
  const sync = 'sync' in options ? options.sync : FULL_SYNC;
  const remoteChanges = [...(options.remoteChanges ?? [])].sort((left, right) => left.id - right.id);
  const syncRecords =
    options.syncRecords ?
      [...options.syncRecords]
    : entities.map(EntityType => createSyncRecord(getEntityMetadata(EntityType).name));
  const localChanges = [...(options.localChanges ?? [])];

  const syncFind = vi.fn(async (query: unknown): Promise<RxDBSync[]> => {
    const id = readRuleValue(query, 'id');
    return typeof id === 'string' ? syncRecords.filter(record => record.id === id) : [];
  });
  const syncCreate = vi.fn(async (record: RxDBSync): Promise<RxDBSync> => {
    syncRecords.push(record);
    return record;
  });
  const syncUpdate = vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>): Promise<RxDBSync> => {
    Object.assign(record, patch);
    return record;
  });
  const syncRepository = {
    find: syncFind,
    count: vi.fn(async (): Promise<number> => syncRecords.length),
    create: syncCreate,
    update: syncUpdate,
    remove: vi.fn(async (record: RxDBSync): Promise<RxDBSync> => record)
  };

  const changeFind = vi.fn<(query: unknown) => Promise<RxDBChange[]>>(async () => [...localChanges]);
  const changeUpdate = vi.fn(async (change: RxDBChange, patch: Partial<RxDBChange>): Promise<RxDBChange> => {
    Object.assign(change, patch);
    return change;
  });
  const changeRepository = {
    find: changeFind,
    count: vi.fn(async (): Promise<number> => localChanges.length),
    create: vi.fn(async (change: RxDBChange): Promise<RxDBChange> => change),
    update: changeUpdate,
    remove: vi.fn(async (change: RxDBChange): Promise<RxDBChange> => change)
  };

  const mergeChanges = vi.fn(
    async (actions: SwitchVersionActions, localChangeBatch?: unknown, disableTriggers?: boolean): Promise<void> => {
      await options.mergeChanges?.(actions, localChangeBatch, disableTriggers);
    }
  );
  // 直通式事务 mock：真实适配器会在失败时回滚写入，这里只保证「异常会向上传播」，
  // 不模拟回滚——各测试断言的是「传播的错误」和「没有被提前落库的字段」，不依赖回滚语义。
  // C2：事务回调收到 executor；替身把 getRepository / mergeChanges 转发回本 mock 适配器
  const transaction = vi.fn(async (fn: (executor: never) => Promise<unknown>) =>
    fn(createTransactionExecutorStub({ getRepository, mergeChanges }) as never)
  );
  // `getAncestorBranchIds` 沿 parentId 逐级向上查，非 main 分支才会走到这里
  const branchParents = options.branchParents ?? {};
  const branchFind = vi.fn(async (query: unknown): Promise<RxDBBranch[]> => {
    const id = readRuleValue(query, 'id');
    if (typeof id !== 'string') return [];
    return [{ id, parentId: branchParents[id] ?? null } as RxDBBranch];
  });
  const branchRepository = { find: branchFind };

  const getRepository = vi.fn((EntityClass: unknown) => {
    if (EntityClass === RxDBSync) return syncRepository;
    if (EntityClass === RxDBChange) return changeRepository;
    if (EntityClass === RxDBBranch) return branchRepository;
    throw new Error('Unexpected local repository request');
  });
  const localAdapter = {
    getRepository,
    mergeChanges,
    transaction
  };

  const pullChanges = vi.fn(
    async (
      sinceId: number,
      limit: number,
      repositoryFilter?: string[],
      filter?: RuleGroup,
      branchId?: string
    ): Promise<RemoteChange[]> => {
      if (options.pullChanges) {
        return options.pullChanges(sinceId, limit, repositoryFilter, filter, branchId);
      }

      return remoteChanges
        .filter(change => change.id > sinceId)
        .filter(
          change => !repositoryFilter?.length || repositoryFilter.includes(`${change.namespace}:${change.entity}`)
        )
        .filter(change => branchId === undefined || change.branchId === branchId)
        .slice(0, limit);
    }
  );
  const remoteAdapter = { pullChanges };
  const dispatchEvent = vi.fn<(event: RxDBEvent) => void>();

  const vm = {
    rxdb: {
      config: { entities, sync },
      context: { clientId: options.clientId ?? 'local-client' },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: options.currentBranchId ?? 'main' }))
  } as unknown as VersionManager;

  return {
    vm,
    pullChanges,
    mergeChanges,
    transaction,
    syncRecords,
    syncCreate,
    syncUpdate,
    changeFind,
    changeUpdate,
    dispatchEvent
  };
}

describe('pullRepository', () => {
  it('空结果仍更新时间戳且保留已有游标', async () => {
    const syncRecord = createSyncRecord('PullSliceItem', 17);
    const harness = createHarness({ syncRecords: [syncRecord] });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });

    expect(harness.pullChanges).toHaveBeenCalledWith(17, 1000, ['public:PullSliceItem'], undefined, 'main');
    expect(result).toEqual({
      repository: { namespace: 'public', entity: 'PullSliceItem' },
      pulled: 0,
      compacted: 0,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      // 只写了 lastPulledAt 时间戳，没有任何同步进度落库
      persistedProgress: false,
      historyInvalidated: false,
      // RXD-030：`failures` 是必填字段，没有失败时是空数组而不是缺字段
      failures: []
    });
    expect(syncRecord.lastPullRemoteChangeId).toBe(17);
    expect(syncRecord.lastPulledAt).toBeInstanceOf(Date);
    expect(harness.syncUpdate.mock.calls[0]?.[1]).not.toHaveProperty('lastPullRemoteChangeId');
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('fetchAll 使用每批最后一个远端 id 继续拉取并更新最终游标', async () => {
    const syncRecord = createSyncRecord('PullSliceItem', 4);
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges: [createRemoteChange(5), createRemoteChange(9), createRemoteChange(12)]
    });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', {
      includeRelated: false,
      limit: 2,
      fetchAll: true
    });

    expect(harness.pullChanges.mock.calls.map(call => call[0])).toEqual([4, 9]);
    expect(result).toMatchObject({ pulled: 3, compacted: 0, applied: 3, hasMore: false });
    expect(syncRecord.lastPullRemoteChangeId).toBe(12);
    expect(harness.syncUpdate).toHaveBeenCalledTimes(2);
    expect(harness.mergeChanges).toHaveBeenCalledTimes(2);
  });

  it('fetchAll=false 在满批次边界停止并报告 hasMore', async () => {
    const syncRecord = createSyncRecord('PullSliceItem');
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges: [createRemoteChange(3), createRemoteChange(7), createRemoteChange(11)]
    });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', {
      includeRelated: false,
      limit: 2,
      fetchAll: false
    });

    expect(harness.pullChanges).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ pulled: 2, applied: 2, hasMore: true });
    expect(syncRecord.lastPullRemoteChangeId).toBe(7);
  });

  it('压缩同一实体的连续远端更新并按有效 action 计数', async () => {
    const entityId = 'same-entity';
    const syncRecord = createSyncRecord('PullSliceItem');
    const remoteChanges = [
      createRemoteChange(1, 'PullSliceItem', entityId),
      createRemoteChange(2, 'PullSliceItem', entityId)
    ];
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges
    });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });
    const actions = harness.mergeChanges.mock.calls[0]?.[0];

    expect(result).toMatchObject({ pulled: 2, compacted: 1, applied: 1, hasMore: false });
    expect(actions?.updates.size).toBe(1);
    expect(actions?.updates.get(getRxDBChangeKey(remoteChanges[1]!))?.patch).toEqual({ value: 'remote-2' });
    expect(harness.mergeChanges.mock.calls[0]?.[2]).toBe(true);
    expect(syncRecord.lastPullRemoteChangeId).toBe(2);
  });

  it('远端拉取错误原样传播且不推进同步状态', async () => {
    const transportError = new Error('remote unavailable');
    const syncRecord = createSyncRecord('PullSliceItem', 21);
    const harness = createHarness({
      syncRecords: [syncRecord],
      pullChanges: async () => Promise.reject(transportError)
    });

    await expect(pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false })).rejects.toBe(
      transportError
    );

    expect(syncRecord.lastPullRemoteChangeId).toBe(21);
    expect(harness.syncUpdate).not.toHaveBeenCalled();
    expect(harness.mergeChanges).not.toHaveBeenCalled();
    const errorEvent = harness.dispatchEvent.mock.calls
      .map(call => call[0])
      .find((event): event is RepositorySyncErrorEvent => event instanceof RepositorySyncErrorEvent);
    expect(errorEvent).toBeInstanceOf(RepositorySyncErrorEvent);
    expect(errorEvent?.error).toBe(transportError);
  });

  it('本地应用错误原样传播且不推进远端游标', async () => {
    const mergeError = new Error('local merge failed');
    const syncRecord = createSyncRecord('PullSliceItem');
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges: [createRemoteChange(1)],
      mergeChanges: async () => Promise.reject(mergeError)
    });

    await expect(pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false })).rejects.toBe(
      mergeError
    );

    expect(syncRecord.lastPullRemoteChangeId).toBeNull();
    expect(harness.syncUpdate).not.toHaveBeenCalled();
  });

  it('冲突解决器错误原样传播且不应用、不推进游标', async () => {
    const entityId = 'conflicted-entity';
    const resolverError = new Error('resolver failed');
    const resolver: ConflictResolver = {
      resolve: vi.fn(async () => Promise.reject(resolverError))
    };
    const syncRecord = createSyncRecord('PullSliceItem');
    const harness = createHarness({
      syncRecords: [syncRecord],
      localChanges: [createLocalChange(entityId)],
      remoteChanges: [createRemoteChange(1, 'PullSliceItem', entityId)]
    });

    await expect(
      pullRepository(harness.vm, 'public', 'PullSliceItem', {
        includeRelated: false,
        conflictResolver: resolver
      })
    ).rejects.toBe(resolverError);

    expect(resolver.resolve).toHaveBeenCalledTimes(1);
    expect(readRuleValue(harness.changeFind.mock.calls[0]?.[0], 'entityId')).toEqual([
      entityId,
      encodeRxDBChangeEntityId(entityId)
    ]);
    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect(harness.syncUpdate).not.toHaveBeenCalled();
    expect(syncRecord.lastPullRemoteChangeId).toBeNull();
  });

  it('依赖拉取失败时跳过目标仓库且不再请求目标实体', async () => {
    const dependencyError = new Error('parent pull failed');
    const harness = createHarness({
      entities: [PullSliceParent, PullSliceChild],
      pullChanges: async (_sinceId, _limit, repositoryFilter) => {
        if (repositoryFilter?.[0] === 'public:PullSliceParent') throw dependencyError;
        return [];
      }
    });

    // RXD-030：目标仓一条都没同步，这是失败不是「跳过」—— 必须 reject。
    // 依赖仓与目标仓都进失败清单（2 条），因此裹成 PartialSync 把聚合结果一并交出去，
    // cause 取最上游那个真错误而不是目标仓身上的合成错误。
    const thrown = await pullRepository(harness.vm, 'public', 'PullSliceChild', { includeRelated: true }).then(
      () => {
        throw new Error('expected pullRepository to reject');
      },
      (error: unknown) => error as RxDBPartialSyncError<PullRepositoryResult>
    );

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect(thrown.cause).toBe(dependencyError);
    expect(harness.pullChanges.mock.calls.map(call => call[2]?.[0])).toEqual(['public:PullSliceParent']);

    const result = thrown.result;
    expect(result).toMatchObject({
      repository: { namespace: 'public', entity: 'PullSliceChild' },
      success: false,
      skipped: 'dependency public:PullSliceParent failed',
      pulled: 0,
      applied: 0
    });
    expect(result.error).toMatchObject({ name: 'RxDBDependencyFailedError', cause: dependencyError });
    expect(result.relatedResults).toHaveLength(1);
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'PullSliceParent' },
      success: false,
      error: dependencyError
    });
  });

  it('级联按父子顺序拉取且 Full 父仓库不继承子仓库 filter', async () => {
    cascadeFilter.mockClear();
    const harness = createHarness({ entities: [PullFilterParent, PullFilterChild] });

    const result = await pullRepository(harness.vm, 'public', 'PullFilterChild', { includeRelated: true });

    expect(harness.pullChanges.mock.calls.map(call => call[2]?.[0])).toEqual([
      'public:PullFilterParent',
      'public:PullFilterChild'
    ]);
    expect(harness.pullChanges.mock.calls[0]?.[3]).toBeUndefined();
    expect(harness.pullChanges.mock.calls[1]?.[3]).toEqual({
      combinator: 'and',
      rules: [{ field: 'value', operator: '=', value: 'included' }]
    });
    expect(result.success).toBe(true);
    expect(result.relatedResults?.[0]?.repository.entity).toBe('PullFilterParent');
  });

  // RXD-030：级联里父仓的变更已经落库，目标仓自己却一条都没拉到。
  // 只看目标仓的计数会漏掉 relatedResults 的进度 —— 远端数据已进本地实体表，
  // 用户仍能 undo 回同步前状态。
  it('级联中依赖仓已落库时，目标仓无变更也要标记历史边界失效', async () => {
    const harness = createHarness({
      entities: [PullSliceParent, PullSliceChild],
      pullChanges: async (sinceId, _limit, repositoryFilter) => {
        if (repositoryFilter?.[0] !== 'public:PullSliceParent' || sinceId > 0) return [];
        return [createRemoteChange(1, 'PullSliceParent', 'parent-1')];
      }
    });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceChild', { includeRelated: true });

    expect(result.applied).toBe(0);
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'PullSliceParent' },
      applied: 1
    });
    expect(result.historyInvalidated).toBe(true);
    expect(result.persistedProgress).toBe(true);
  });

  // RXD-030：级联中途失败时，失败仓自己已提交的进度（RxDBPartialSyncError.result）
  // 被 catch 分支写死成 0；目标仓的 relatedResults 因此谎报「什么都没落库」。
  it('级联中依赖仓部分提交后失败，进度不能被抹成 0', async () => {
    const roundError = new Error('parent round 2 failed');
    let mergeCallCount = 0;
    const harness = createHarness({
      entities: [PullSliceParent, PullSliceChild],
      pullChanges: async (sinceId, limit, repositoryFilter) => {
        if (repositoryFilter?.[0] !== 'public:PullSliceParent') return [];
        return [
          createRemoteChange(1, 'PullSliceParent', 'parent-1'),
          createRemoteChange(2, 'PullSliceParent', 'parent-2'),
          createRemoteChange(3, 'PullSliceParent', 'parent-3')
        ]
          .filter(change => change.id > sinceId)
          .slice(0, limit);
      },
      mergeChanges: async () => {
        mergeCallCount += 1;
        if (mergeCallCount === 2) throw roundError;
      }
    });

    // RXD-030：依赖失败 → 目标仓没同步 → reject。父仓已提交的进度必须随
    // `RxDBPartialSyncError.result` 一起交出去，不能因为裸抛而丢失。
    const thrown = await pullRepository(harness.vm, 'public', 'PullSliceChild', {
      includeRelated: true,
      limit: 2,
      fetchAll: true
    }).then(
      () => {
        throw new Error('expected pullRepository to reject');
      },
      (error: unknown) => error as RxDBPartialSyncError<PullRepositoryResult>
    );

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect(thrown.cause).toBe(roundError);

    const result = thrown.result;
    expect(result.skipped).toBe('dependency public:PullSliceParent failed');
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'PullSliceParent' },
      success: false,
      error: roundError,
      applied: 2
    });
    // 父仓的两条变更已经落库，历史边界必须随之推进
    expect(result.historyInvalidated).toBe(true);
  });

  it('fetchAll 穷尽恰好一个满批次后应返回 hasMore=false', async () => {
    const syncRecord = createSyncRecord('PullSliceItem');
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges: [createRemoteChange(1), createRemoteChange(2)]
    });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', {
      includeRelated: false,
      limit: 2,
      fetchAll: true
    });

    expect(harness.pullChanges.mock.calls.map(call => call[0])).toEqual([0, 2]);
    expect(result.hasMore).toBe(false);
  });

  // RXD-031 D：跨多轮 fetchAll 时第一轮已真实落库（事务已提交），第二轮失败不能裸抛，
  // 否则调用方（VersionManager.pullRepository）以为「什么都没发生」而清除 undo 边界
  it('fetchAll 多轮拉取中第二轮失败时，抛出携带已提交轮次进度的 RxDBPartialSyncError', async () => {
    const syncRecord = createSyncRecord('PullSliceItem');
    let mergeCallCount = 0;
    const roundError = new Error('round 2 merge failed');
    const harness = createHarness({
      syncRecords: [syncRecord],
      remoteChanges: [createRemoteChange(1), createRemoteChange(2), createRemoteChange(3)],
      mergeChanges: async () => {
        mergeCallCount += 1;
        if (mergeCallCount === 2) {
          throw roundError;
        }
      }
    });

    const thrown: unknown = await pullRepository(harness.vm, 'public', 'PullSliceItem', {
      includeRelated: false,
      limit: 2,
      fetchAll: true
    }).catch(error => error);

    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    expect((thrown as RxDBPartialSyncError).cause).toBe(roundError);
    expect((thrown as RxDBPartialSyncError).result).toMatchObject({
      repository: { namespace: 'public', entity: 'PullSliceItem' },
      applied: 2
    });
    // 第二轮事务失败：水位线不应推进到第二轮拉取到的 id
    expect(syncRecord.lastPullRemoteChangeId).toBe(2);
    expect(harness.mergeChanges).toHaveBeenCalledTimes(2);
  });

  it('KEEP_REMOTE 后本地应用失败不应提前把本地变更标记为已同步', async () => {
    const entityId = 'atomic-conflict';
    const mergeError = new Error('merge failed after resolution');
    const localChange = createLocalChange(entityId);
    const syncRecord = createSyncRecord('PullSliceItem');
    const resolver: ConflictResolver = {
      resolve: vi.fn(async () => ({ type: 'KEEP_REMOTE' as const }))
    };
    const harness = createHarness({
      syncRecords: [syncRecord],
      localChanges: [localChange],
      remoteChanges: [createRemoteChange(1, 'PullSliceItem', entityId)],
      mergeChanges: async () => Promise.reject(mergeError)
    });

    await expect(
      pullRepository(harness.vm, 'public', 'PullSliceItem', {
        includeRelated: false,
        conflictResolver: resolver
      })
    ).rejects.toBe(mergeError);

    expect(syncRecord.lastPullRemoteChangeId).toBeNull();
    expect(localChange.remoteId).toBeNull();
  });
});

// RXD-030 残留：级联调度自身的契约（与结果计数字段无关）。
//
// 两条缺陷：
// 1. 依赖失败时目标仓被包成 `skipped: 'Dependency failed'` 并 **resolve** ——
//    调用方 `await pullRepository(...)` 拿到一个成功的 Promise，而目标仓一条都没拉。
//    失败根因只留下一个自由文本字符串，既不说是哪个依赖挂了，也不说为什么。
// 2. 级联节点直接调 `pullSingleRepository`，绕过单仓路径那套 `syncType` 资格校验 ——
//    `local` / `none` 的依赖仓照样被拿去问远端要数据，等于绕过它自己的同步策略。
describe('pullRepository 级联调度契约（RXD-030）', () => {
  it('依赖失败时目标仓必须 reject，而不是 resolve 出一个 skipped 结果', async () => {
    const dependencyError = new Error('parent pull failed');
    const harness = createHarness({
      entities: [PullSliceParent, PullSliceChild],
      pullChanges: async (_sinceId, _limit, repositoryFilter) => {
        if (repositoryFilter?.[0] === 'public:PullSliceParent') throw dependencyError;
        return [];
      }
    });

    const error = await pullRepository(harness.vm, 'public', 'PullSliceChild', { includeRelated: true }).then(
      result => result,
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(RxDBPartialSyncError);
    // 根因必须是依赖仓的原始错误，而不是「级联被阻断」这层合成错误
    expect((error as RxDBPartialSyncError).cause).toBe(dependencyError);
  });

  it('被依赖阻断时结构化上报全部失败仓库，且指明是哪个依赖', async () => {
    const dependencyError = new Error('parent pull failed');
    const harness = createHarness({
      entities: [PullSliceParent, PullSliceChild],
      pullChanges: async (_sinceId, _limit, repositoryFilter) => {
        if (repositoryFilter?.[0] === 'public:PullSliceParent') throw dependencyError;
        return [];
      }
    });

    const error = (await pullRepository(harness.vm, 'public', 'PullSliceChild', { includeRelated: true }).then(
      result => result,
      (reason: unknown) => reason
    )) as RxDBPartialSyncError<PullRepositoryResult>;

    const result = error.result;
    expect(result.failures).toEqual([
      { repository: { namespace: 'public', entity: 'PullSliceParent' }, error: dependencyError },
      {
        repository: { namespace: 'public', entity: 'PullSliceChild' },
        error: expect.objectContaining({ name: 'RxDBDependencyFailedError' })
      }
    ]);
    expect(result.failures[1]?.error).toMatchObject({
      dependency: { namespace: 'public', entity: 'PullSliceParent' },
      cause: dependencyError
    });
    // 聚合结果仍要交出去：依赖仓的 relatedResults 不能随着 reject 一起消失
    expect(result.relatedResults?.[0]?.repository.entity).toBe('PullSliceParent');
  });

  it('级联依赖 syncType=local 时按策略跳过，不向远端请求该仓', async () => {
    const harness = createHarness({ entities: [PullLocalOnlyParent, PullPolicyChild] });

    const result = await pullRepository(harness.vm, 'public', 'PullPolicyChild', { includeRelated: true });

    expect(harness.pullChanges.mock.calls.map(call => call[2]?.[0])).toEqual(['public:PullPolicyChild']);
    expect(result.success).toBe(true);
    expect(result.failures).toEqual([]);
    // 按策略跳过不是失败：不进 failures，也不能阻断下游
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'PullLocalOnlyParent' },
      success: true,
      skipped: "syncType is 'local' (no remote)"
    });
  });

  it('单仓成功时 failures 是空数组而不是缺字段', async () => {
    const harness = createHarness();

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });

    expect(result.failures).toEqual([]);
  });
});

// RXD-029：`RxDBSync.enabled` 此前只被状态展示读取，没有任何一条调度路径看过它 ——
// 用户在 UI 上把某个仓库的同步关掉，下一次 pull 照拉不误。
describe('pullRepository 尊重 RxDBSync.enabled（RXD-029）', () => {
  it('enabled = false 时拒绝拉取，且不碰远端', async () => {
    const syncRecord = createSyncRecord('PullSliceItem', 3);
    syncRecord.enabled = false;
    const harness = createHarness({ syncRecords: [syncRecord], remoteChanges: [createRemoteChange(4)] });

    await expect(pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false })).rejects.toThrow(
      /sync is disabled/
    );

    expect(harness.pullChanges).not.toHaveBeenCalled();
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('enabled = true 时照常拉取（守卫：开关不能一刀切把所有仓库挡掉）', async () => {
    const syncRecord = createSyncRecord('PullSliceItem', 3);
    const harness = createHarness({ syncRecords: [syncRecord], remoteChanges: [createRemoteChange(4)] });

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });

    expect(result.pulled).toBe(1);
    expect(harness.pullChanges).toHaveBeenCalled();
  });
});

/**
 * 单仓拉取的分支范围必须覆盖整条祖先链，与 `pullBatch` / `pushRepository` 同口径。
 *
 * 分支是 patch 模型：建分支只写 `parentId` + `fromChangeId`，一条变更都不复制，
 * 父分支上的记录**物理上仍归属父分支**。`pullChanges` 的 `branchId` 是精确匹配，
 * 只传当前分支时，别人推到 main 的变更在 feature 分支上永远拉不到，
 * 而且不会自愈 —— 切回 main 时水位线换成另一条记录，那段区间从此被跳过。
 */
describe('pullRepository 的分支范围覆盖祖先链', () => {
  const featureHarness = (remoteChanges: RemoteChange[]) =>
    createHarness({
      currentBranchId: 'feature',
      branchParents: { feature: 'main', main: null },
      syncRecords: [createSyncRecord('PullSliceItem', null, 'feature')],
      remoteChanges
    });

  const onBranch = (id: number, branchId: string): RemoteChange => {
    const change = createRemoteChange(id);
    change.branchId = branchId;
    return change;
  };

  it('父分支上的变更也要拉下来，而不是只看当前分支', async () => {
    const harness = featureHarness([onBranch(1, 'main'), onBranch(2, 'feature')]);

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });

    expect(harness.pullChanges.mock.calls.map(call => call[4])).toEqual(['feature', 'main']);
    expect(result.pulled).toBe(2);
    expect(result.applied).toBe(2);
  });

  it('在 main 上时只发一次请求（守卫：不能给每个仓都多发一轮）', async () => {
    const harness = createHarness({ remoteChanges: [createRemoteChange(1)] });

    await pullRepository(harness.vm, 'public', 'PullSliceItem', { includeRelated: false });

    expect(harness.pullChanges.mock.calls.map(call => call[4])).toEqual(['main']);
  });

  /**
   * 每条分支各自取满 `limit` 条后直接拼接，是三种错法叠在一起：
   *
   * - 不排序、只截断 → 水位线被高 id 推过另一分支尚未消费的低 id，那些变更此后
   *   永远不满足 `id > lastPullRemoteChangeId`，静默丢失；
   * - 不截断 → 单轮实际消费 `limit × 分支数` 条，`limit` 形同虚设；
   * - 不排序、不截断 → 水位线取末元素，取决于分支返回顺序，已应用的变更下轮重放。
   *
   * 正确做法只有一个：合并后按 id 全局排序，再截断到 `limit`。
   */
  it('跨分支合并后按 id 全局排序再截断，水位线不会跨过未消费的低 id', async () => {
    // 低 id 在父分支、高 id 在当前分支：三种错法都会在这个布局上露馅
    const harness = featureHarness([
      onBranch(1, 'main'),
      onBranch(2, 'main'),
      onBranch(3, 'feature'),
      onBranch(4, 'feature')
    ]);

    const result = await pullRepository(harness.vm, 'public', 'PullSliceItem', {
      includeRelated: false,
      limit: 2
    });

    // 本轮只消费 id 1、2；水位线停在 2，id 3、4 留给下一轮
    expect(result.pulled).toBe(2);
    expect(result.applied).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(harness.syncRecords[0].lastPullRemoteChangeId).toBe(2);
  });
});
