import {
  createEntitySyncResolver,
  type EntityMetadata,
  type EntityType,
  type IRepository,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  type SyncOptions,
  SyncType
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { getAllRepositorySyncStatus } from '../get-all-repository-sync-status.js';
import type { PendingChangeProbe } from '../scoped-sync.js';
import { noIdentityDeclared } from './fixtures/no-identity-declared.js';
import { METADATA } from './fixtures/private-symbols.js';

interface QueryRule {
  field: string;
  value: unknown;
}

interface QueryOptions {
  where?: {
    rules: QueryRule[];
  };
}

type SyncFind = (options: QueryOptions) => Promise<RxDBSync[]>;
/** 待推数按记录数分两次数：外层是「那批待推变更 AND transactionId 条件」，分组计数带 `groupBy` */
interface ChangeCountOptions {
  where: { combinator: 'and'; rules: [{ rules: QueryRule[] }, unknown] };
  groupBy?: string[];
}

type ChangeCount = (options: ChangeCountOptions) => Promise<number>;
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

const FullEntity = createEntityType('AllFull', FULL_SYNC);
const RemoteEntity = createEntityType('AllRemote', REMOTE_SYNC);
const LocalEntity = createEntityType('AllLocal', LOCAL_SYNC);
const NoneEntity = createEntityType('AllNone', NONE_SYNC);
const ALL_ENTITIES = [FullEntity, RemoteEntity, LocalEntity, NoneEntity];

function createSyncRecord(entity: string, enabled: boolean, lastPullRemoteChangeId: number | null): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  Object.assign(record, {
    id: `public:${entity}:main`,
    namespace: 'public',
    entity,
    branchId: 'main',
    syncType: 'full',
    lastPushedChangeId: entity === 'AllFull' ? 7 : null,
    lastPushedAt: null,
    lastPulledAt: null,
    lastPullRemoteChangeId,
    enabled,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z')
  });
  return record;
}

function getRuleValue(options: QueryOptions, field: string): unknown {
  return options.where?.rules.find(rule => rule.field === field)?.value;
}

interface AllStatusHarnessOptions {
  /** 配置里还有哪些实体（追加在四个业务实体之后） */
  extraEntities?: EntityType[];
  /** 实例的同步解析器；不给时每个实体只看自己的 `sync` */
  entitySync?: SyncOptions;
  /** 远端能一次数完多个仓库的待拉数（US-236） */
  batchCount?: boolean;
}

function createAllStatusHarness(options: AllStatusHarnessOptions = {}) {
  const syncRecords = new Map<string, RxDBSync>([
    ['public:AllFull:main', createSyncRecord('AllFull', true, 10)],
    ['public:AllRemote:main', createSyncRecord('AllRemote', false, 4)],
    ['public:AllNone:main', createSyncRecord('AllNone', true, null)]
  ]);
  const pushableCounts = new Map<string, number>([
    ['AllFull', 2],
    ['AllLocal', 0]
  ]);
  const remoteCounts = new Map<string, { count: number; latestChangeId: number }>([
    ['public:AllFull', { count: 3, latestChangeId: 13 }],
    ['public:AllRemote', { count: 2, latestChangeId: 6 }]
  ]);
  const syncFind = vi.fn<SyncFind>(async options => {
    const id = getRuleValue(options, 'id');
    const record = typeof id === 'string' ? syncRecords.get(id) : undefined;
    return record ? [record] : [];
  });
  // 本套用例的待推变更都不在事务里：普通计数给条数，分组计数（事务数）为 0
  const changeCount = vi.fn<ChangeCount>(async options => {
    if (options.groupBy) return 0;
    const entity = getRuleValue({ where: options.where.rules[0] }, 'entity');
    return typeof entity === 'string' ? (pushableCounts.get(entity) ?? 0) : 0;
  });
  const syncRepository = { find: syncFind } as unknown as IRepository<typeof RxDBSync>;
  // `find` 答待拉数里「本库推上去的远端 id」（US-233）：这些用例没有推过
  const changeRepository = { count: changeCount, find: vi.fn(async () => []) } as unknown as IRepository<
    typeof RxDBChange
  >;
  const localAdapter = {
    getRepository: vi.fn((EntityClass: unknown) => {
      if (EntityClass === RxDBSync) return syncRepository;
      if (EntityClass === RxDBChange) return changeRepository;
      throw new Error('Unexpected repository request');
    })
  };
  const getChangeCount = vi.fn<GetChangeCount>(async (_sinceId, repositoryFilter) => {
    const entity = repositoryFilter?.[0];
    return entity ? (remoteCounts.get(entity) ?? { count: 0, latestChangeId: 0 }) : { count: 0, latestChangeId: 0 };
  });
  const countPendingChanges = vi.fn(async (probes: readonly PendingChangeProbe[]) =>
    probes.map(probe => remoteCounts.get(`${probe.namespace}:${probe.entity}`)?.count ?? 0)
  );
  const backendId = vi.fn(async () => 'backend-a');
  const remoteAdapter =
    options.batchCount ? { getChangeCount, countPendingChanges, backendId } : { getChangeCount, backendId };
  const rxdb = {
    ...(options.entitySync ? { entitySync: createEntitySyncResolver(options.entitySync) } : {}),
    config: {
      entities: [...ALL_ENTITIES, ...(options.extraEntities ?? [])],
      sync: FULL_SYNC
    },
    syncManager: {
      rxdb: noIdentityDeclared,
      getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
      getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
      getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter }))
    }
  } as unknown as RxDB;

  return { rxdb, syncFind, changeCount, getChangeCount, countPendingChanges, backendId };
}

function entityNames(statuses: Awaited<ReturnType<typeof getAllRepositorySyncStatus>>): string[] {
  return statuses.map(status => status.repository.entity);
}

describe('getAllRepositorySyncStatus', () => {
  it('calls the real status implementation for every configured entity', async () => {
    const harness = createAllStatusHarness();

    const statuses = await getAllRepositorySyncStatus(harness.rxdb);

    expect(
      statuses.map(status => ({
        entity: status.repository.entity,
        syncType: status.syncType,
        enabled: status.enabled,
        pushableCount: status.pushableCount,
        pullableCount: status.pullableCount
      }))
    ).toEqual([
      { entity: 'AllFull', syncType: 'full', enabled: true, pushableCount: 2, pullableCount: 3 },
      { entity: 'AllRemote', syncType: 'remote', enabled: false, pushableCount: 0, pullableCount: 2 },
      // RXD-029：local 两个方向都不可同步，`enabled` 恒为 false（原先报 true）
      { entity: 'AllLocal', syncType: 'local', enabled: false, pushableCount: 0, pullableCount: 0 },
      { entity: 'AllNone', syncType: 'none', enabled: false, pushableCount: 0, pullableCount: 0 }
    ]);
    expect(harness.syncFind).toHaveBeenCalled();
    // 只有 AllFull 需要算 pushableCount（按记录数数两次）；AllLocal 是 local-only（不可推），不再白扫一遍变更表
    expect(harness.changeCount).toHaveBeenCalledTimes(2);
    expect(harness.getChangeCount).toHaveBeenCalledTimes(2);
  });

  it('filters by sync type and treats an empty sync type list as no filter', async () => {
    const harness = createAllStatusHarness();

    const selected = await getAllRepositorySyncStatus(harness.rxdb, { syncType: ['full', 'remote'] });
    const unfiltered = await getAllRepositorySyncStatus(harness.rxdb, { syncType: [] });

    expect(entityNames(selected)).toEqual(['AllFull', 'AllRemote']);
    expect(entityNames(unfiltered)).toEqual(['AllFull', 'AllRemote', 'AllLocal', 'AllNone']);
  });

  it('filters both enabled states', async () => {
    const harness = createAllStatusHarness();

    const enabled = await getAllRepositorySyncStatus(harness.rxdb, { enabled: true });
    const disabled = await getAllRepositorySyncStatus(harness.rxdb, { enabled: false });

    // RXD-029：AllLocal 从「启用」挪到「禁用」—— 它本来就不可能同步
    expect(entityNames(enabled)).toEqual(['AllFull']);
    expect(entityNames(disabled)).toEqual(['AllRemote', 'AllLocal', 'AllNone']);
  });

  it('filters both pending-change states', async () => {
    const harness = createAllStatusHarness();

    const pending = await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: true });
    const settled = await getAllRepositorySyncStatus(harness.rxdb, { hasPendingChanges: false });

    expect(entityNames(pending)).toEqual(['AllFull', 'AllRemote']);
    expect(entityNames(settled)).toEqual(['AllLocal', 'AllNone']);
  });

  it('applies sync type, enabled, and pending filters together', async () => {
    const harness = createAllStatusHarness();

    const statuses = await getAllRepositorySyncStatus(harness.rxdb, {
      syncType: ['full', 'local'],
      enabled: true,
      hasPendingChanges: true
    });

    expect(entityNames(statuses)).toEqual(['AllFull']);
  });
});

describe('getAllRepositorySyncStatus 一轮数清（US-236）', () => {
  // 系统表不带自己的 `sync`，跟随库级 Full 被判成能拉取；此前每张都各打三次远端往返去数，
  // 而它们是 `log: false` 的本地簿记表，远端日志里永远没有它们的行。状态照报（公开契约），只是不再问远端
  it('系统表跟随库级 Full：照样报状态，待拉为 0，不为它们问远端', async () => {
    const harness = createAllStatusHarness({
      extraEntities: [RxDBBranch, RxDBChange, RxDBSync],
      entitySync: FULL_SYNC
    });

    const statuses = await getAllRepositorySyncStatus(harness.rxdb);

    expect(statuses.map(status => [status.repository.entity, status.pullableCount])).toEqual([
      ['AllFull', 3],
      ['AllRemote', 2],
      ['AllLocal', 0],
      ['AllNone', 0],
      ['RxDBBranch', 0],
      ['RxDBChange', 0],
      ['RxDBSync', 0]
    ]);
    expect(harness.getChangeCount.mock.calls.map(call => call[1])).toEqual([['public:AllFull'], ['public:AllRemote']]);
  });

  it('远端能一次数完：不论几个仓库，一轮只核一次远端身份、只数一次', async () => {
    const harness = createAllStatusHarness({ batchCount: true });

    const statuses = await getAllRepositorySyncStatus(harness.rxdb);

    expect(statuses.map(status => [status.repository.entity, status.pullableCount])).toEqual([
      ['AllFull', 3],
      ['AllRemote', 2],
      ['AllLocal', 0],
      ['AllNone', 0]
    ]);
    expect(harness.backendId).toHaveBeenCalledOnce();
    expect(harness.countPendingChanges).toHaveBeenCalledOnce();
    expect(harness.countPendingChanges.mock.calls[0][0].map(probe => probe.entity)).toEqual(['AllFull', 'AllRemote']);
    expect(harness.getChangeCount).not.toHaveBeenCalled();
  });
});
