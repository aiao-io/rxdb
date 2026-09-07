import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UUID } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RemoteMergeResult } from '../../rxdb-adapter.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { IRxDBChange, RemoteChange } from '../../system/system.interface.js';
import { pullRepository } from '../../version/pull-repository.js';
import { pushRepository, type PushRepositoryResult } from '../../version/push-repository.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { emptyPushInFlight } from '../fixtures/push-inflight.js';
import { User } from '../fixtures/test-entities.js';
import { createTransactionStub } from '../fixtures/transaction-executor-stub.js';

type LegacyMergeChanges = (
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
) => Promise<RemoteMergeResult | number | void>;
type LocalMergeChanges = (
  actions: SwitchVersionActions,
  localChanges?: Omit<RxDBChange, 'id'>[],
  disableTriggers?: boolean
) => Promise<number | void>;
type PullChanges = (
  sinceId: number,
  limit?: number,
  repositoryFilter?: string[],
  filter?: RuleGroup,
  branchId?: string
) => Promise<RemoteChange[]>;

type QueryRule = {
  field: string;
  operator: string;
  value: unknown;
};

interface MergeFailure {
  call: number;
  error: Error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function queryRules(options: unknown): QueryRule[] {
  if (!isRecord(options) || !isRecord(options['where']) || !Array.isArray(options['where']['rules'])) {
    return [];
  }

  return options['where']['rules'].flatMap(rule => {
    if (!isRecord(rule)) return [];
    const field = rule['field'];
    const operator = rule['operator'];
    if (typeof field !== 'string' || typeof operator !== 'string' || !('value' in rule)) return [];
    return [{ field, operator, value: rule['value'] }];
  });
}

function matchesRules(change: RxDBChange, rules: QueryRule[]): boolean {
  return rules.every(rule => {
    const value = change[rule.field as keyof RxDBChange];
    if (rule.operator === '=') return value === rule.value;
    if (rule.operator === '>') return typeof value === 'number' && typeof rule.value === 'number' && value > rule.value;
    if (rule.operator === 'in') return Array.isArray(rule.value) && rule.value.includes(value);
    throw new Error(`Unsupported operator: ${rule.operator}`);
  });
}

function createSyncRecord(): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = 'public:User:main';
  record.namespace = 'public';
  record.entity = 'User';
  record.branchId = 'main';
  record.syncType = 'full';
  record.lastPushedChangeId = null;
  record.lastPushedAt = null;
  record.lastPulledAt = null;
  record.lastPullRemoteChangeId = null;
  record.enabled = true;
  record.createdAt = new Date('2026-01-01T00:00:00.000Z');
  record.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return record;
}

function entityIdFor(id: number): UUID {
  return `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` as UUID;
}

function createProtocolHarness() {
  const clientId = 'protocol-client';
  const localChanges: RxDBChange[] = [];
  const remoteChanges: RemoteChange[] = [];
  const remoteIdsByLocalId = new Map<number, number>();
  const mergeAttempts: number[][] = [];
  const syncRecord = createSyncRecord();
  let nextLocalId = 1;
  let nextRemoteId = 101;
  let mergeCallCount = 0;
  let mergeFailure: MergeFailure | undefined;

  const syncRepository = {
    find: vi.fn(async () => [syncRecord]),
    create: vi.fn(async (record: RxDBSync) => record),
    update: vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>) => {
      Object.assign(record, patch);
      return record;
    })
  } as unknown as IRepository<typeof RxDBSync>;

  const changeUpdate = vi.fn(async (change: RxDBChange, patch: Partial<RxDBChange>) => {
    Object.assign(change, patch);
    return change;
  });
  const changeRepository = {
    find: vi.fn(async (options?: unknown) => localChanges.filter(change => matchesRules(change, queryRules(options)))),
    update: changeUpdate
  } as unknown as IRepository<typeof RxDBChange>;

  const saveMany = vi.fn(async (changes: RxDBChange[]) => changes);
  const localMergeChanges = vi.fn<LocalMergeChanges>(async () => undefined);
  const localGetRepository = vi.fn((EntityType: unknown) => {
    if (EntityType === RxDBSync) return syncRepository;
    if (EntityType === RxDBChange) return changeRepository;
    throw new Error('Unexpected local repository request');
  });
  const localAdapter = {
    getRepository: localGetRepository,
    saveMany,
    mergeChanges: localMergeChanges,
    // pullRepository 把本地写入（remoteId 回填 + apply + 水位线推进）圈进一个事务。
    // C2 起回调收到 executor，替身把 getRepository / mergeChanges 转发回**本地**适配器自身
    // （注意不是文件下方那个远端 mergeChanges）。
    // `saveMany` 也要转发：push 的落库相位是 `executor.saveMany()` 回填 remoteId，
    // 不转发就没法在「远端已写入、本地提交失败」这个最危险的时点注入故障。
    transaction: createTransactionStub({
      getRepository: localGetRepository as never,
      mergeChanges: localMergeChanges as never,
      saveMany: saveMany as never
    })
  };

  const mergeChanges = vi.fn<LegacyMergeChanges>(async (_actions, _branchId, sourceChanges) => {
    if (sourceChanges === undefined) throw new Error('Legacy push requires complete source changes');

    mergeCallCount++;
    mergeAttempts.push(sourceChanges.map(change => change.id));
    if (mergeFailure?.call === mergeCallCount) throw mergeFailure.error;

    const changeIdMapping = sourceChanges.map(change => {
      const existingRemoteId = remoteIdsByLocalId.get(change.id);
      if (existingRemoteId !== undefined) {
        return { localId: change.id, remoteId: existingRemoteId };
      }
      const remoteId = nextRemoteId++;
      remoteIdsByLocalId.set(change.id, remoteId);
      remoteChanges.push({
        id: remoteId,
        namespace: change.namespace,
        entity: change.entity,
        entityId: change.entityId,
        branchId: change.branchId,
        type: change.type,
        patch: change.patch,
        inversePatch: change.inversePatch,
        transactionId: change.transactionId,
        localId: change.id,
        clientId,
        createdAt: new Date(change.createdAt),
        updatedAt: new Date(change.updatedAt)
      });
      return { localId: change.id, remoteId };
    });

    const maxChangeId = changeIdMapping.reduce((max, mapping) => (mapping.remoteId > max ? mapping.remoteId : max), 0);
    return { maxChangeId, changeIdMapping };
  });

  const pullChanges = vi.fn<PullChanges>(async (sinceId, limit = 1000, repositoryFilter, _filter, branchId) =>
    remoteChanges
      .filter(change => change.id > sinceId)
      .filter(change => !repositoryFilter?.length || repositoryFilter.includes(`${change.namespace}:${change.entity}`))
      .filter(change => branchId === undefined || change.branchId === branchId)
      .slice(0, limit)
  );
  const remoteAdapter = { mergeChanges, pullChanges };
  const dispatchEvent = vi.fn<(event: RxDBEvent) => void>();

  const vm = {
    rxdb: {
      config: {
        entities: [User],
        sync: {
          type: SyncType.Full,
          local: { adapter: 'local' },
          remote: { adapter: 'remote' }
        }
      },
      context: { clientId },
      dispatchEvent
    },
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getCurrentBranch: vi.fn(async () => ({ id: 'main' })),
    pushInFlight: emptyPushInFlight()
  } as unknown as VersionManager;

  const localCreate = (name: string): RxDBChange => {
    const id = nextLocalId++;
    const entityId = entityIdFor(id);
    const change = Object.create(RxDBChange.prototype) as RxDBChange;
    change.id = id;
    change.namespace = 'public';
    change.entity = 'User';
    change.entityId = entityId;
    change.branchId = 'main';
    change.type = 'INSERT';
    change.patch = { id: entityId, name };
    change.inversePatch = null;
    change.remoteId = null;
    change.revertChangeId = null;
    change.createdAt = new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`);
    change.updatedAt = new Date(`2026-01-01T00:00:${String(id).padStart(2, '0')}.000Z`);
    localChanges.push(change);
    return change;
  };

  const seedOwnRemoteChange = (id: number, localId?: number): RemoteChange => {
    const change: RemoteChange = {
      id,
      namespace: 'public',
      entity: 'User',
      entityId: entityIdFor(id),
      branchId: 'main',
      type: 'UPDATE',
      patch: { name: `remote-${id}` },
      inversePatch: { name: `local-${id}` },
      clientId,
      createdAt: new Date(`2026-01-01T00:01:${String(id % 60).padStart(2, '0')}.000Z`),
      updatedAt: new Date(`2026-01-01T00:01:${String(id % 60).padStart(2, '0')}.000Z`)
    };
    if (localId !== undefined) change.localId = localId;
    remoteChanges.push(change);
    if (localId !== undefined) remoteIdsByLocalId.set(localId, id);
    if (id >= nextRemoteId) nextRemoteId = id + 1;
    return change;
  };

  return {
    vm,
    localChanges,
    remoteChanges,
    mergeAttempts,
    syncRecord,
    localCreate,
    seedOwnRemoteChange,
    setMergeFailure: (failure?: MergeFailure) => {
      mergeFailure = failure;
    },
    localMergeChanges,
    changeUpdate,
    saveMany
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('push/pull protocol integration', () => {
  it('local create -> push -> pull does not apply the client own record twice', async () => {
    const harness = createProtocolHarness();
    const localChange = harness.localCreate('Alice');

    const pushResult = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(pushResult).toMatchObject({ success: true, pushed: 1, failed: 0, originalCount: 1 });
    expect(harness.remoteChanges).toHaveLength(1);
    expect(localChange.remoteId).toBe(harness.remoteChanges[0].id);
    expect(harness.syncRecord.lastPushedChangeId).toBe(localChange.id);

    const pullResult = await pullRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(pullResult).toMatchObject({ pulled: 1, applied: 0, compacted: 0 });
    expect(harness.localMergeChanges).not.toHaveBeenCalled();
    expect(harness.localChanges).toEqual([localChange]);
    expect(harness.syncRecord.lastPullRemoteChangeId).toBe(harness.remoteChanges[0].id);

    const secondPull = await pullRepository(harness.vm, 'public', 'User', { includeRelated: false });
    expect(secondPull).toMatchObject({ pulled: 0, applied: 0 });
    expect(harness.localMergeChanges).not.toHaveBeenCalled();
  });

  it('single repository pull skips every own record and maps only records carrying localId', async () => {
    const harness = createProtocolHarness();
    const localChange = harness.localCreate('Alice');
    harness.seedOwnRemoteChange(201);
    harness.seedOwnRemoteChange(202, localChange.id);

    const result = await pullRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result).toMatchObject({ pulled: 2, applied: 0, compacted: 0 });
    expect(harness.localMergeChanges).not.toHaveBeenCalled();
    expect(harness.changeUpdate).toHaveBeenCalledTimes(1);
    expect(localChange.remoteId).toBe(202);
    expect(harness.syncRecord.lastPullRemoteChangeId).toBe(202);
  });

  it('retries every locally uncommitted batch without duplicating remote changes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createProtocolHarness();
    const changes = ['one', 'two', 'three', 'four', 'five'].map(name => harness.localCreate(name));
    const error = new Error('second batch failed');
    harness.setMergeFailure({ call: 2, error });

    const thrown = await pushRepository(harness.vm, 'public', 'User', {
      batchSize: 2,
      includeRelated: false
    }).catch((caught: unknown) => caught);

    // 首批已经落到远端且不会回滚，进度随 RxDBPartialSyncError 交出去
    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    const partial = thrown as RxDBPartialSyncError<PushRepositoryResult>;
    expect(partial.cause).toBe(error);
    expect(partial.result).toMatchObject({
      success: false,
      error,
      pushed: 2,
      failed: 3,
      originalCount: 5
    });
    expect(harness.mergeAttempts).toEqual([
      [1, 2],
      [3, 4]
    ]);
    expect(changes.map(change => change.remoteId)).toEqual([null, null, null, null, null]);
    expect(harness.syncRecord.lastPushedChangeId).toBeNull();

    harness.setMergeFailure();
    const retryResult = await pushRepository(harness.vm, 'public', 'User', {
      batchSize: 2,
      includeRelated: false
    });

    expect(retryResult).toMatchObject({ success: true, pushed: 5, failed: 0, originalCount: 5 });
    expect(harness.mergeAttempts).toEqual([[1, 2], [3, 4], [1, 2], [3, 4], [5]]);
    expect(changes.map(change => change.remoteId)).toEqual([101, 102, 103, 104, 105]);
    expect(harness.remoteChanges.map(change => change.localId)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(harness.remoteChanges.map(change => change.localId))).toHaveLength(5);
    expect(changes.every(change => change.remoteId !== null)).toBe(true);
    expect(harness.syncRecord.lastPushedChangeId).toBe(5);
  });

  /**
   * RXD-041：此前所有故障注入都发生在**远端写入之前**（`setMergeFailure` 在 `mergeChanges`
   * 里、写 `remoteChanges` 之前抛），于是最危险的那一档从来没被覆盖：远端已经落了记录、
   * 拿回了 changeIdMapping，本地回填 `remoteId` / 推进水位线的那笔事务却失败了。
   *
   * 这一档要求两件事同时成立，缺一就是数据损坏：
   * 1. 本地必须整体回滚到「没推过」——`remoteId` 全部回 null、水位线不动。留下半截
   *    `remoteId` 会让这些变更既不在未推送查询里、又没有远端对应关系，永久卡住。
   * 2. 重推时远端必须按 `localId` 幂等，不能给同一条本地变更再建一份远端记录。
   */
  it('远端写入成功但本地落库失败时整体回滚，重推不在远端产生重复记录', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createProtocolHarness();
    const changes = ['one', 'two'].map(name => harness.localCreate(name));
    const commitError = new Error('local commit failed');
    harness.saveMany.mockRejectedValueOnce(commitError);

    // 本地事务失败 = `pushed` 记 0，抛裸错误而不是 resolve 出 success:false
    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toBe(commitError);

    // 远端确实写进去了——故障点在这之后
    expect(harness.remoteChanges.map(change => change.localId)).toEqual([1, 2]);
    // 本地必须干净回滚，不能留半截 remoteId 或已推进的水位线
    expect(changes.map(change => change.remoteId)).toEqual([null, null]);
    expect(harness.syncRecord.lastPushedChangeId).toBeNull();
    expect(harness.syncRecord.lastPushedAt).toBeNull();

    const retryResult = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(retryResult).toMatchObject({ success: true, pushed: 2, failed: 0 });
    // 幂等：远端仍然只有两条，且 remoteId 与第一次拿到的一致
    expect(harness.remoteChanges).toHaveLength(2);
    expect(harness.remoteChanges.map(change => change.localId)).toEqual([1, 2]);
    expect(changes.map(change => change.remoteId)).toEqual([101, 102]);
    expect(harness.syncRecord.lastPushedChangeId).toBe(2);
  });
});
