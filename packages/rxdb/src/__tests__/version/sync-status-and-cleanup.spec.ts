import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';
import type { OperatorName, Rule, RuleGroup } from '../../repository/query.interface.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';
import { RxDBBranch } from '../../system/branch.js';
import { getRxDBEntityIdentityKey } from '../../system/change-codec.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import { checkRepositoryUpdates } from '../../version/check-repository-updates.js';
import { cleanupExpired } from '../../version/cleanup-expired.js';
import { getAllRepositorySyncStatus } from '../../version/get-all-repository-sync-status.js';
import { getRepositorySyncStatus } from '../../version/get-repository-sync-status.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { createTransactionExecutorStub } from '../fixtures/transaction-executor-stub.js';

const LOCAL_ADAPTER_OPTIONS = { adapter: 'local' };
const REMOTE_ADAPTER_OPTIONS = { adapter: 'remote' };
const FULL_SYNC: SyncOptions = {
  type: SyncType.Full,
  local: LOCAL_ADAPTER_OPTIONS,
  remote: REMOTE_ADAPTER_OPTIONS
};
const REMOTE_SYNC: SyncOptions = {
  type: SyncType.None,
  remote: REMOTE_ADAPTER_OPTIONS
};
const LOCAL_SYNC: SyncOptions = {
  type: SyncType.None,
  local: LOCAL_ADAPTER_OPTIONS
};
const NONE_SYNC: SyncOptions = {
  type: SyncType.None,
  local: LOCAL_ADAPTER_OPTIONS,
  remote: REMOTE_ADAPTER_OPTIONS
};

interface QueryRule {
  field: string;
  operator: string;
  value?: unknown;
}

interface QueryOptions {
  where?: {
    combinator: 'and' | 'or';
    rules: QueryRule[];
  };
  limit?: number;
}

interface RemoteCount {
  count: number;
  latestChangeId: number;
}

interface StatusHarnessOptions {
  entities: EntityType[];
  syncRecords?: ReadonlyMap<string, RxDBSync>;
  changeCounts?: ReadonlyMap<string, number>;
  remoteCounts?: ReadonlyMap<string, RemoteCount>;
  remoteConfigured?: boolean;
  branchId?: string;
  globalSync?: SyncOptions;
}

type SyncFind = (options: QueryOptions) => Promise<RxDBSync[]>;
type ChangeFind = (options: QueryOptions) => Promise<RxDBChange[]>;
type GetChangeCount = (sinceId: number, repositoryFilter?: string[], branchId?: string) => Promise<RemoteCount>;

function createEntityType(name: string, sync?: SyncOptions, namespace = 'public'): EntityType {
  class CoverageEntity {
    id = '';
  }

  Object.defineProperty(CoverageEntity, METADATA, {
    value: { name, namespace, sync } as unknown as EntityMetadata
  });
  return CoverageEntity as EntityType;
}

function createSyncRecord(entity: string, branchId: string, overrides: Partial<RxDBSync> = {}): RxDBSync {
  return Object.assign(Object.create(RxDBSync.prototype) as RxDBSync, {
    id: `public:${entity}:${branchId}`,
    namespace: 'public',
    entity,
    branchId,
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
}

function createChanges(count: number): RxDBChange[] {
  return Array.from({ length: count }, () => Object.create(RxDBChange.prototype) as RxDBChange);
}

function getStringRuleValue(options: QueryOptions, field: string): string {
  const value = options.where?.rules.find(rule => rule.field === field)?.value;
  if (typeof value !== 'string') {
    throw new Error(`Missing ${field} query rule`);
  }
  return value;
}

function createStatusHarness(options: StatusHarnessOptions) {
  const branchId = options.branchId ?? 'main';
  const syncFind = vi.fn<SyncFind>(async query => {
    const record = options.syncRecords?.get(getStringRuleValue(query, 'id'));
    return record ? [record] : [];
  });
  const changeFind = vi.fn<ChangeFind>(async query => {
    const entity = getStringRuleValue(query, 'entity');
    const count = options.changeCounts?.get(entity);
    if (count === undefined) {
      throw new Error(`Missing change count for ${entity}`);
    }
    return createChanges(count);
  });
  const syncRepository = { find: syncFind };
  const changeRepository = { find: changeFind };
  // 远端计数覆盖整条祖先链，`getAncestorBranchIds` 会沿 parentId 上溯；本文件的分支都挂在 main 下
  const branchFind = vi.fn(async (): Promise<RxDBBranch[]> => [{ id: branchId, parentId: 'main' } as RxDBBranch]);
  const branchRepository = { find: branchFind };
  const getRepository = vi.fn((EntityClass: unknown) => {
    if (EntityClass === RxDBSync) return syncRepository;
    if (EntityClass === RxDBChange) return changeRepository;
    if (EntityClass === RxDBBranch) return branchRepository;
    throw new Error('Unexpected repository request');
  });
  const localAdapter = { getRepository };
  const getChangeCount = vi.fn<GetChangeCount>(async (_sinceId, repositoryFilter, queriedBranchId) => {
    const entity = repositoryFilter?.[0];
    if (!entity) {
      throw new Error('Missing remote repository filter');
    }
    // `remoteCounts` 描述的是**当前分支**上的远端变更；祖先分支上没有，返回零。
    // 计数跨祖先链相加，用同一个值应答所有分支会让每条祖先都凭空翻一倍。
    if (queriedBranchId !== branchId) return { count: 0, latestChangeId: 0 };
    const result = options.remoteCounts?.get(entity);
    if (!result) {
      throw new Error(`Missing remote count for ${entity}`);
    }
    return result;
  });
  const remoteAdapter = options.remoteConfigured === false ? undefined : { getChangeCount };
  const getCurrentBranch = vi.fn(async () => ({ id: branchId }));
  const getLocalRepositories = vi.fn(async () => ({ adapter: localAdapter }));
  const getRemoteRepositories = vi.fn(async () => ({ adapter: remoteAdapter }));
  const rxdb = {
    config: {
      entities: options.entities,
      sync: options.globalSync
    },
    versionManager: {
      getCurrentBranch,
      getLocalRepositories,
      getRemoteRepositories
    }
  } as unknown as RxDB;

  return {
    changeFind,
    getChangeCount,
    getCurrentBranch,
    getLocalRepositories,
    getRemoteRepositories,
    rxdb,
    syncFind
  };
}

interface CleanupRecord {
  id: string;
}

interface CleanupHarnessOptions {
  entities?: EntityType[];
  records?: CleanupRecord[];
  sync?: SyncOptions;
}

type CleanupFind = (options: { where: RuleGroup }) => Promise<CleanupRecord[]>;
type MergeChanges = (actions: SwitchVersionActions, localChanges?: unknown, disableTriggers?: boolean) => Promise<void>;

function createFilterSync(filter: () => RuleGroup): SyncOptions {
  return {
    type: SyncType.Filter,
    local: LOCAL_ADAPTER_OPTIONS,
    remote: { ...REMOTE_ADAPTER_OPTIONS, filter }
  };
}

function createCleanupHarness(options: CleanupHarnessOptions = {}) {
  const Entity = createEntityType('Order', options.sync);
  const entities = options.entities ?? [createEntityType('Other', LOCAL_SYNC), Entity];
  const find = vi.fn<CleanupFind>(async () => options.records ?? []);
  const repository = { find };
  // cleanup 会另查 RxDBChange 以确认候选没有未推送变更；本套用例不构造未推送记录
  const changeRepository = { find: vi.fn(async () => []) };
  const getRepository = vi.fn((EntityType: unknown) => (EntityType === RxDBChange ? changeRepository : repository));
  const mergeChanges = vi.fn<MergeChanges>(async () => undefined);
  // 复核 + 保护性检查 + 删除必须同事务，harness 需提供 transaction
  // C2：事务回调收到 executor；替身把 getRepository / mergeChanges 转发回本 mock 适配器
  const transaction = vi.fn(async (fn: (executor: never) => Promise<unknown>) =>
    fn(createTransactionExecutorStub({ getRepository, mergeChanges }) as never)
  );
  const adapter = { getRepository, mergeChanges, transaction };
  const getLocalRepositories = vi.fn(async () => ({ adapter }));
  const vm = {
    rxdb: {
      config: {
        entities,
        sync: undefined
      }
    },
    getLocalRepositories
  } as unknown as VersionManager;

  return { Entity, find, getRepository, mergeChanges, transaction, vm };
}

function createRule(operator: string): Rule {
  return { field: 'value', operator, value: 'sample' } as unknown as Rule;
}

function createFilter(operator: string): RuleGroup {
  return {
    combinator: 'and',
    rules: [createRule(operator)]
  };
}

const OPERATOR_INVERSIONS = [
  ['=', '!='],
  ['!=', '='],
  ['<', '>='],
  ['<=', '>'],
  ['>', '<='],
  ['>=', '<'],
  ['in', 'notIn'],
  ['notIn', 'in'],
  ['contains', 'notContains'],
  ['notContains', 'contains'],
  ['startsWith', 'notStartsWith'],
  ['notStartsWith', 'startsWith'],
  ['endsWith', 'notEndsWith'],
  ['notEndsWith', 'endsWith'],
  ['between', 'notBetween'],
  ['notBetween', 'between'],
  ['null', 'notNull'],
  ['notNull', 'null'],
  ['exists', 'notExists'],
  ['notExists', 'exists']
] as const satisfies ReadonlyArray<readonly [OperatorName, OperatorName]>;

function repositoryNames(statuses: Awaited<ReturnType<typeof getAllRepositorySyncStatus>>): string[] {
  return statuses.map(status => status.repository.entity);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('仓库同步状态查询', () => {
  it('cascades through configured repositories and composes every status filter', async () => {
    const branchId = 'feature';
    const filterEntity = createEntityType(
      'FilteredOrder',
      createFilterSync(() => createFilter('='))
    );
    const remoteEntity = createEntityType('RemoteFeed', REMOTE_SYNC);
    const localEntity = createEntityType('LocalDraft', LOCAL_SYNC);
    const noneEntity = createEntityType('AuditLog', NONE_SYNC);
    const lastPushedAt = new Date('2026-06-01T01:00:00.000Z');
    const lastPulledAt = new Date('2026-06-02T02:00:00.000Z');
    const syncRecords = new Map<string, RxDBSync>([
      [
        `public:FilteredOrder:${branchId}`,
        createSyncRecord('FilteredOrder', branchId, {
          syncType: 'filter',
          lastPushedChangeId: 5,
          lastPushedAt,
          lastPulledAt,
          lastPullRemoteChangeId: 9
        })
      ],
      [
        `public:LocalDraft:${branchId}`,
        createSyncRecord('LocalDraft', branchId, {
          syncType: 'local',
          enabled: false
        })
      ],
      [
        `public:AuditLog:${branchId}`,
        createSyncRecord('AuditLog', branchId, {
          syncType: 'none',
          enabled: true
        })
      ]
    ]);
    const harness = createStatusHarness({
      branchId,
      changeCounts: new Map([
        ['FilteredOrder', 2],
        ['LocalDraft', 0]
      ]),
      entities: [filterEntity, remoteEntity, localEntity, noneEntity],
      remoteCounts: new Map([
        ['public:FilteredOrder', { count: 0, latestChangeId: 9 }],
        ['public:RemoteFeed', { count: 3, latestChangeId: 3 }]
      ]),
      syncRecords
    });

    const statuses = await getAllRepositorySyncStatus(harness.rxdb);

    expect(statuses).toEqual([
      {
        repository: { namespace: 'public', entity: 'FilteredOrder' },
        branchId,
        syncType: 'filter',
        enabled: true,
        lastPushedChangeId: 5,
        lastPushedAt,
        lastPulledAt,
        lastPullRemoteChangeId: 9,
        pushableCount: 2,
        pullableCount: 0
      },
      {
        repository: { namespace: 'public', entity: 'RemoteFeed' },
        branchId,
        syncType: 'remote',
        enabled: true,
        lastPushedChangeId: null,
        lastPushedAt: null,
        lastPulledAt: null,
        lastPullRemoteChangeId: null,
        pushableCount: 0,
        pullableCount: 3
      },
      {
        repository: { namespace: 'public', entity: 'LocalDraft' },
        branchId,
        syncType: 'local',
        enabled: false,
        lastPushedChangeId: null,
        lastPushedAt: null,
        lastPulledAt: null,
        lastPullRemoteChangeId: null,
        pushableCount: 0,
        pullableCount: 0
      },
      {
        repository: { namespace: 'public', entity: 'AuditLog' },
        branchId,
        syncType: 'none',
        enabled: false,
        lastPushedChangeId: null,
        lastPushedAt: null,
        lastPulledAt: null,
        lastPullRemoteChangeId: null,
        pushableCount: 0,
        pullableCount: 0
      }
    ]);
    expect(harness.changeFind.mock.calls[0][0].where?.rules).toContainEqual({
      field: 'id',
      operator: '>',
      value: 5
    });
    // 原先的第二次扫描来自 local-only 实体；它已被认定为不可推，不再白扫一遍变更表
    expect(harness.changeFind).toHaveBeenCalledTimes(1);
    // 每个仓库按自己的水位线问，且覆盖整条祖先链（当前分支 + main）——
    // 只问当前分支会漏掉父分支上的变更，`pullableCount` 归零而 pull 其实还有东西要拉
    expect(harness.getChangeCount).toHaveBeenCalledTimes(4);
    expect(harness.getChangeCount.mock.calls).toEqual(
      expect.arrayContaining([
        [9, ['public:FilteredOrder'], branchId],
        [9, ['public:FilteredOrder'], 'main'],
        [0, ['public:RemoteFeed'], branchId],
        [0, ['public:RemoteFeed'], 'main']
      ])
    );

    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'FilteredOrder')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'FilteredOrder' },
      remoteLatestChangeId: 9,
      localLastPullRemoteChangeId: 9,
      pendingCount: 0,
      hasUpdates: false
    });
    await expect(checkRepositoryUpdates(harness.rxdb, 'public', 'RemoteFeed')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'RemoteFeed' },
      remoteLatestChangeId: 3,
      localLastPullRemoteChangeId: null,
      pendingCount: 3,
      hasUpdates: true
    });

    expect(repositoryNames(await getAllRepositorySyncStatus(harness.rxdb, { syncType: [] }))).toEqual([
      'FilteredOrder',
      'RemoteFeed',
      'LocalDraft',
      'AuditLog'
    ]);
    expect(
      repositoryNames(
        await getAllRepositorySyncStatus(harness.rxdb, {
          syncType: ['filter', 'remote'],
          enabled: true,
          hasPendingChanges: true
        })
      )
    ).toEqual(['FilteredOrder', 'RemoteFeed']);
    expect(
      repositoryNames(
        await getAllRepositorySyncStatus(harness.rxdb, {
          enabled: false,
          hasPendingChanges: false
        })
      )
    ).toEqual(['LocalDraft', 'AuditLog']);
    expect(repositoryNames(await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: true }))).toEqual([
      'FilteredOrder',
      'RemoteFeed'
    ]);
    expect(repositoryNames(await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: false }))).toEqual([
      'LocalDraft',
      'AuditLog'
    ]);
    await expect(getAllRepositorySyncStatus(harness.rxdb, { syncType: ['full'] })).resolves.toEqual([]);
  });

  it('covers empty, local-only, missing-entity, and remote failure boundaries', async () => {
    const emptyHarness = createStatusHarness({ entities: [] });
    await expect(getAllRepositorySyncStatus(emptyHarness.rxdb)).resolves.toEqual([]);

    const otherNamespace = createEntityType('Wanted', FULL_SYNC, 'private');
    const otherEntity = createEntityType('Other', FULL_SYNC);
    const missingHarness = createStatusHarness({ entities: [otherNamespace, otherEntity] });
    await expect(getRepositorySyncStatus(missingHarness.rxdb, 'public', 'Wanted')).rejects.toThrow(
      'Entity not found: public.Wanted'
    );
    await expect(checkRepositoryUpdates(missingHarness.rxdb, 'public', 'Wanted')).rejects.toThrow(
      'Entity not found: public.Wanted'
    );
    expect(missingHarness.getCurrentBranch).not.toHaveBeenCalled();

    const localEntity = createEntityType('DeviceDraft', LOCAL_SYNC);
    const localHarness = createStatusHarness({ entities: [localEntity] });
    await expect(checkRepositoryUpdates(localHarness.rxdb, 'public', 'DeviceDraft')).resolves.toEqual({
      repository: { namespace: 'public', entity: 'DeviceDraft' },
      remoteLatestChangeId: 0,
      localLastPullRemoteChangeId: null,
      pendingCount: 0,
      hasUpdates: false
    });
    expect(localHarness.getCurrentBranch).not.toHaveBeenCalled();

    const filterEntity = createEntityType(
      'UnavailableRemote',
      createFilterSync(() => createFilter('='))
    );
    const unavailableHarness = createStatusHarness({
      changeCounts: new Map([['UnavailableRemote', 1]]),
      entities: [filterEntity],
      remoteConfigured: false
    });
    await expect(checkRepositoryUpdates(unavailableHarness.rxdb, 'public', 'UnavailableRemote')).rejects.toThrow(
      'Remote adapter not configured'
    );

    await expect(getRepositorySyncStatus(unavailableHarness.rxdb, 'public', 'UnavailableRemote')).rejects.toThrow(
      'Remote adapter not configured'
    );
  });

  it('uses the global full-sync fallback with default watermarks', async () => {
    const inheritedEntity = createEntityType('InheritedSync');
    const harness = createStatusHarness({
      changeCounts: new Map([['InheritedSync', 0]]),
      entities: [inheritedEntity],
      globalSync: FULL_SYNC,
      remoteCounts: new Map([['public:InheritedSync', { count: 1, latestChangeId: 4 }]])
    });

    await expect(getRepositorySyncStatus(harness.rxdb, 'public', 'InheritedSync')).resolves.toMatchObject({
      syncType: 'full',
      enabled: true,
      lastPushedChangeId: null,
      lastPullRemoteChangeId: null,
      pushableCount: 0,
      pullableCount: 1
    });
    expect(harness.changeFind.mock.calls[0][0].where?.rules).not.toContainEqual(
      expect.objectContaining({ field: 'id' })
    );
    expect(harness.getChangeCount).toHaveBeenCalledWith(0, ['public:InheritedSync'], 'main');
  });
});

describe('过期记录清理', () => {
  it('inverts every operator and nested group through the real cleanup query', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => createFilter('!='));
    const harness = createCleanupHarness({ sync: createFilterSync(metadataFilter) });
    const filter: RuleGroup = {
      combinator: 'and',
      rules: [
        ...OPERATOR_INVERSIONS.map(([operator]) => createRule(operator)),
        {
          combinator: 'or',
          rules: [createRule('=')]
        }
      ]
    };

    await expect(cleanupExpired(harness.vm, 'public', 'Order', { filter })).resolves.toEqual({
      removed: 0,
      removedIds: []
    });
    expect(metadataFilter).not.toHaveBeenCalled();
    expect(harness.find).toHaveBeenCalledWith({
      where: {
        combinator: 'or',
        rules: [
          ...OPERATOR_INVERSIONS.map(([, invertedOperator]) => ({
            field: 'value',
            operator: invertedOperator,
            value: 'sample'
          })),
          {
            combinator: 'and',
            rules: [{ field: 'value', operator: '!=', value: 'sample' }]
          }
        ]
      }
    });
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('uses the metadata filter for dry runs without deleting records', async () => {
    const metadataFilter = vi.fn<() => RuleGroup>(() => createFilter('>='));
    const harness = createCleanupHarness({
      records: [{ id: 'expired-1' }, { id: 'expired-2' }],
      sync: createFilterSync(metadataFilter)
    });

    await expect(cleanupExpired(harness.vm, 'public', 'Order', { dryRun: true })).resolves.toEqual({
      removed: 2,
      removedIds: ['expired-1', 'expired-2']
    });
    expect(metadataFilter).toHaveBeenCalledTimes(1);
    expect(harness.find).toHaveBeenCalledWith({
      where: {
        combinator: 'or',
        rules: [{ field: 'value', operator: '<', value: 'sample' }]
      }
    });
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('deletes all expired records in one trigger-free merge action', async () => {
    const harness = createCleanupHarness({ records: [{ id: 'expired-1' }, { id: 'expired-2' }] });

    await expect(cleanupExpired(harness.vm, 'public', 'Order', { filter: createFilter('=') })).resolves.toEqual({
      removed: 2,
      removedIds: ['expired-1', 'expired-2']
    });
    expect(harness.getRepository).toHaveBeenCalledWith(harness.Entity);
    expect(harness.mergeChanges).toHaveBeenCalledTimes(1);
    const [actions, localChanges, disableTriggers] = harness.mergeChanges.mock.calls[0];
    expect([...actions.deletes]).toEqual([
      [`public:Order:${getRxDBEntityIdentityKey('expired-1')}`, { patch: null, inversePatch: null }],
      [`public:Order:${getRxDBEntityIdentityKey('expired-2')}`, { patch: null, inversePatch: null }]
    ]);
    expect(actions.updates.size).toBe(0);
    expect(actions.inserts.size).toBe(0);
    expect(localChanges).toBeUndefined();
    expect(disableTriggers).toBe(true);
  });

  it('surfaces entity, filter callback, missing filter, and invalid operator errors', async () => {
    const missingHarness = createCleanupHarness({
      entities: [createEntityType('Order', FULL_SYNC, 'private'), createEntityType('Other', FULL_SYNC)]
    });
    await expect(cleanupExpired(missingHarness.vm, 'public', 'Order', { filter: createFilter('=') })).rejects.toThrow(
      'Entity not found: public:Order'
    );
    expect(missingHarness.getRepository).not.toHaveBeenCalled();

    const noFilterHarness = createCleanupHarness({ sync: LOCAL_SYNC });
    await expect(cleanupExpired(noFilterHarness.vm, 'public', 'Order')).rejects.toThrow(
      'No filter provided and entity public:Order does not have a Filter sync configuration.'
    );

    const missingCallbackSync = {
      type: SyncType.Filter,
      local: LOCAL_ADAPTER_OPTIONS,
      remote: REMOTE_ADAPTER_OPTIONS
    } as unknown as SyncOptions;
    const missingCallbackHarness = createCleanupHarness({ sync: missingCallbackSync });
    await expect(cleanupExpired(missingCallbackHarness.vm, 'public', 'Order')).rejects.toThrow(
      'No filter provided and entity public:Order does not have a Filter sync configuration.'
    );

    const errorFilter = vi.fn<() => RuleGroup>(() => {
      throw new Error('window failed');
    });
    const errorHarness = createCleanupHarness({ sync: createFilterSync(errorFilter) });
    await expect(cleanupExpired(errorHarness.vm, 'public', 'Order')).rejects.toThrow(
      'Filter function failed for public:Order: window failed'
    );
    expect(errorHarness.find).not.toHaveBeenCalled();

    const nonErrorFilter = vi.fn<() => RuleGroup>(() => {
      throw 'non-error failure';
    });
    const nonErrorHarness = createCleanupHarness({ sync: createFilterSync(nonErrorFilter) });
    await expect(cleanupExpired(nonErrorHarness.vm, 'public', 'Order')).rejects.toThrow(
      'Filter function failed for public:Order: non-error failure'
    );

    const invalidOperatorHarness = createCleanupHarness();
    await expect(
      cleanupExpired(invalidOperatorHarness.vm, 'public', 'Order', { filter: createFilter('regex') })
    ).rejects.toThrow('Cannot invert operator: regex');
    expect(invalidOperatorHarness.find).not.toHaveBeenCalled();
  });
});
