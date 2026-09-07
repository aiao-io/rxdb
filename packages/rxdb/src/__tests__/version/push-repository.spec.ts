import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType, UUID } from '../../entity/entity.interface.js';
import { PropertyType, RelationKind, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import type { IRepository } from '../../repository/repository.interface.js';
import type { RemoteMergeResult } from '../../rxdb-adapter.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import { RepositorySyncBeginEvent, RepositorySyncErrorEvent } from '../../rxdb-events.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBSync } from '../../system/sync.js';
import type { IRxDBChange } from '../../system/system.interface.js';
import type { TransactionExecutor, TransactionExecutorFun } from '../../transaction/transaction-executor.interface.js';
import { RxDBDependencyFailedError } from '../../version/cascade-contract.js';
import { PushInFlightRegistry } from '../../version/push-inflight.js';
import { pushRepository, type PushRepositoryResult } from '../../version/push-repository.js';
import type { SwitchVersionActions } from '../../version/VersionManager.interface.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { getRxDBChangeKey } from '../../version/VersionManager.utils.js';
import { Post, User } from '../fixtures/test-entities.js';

type ChangeFindOptions = Parameters<IRepository<typeof RxDBChange>['find']>[0];
type SyncFindOptions = Parameters<IRepository<typeof RxDBSync>['find']>[0];
type BranchFindOptions = Parameters<IRepository<typeof RxDBBranch>['find']>[0];
type MergeChanges = (
  actions: SwitchVersionActions,
  branchId?: string,
  changes?: IRxDBChange[]
) => Promise<RemoteMergeResult | number | void>;
type SaveChanges = (changes: RxDBChange[]) => Promise<RxDBChange[]>;
type DispatchEvent = (event: RxDBEvent) => void;

type ChangeInput = {
  id: number;
  entity?: string;
  entityId?: UUID;
  branchId?: string;
  type?: RxDBChange['type'];
  patch?: RxDBChange['patch'];
  inversePatch?: RxDBChange['inversePatch'];
};

type HarnessOptions = {
  changes?: RxDBChange[];
  currentBranchId?: string;
  branchParents?: Readonly<Record<string, string | null>>;
  currentWatermark?: number | null;
  ancestorWatermarks?: Readonly<Record<string, number | null>>;
  mergeChanges?: MergeChanges;
  saveChanges?: SaveChanges;
  sync?: SyncOptions;
  entities?: EntityType[];
};

const fullSync = (): SyncOptions => ({
  type: SyncType.Full,
  local: { adapter: 'local' },
  remote: { adapter: 'remote' }
});

// RXD-030：`SyncType.None` + 只配 remote → `getSyncType` 判 `'remote'`（只读）。
// 单仓路径会直接拒绝推送，级联路径此前根本不看。
@Entity({
  name: 'PushRemoteOnlyChild',
  sync: { type: SyncType.None, remote: { adapter: 'remote' } },
  properties: [{ name: 'title', type: PropertyType.string }],
  relations: [
    {
      name: 'author',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'User',
      mappedProperty: 'remoteOnlyChildren'
    }
  ]
})
class PushRemoteOnlyChild extends EntityBase {
  title!: string;
}

// 级联链的第三级：User(父) ← Post(子) ← PushComment(孙)。
// 需要三级才能观察到「被阻断的节点」既不是目标仓、也不是失败仓 ——
// 两级图里目标仓一失败就直接 reject，`relatedResults` 无从读起。
@Entity({
  name: 'PushComment',
  sync: { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } },
  properties: [{ name: 'body', type: PropertyType.string }],
  relations: [
    {
      name: 'post',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'Post',
      mappedProperty: 'comments'
    }
  ]
})
class PushComment extends EntityBase {
  body!: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function ruleValue(group: unknown, field: string): unknown {
  if (!isRecord(group) || !Array.isArray(group['rules'])) return undefined;

  for (const rule of group['rules']) {
    if (!isRecord(rule)) continue;
    if (rule['field'] === field && 'value' in rule) return rule['value'];

    const nestedValue = ruleValue(rule, field);
    if (nestedValue !== undefined) return nestedValue;
  }

  return undefined;
}

function createChange(input: ChangeInput): RxDBChange {
  const type = input.type ?? 'INSERT';
  const entityId = input.entityId ?? (`00000000-0000-0000-0000-${String(input.id).padStart(12, '0')}` as UUID);
  const change = Object.create(RxDBChange.prototype) as RxDBChange;
  change.id = input.id;
  change.namespace = 'public';
  change.entity = input.entity ?? 'User';
  change.entityId = entityId;
  change.branchId = input.branchId ?? 'main';
  change.type = type;
  change.patch =
    input.patch === undefined ?
      type === 'DELETE' ?
        null
      : { id: entityId }
    : input.patch;
  change.inversePatch = input.inversePatch ?? null;
  change.remoteId = null;
  change.revertChangeId = null;
  change.createdAt = new Date(`2026-01-01T00:00:${String(input.id).padStart(2, '0')}.000Z`);
  change.updatedAt = new Date(`2026-01-01T00:00:${String(input.id).padStart(2, '0')}.000Z`);
  return change;
}

function createSyncRecord(entity: string, branchId: string, watermark: number | null): RxDBSync {
  const record = Object.create(RxDBSync.prototype) as RxDBSync;
  record.id = `public:${entity}:${branchId}`;
  record.namespace = 'public';
  record.entity = entity;
  record.branchId = branchId;
  record.syncType = 'full';
  record.lastPushedChangeId = watermark;
  record.lastPushedAt = null;
  record.lastPulledAt = null;
  record.lastPullRemoteChangeId = null;
  record.enabled = true;
  record.createdAt = new Date('2026-01-01T00:00:00.000Z');
  record.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return record;
}

function createBranch(id: string, parentId: string | null): RxDBBranch {
  const branch = Object.create(RxDBBranch.prototype) as RxDBBranch;
  branch.id = id;
  branch.parentId = parentId;
  branch.activated = true;
  branch.local = true;
  branch.remote = false;
  return branch;
}

function createHarness(options: HarnessOptions = {}) {
  const changes = options.changes ?? [];
  const currentBranchId = options.currentBranchId ?? 'main';
  const branchParents = options.branchParents ?? { [currentBranchId]: null };
  const syncRecords = new Map<string, RxDBSync>();
  const currentSync = createSyncRecord('User', currentBranchId, options.currentWatermark ?? null);
  syncRecords.set(currentSync.id, currentSync);

  for (const [branchId, watermark] of Object.entries(options.ancestorWatermarks ?? {})) {
    const record = createSyncRecord('User', branchId, watermark);
    syncRecords.set(record.id, record);
  }

  const syncFind = vi.fn(async (findOptions: SyncFindOptions): Promise<RxDBSync[]> => {
    const id = ruleValue(findOptions.where, 'id');
    const record = typeof id === 'string' ? syncRecords.get(id) : undefined;
    return record ? [record] : [];
  });
  const syncCreate = vi.fn(async (record: RxDBSync): Promise<RxDBSync> => {
    syncRecords.set(record.id, record);
    return record;
  });
  const syncUpdate = vi.fn(async (record: RxDBSync, patch: Partial<RxDBSync>): Promise<RxDBSync> => {
    Object.assign(record, patch);
    return record;
  });
  const syncRepo = { find: syncFind, create: syncCreate, update: syncUpdate } as unknown as IRepository<
    typeof RxDBSync
  >;

  const changeFind = vi.fn(async (findOptions: ChangeFindOptions): Promise<RxDBChange[]> => {
    const entities = ruleValue(findOptions.where, 'entity');
    if (!Array.isArray(entities)) return [...changes];
    return changes.filter(change => entities.includes(change.entity));
  });
  const changeRepo = { find: changeFind } as unknown as IRepository<typeof RxDBChange>;

  const branchFind = vi.fn(async (findOptions: BranchFindOptions): Promise<RxDBBranch[]> => {
    const id = ruleValue(findOptions.where, 'id');
    if (typeof id !== 'string' || !(id in branchParents)) return [];
    return [createBranch(id, branchParents[id] ?? null)];
  });
  const branchRepo = { find: branchFind } as unknown as IRepository<typeof RxDBBranch>;

  const saveMany = vi.fn<SaveChanges>(options.saveChanges ?? (async records => records));
  const getRepository = vi.fn((EntityClass: EntityType): unknown => {
    if (EntityClass === RxDBSync) return syncRepo;
    if (EntityClass === RxDBChange) return changeRepo;
    if (EntityClass === RxDBBranch) return branchRepo;
    throw new Error(`Unexpected repository: ${EntityClass.name}`);
  });
  const localAdapter = { getRepository, saveMany };
  const transaction = vi.fn(async <T>(fun: TransactionExecutorFun<T>): Promise<T> => {
    const executor = { getRepository, saveMany } as unknown as TransactionExecutor;
    return await fun(executor);
  });
  Object.assign(localAdapter, { transaction });

  const mergeChanges = vi.fn<MergeChanges>(options.mergeChanges ?? (async () => undefined));
  const remoteAdapter = { mergeChanges };
  const dispatchEvent = vi.fn<DispatchEvent>();
  const currentBranch = createBranch(currentBranchId, branchParents[currentBranchId] ?? null);

  // 真的登记处，不是替身：`pushRepository` 会在这上面认领/释放在飞区间，
  // 用替身就等于把要验的东西验掉了
  const pushInFlight = new PushInFlightRegistry();

  const vm = {
    rxdb: {
      config: {
        entities: options.entities ?? [User],
        sync: options.sync ?? fullSync()
      },
      context: { clientId: 'test-client' },
      dispatchEvent
    },
    getLocalRepositories: vi.fn(async () => ({ adapter: localAdapter })),
    getRemoteRepositories: vi.fn(async () => ({ adapter: remoteAdapter })),
    getCurrentBranch: vi.fn(async () => currentBranch),
    pushInFlight
  } as unknown as VersionManager;

  return {
    vm,
    pushInFlight,
    branchFind,
    changeFind,
    currentSync,
    dispatchEvent,
    mergeChanges,
    saveMany,
    transaction,
    syncFind,
    syncRecords,
    syncUpdate
  };
}

const actionCount = (actions: SwitchVersionActions): number =>
  actions.inserts.size + actions.updates.size + actions.deletes.size;

const actionKeys = (actions: SwitchVersionActions): string[] => [
  ...actions.deletes.keys(),
  ...actions.updates.keys(),
  ...actions.inserts.keys()
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pushRepository', () => {
  it('构造单分支未推送查询，并在空结果时不提交或推进水位线', async () => {
    const harness = createHarness({ currentWatermark: 41 });

    const result = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result).toEqual({
      repository: { namespace: 'public', entity: 'User' },
      pushed: 0,
      failed: 0,
      compacted: 0,
      originalCount: 0,
      // RXD-030：`failures` 是必填字段，没有失败时是空数组而不是缺字段
      failures: []
    });
    expect(harness.changeFind).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'revertChangeId', operator: '=', value: null },
          { field: 'remoteId', operator: '=', value: null },
          { field: 'namespace', operator: '=', value: 'public' },
          { field: 'branchId', operator: '=', value: 'main' },
          { field: 'entity', operator: 'in', value: ['User'] },
          { field: 'id', operator: '>', value: 41 }
        ]
      },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect(harness.syncUpdate).not.toHaveBeenCalled();
  });

  /**
   * 未推送变更只按实体名过滤，跨 namespace 的同名实体会互相串味：
   * `public:User` 的 push 会把 `admin:User` 的变更一起捞出来推上去（错推），
   * 而 `admin:User` 自己的水位线又被推进，导致后续漏推。
   */
  it('未推送查询必须带 namespace 过滤，避免跨 namespace 同名实体串味', async () => {
    const harness = createHarness({ currentWatermark: 41 });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(ruleValue(harness.changeFind.mock.calls[0]?.[0]?.where, 'namespace')).toBe('public');
  });

  it('多分支查询使用所有祖先分支的最小水位线', async () => {
    const harness = createHarness({
      currentBranchId: 'feature',
      branchParents: { feature: 'release', release: 'main', main: null },
      currentWatermark: 50,
      ancestorWatermarks: { release: 20, main: 30 }
    });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(harness.branchFind).toHaveBeenCalledTimes(3);
    expect(harness.changeFind).toHaveBeenCalledWith({
      where: {
        combinator: 'and',
        rules: [
          { field: 'revertChangeId', operator: '=', value: null },
          { field: 'remoteId', operator: '=', value: null },
          { field: 'namespace', operator: '=', value: 'public' },
          { field: 'branchId', operator: 'in', value: ['feature', 'release', 'main'] },
          { field: 'entity', operator: 'in', value: ['User'] },
          { field: 'id', operator: '>', value: 20 }
        ]
      },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
  });

  it('任一祖先从未推送时取消 change id 水位线过滤', async () => {
    const harness = createHarness({
      currentBranchId: 'feature',
      branchParents: { feature: 'release', release: 'main', main: null },
      currentWatermark: 50,
      ancestorWatermarks: { release: null, main: 30 }
    });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    const findOptions = harness.changeFind.mock.calls[0][0];
    expect(findOptions.where.rules).toEqual([
      { field: 'revertChangeId', operator: '=', value: null },
      { field: 'remoteId', operator: '=', value: null },
      { field: 'namespace', operator: '=', value: 'public' },
      { field: 'branchId', operator: 'in', value: ['feature', 'release', 'main'] },
      { field: 'entity', operator: 'in', value: ['User'] }
    ]);
    // 3 次读：①资格判定（RXD-029 新增，推之前先确认 RxDBSync.enabled 没被关掉）
    // ②本仓水位线 ③祖先水位线。前两次都读同一条记录，但资格判定必须发生在碰远端之前，
    // 而水位线读取夹在拉取变更之后 —— 合并成一次就等于把「能不能推」推迟到已经动手之后
    expect(harness.syncFind).toHaveBeenCalledTimes(3);
  });

  it('INSERT 后 DELETE 压缩为空提交，不调用远端但必须推进水位线', async () => {
    const entityId = '11111111-1111-1111-1111-111111111111' as UUID;
    const insert = createChange({ id: 1, entityId, patch: { name: 'temporary' } });
    const remove = createChange({ id: 2, entityId, type: 'DELETE', patch: null, inversePatch: null });
    const harness = createHarness({ changes: [insert, remove] });

    const result = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result).toEqual({
      repository: { namespace: 'public', entity: 'User' },
      pushed: 0,
      failed: 0,
      compacted: 2,
      originalCount: 2,
      // RXD-030：`failures` 是必填字段，没有失败时是空数组而不是缺字段
      failures: []
    });
    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect(harness.saveMany).not.toHaveBeenCalled();

    // 这批变更已被本地压缩抵消，`remoteId` / `revertChangeId` 永远保持 null，
    // 后续任何一次 push 都不可能再把它们发出去。水位线不推进的话，每次 push 都会
    // 重新查出、重新压缩这一批，历史越长开销越大；`calculatePushableCount` 用的是
    // 同一条水位线，还会把它们永远算作"待推送"。
    expect(harness.currentSync.lastPushedChangeId).toBe(2);
    // 没有真的推送到远端，`lastPushedAt`（纯展示字段）不应被伪造
    expect(harness.currentSync.lastPushedAt).toBeNull();
  });

  it('压缩为空后再次 push 不再读取这批已抵消的旧变更', async () => {
    const entityId = '11111111-1111-1111-1111-111111111111' as UUID;
    const insert = createChange({ id: 1, entityId, patch: { name: 'temporary' } });
    const remove = createChange({ id: 2, entityId, type: 'DELETE', patch: null, inversePatch: null });
    const harness = createHarness({ changes: [insert, remove] });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });
    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    // 首次查询没有水位线过滤；第二次必须带上 `id > 2`，否则旧变更被无限重扫
    expect(harness.changeFind.mock.calls[0][0].where.rules).not.toContainEqual(
      expect.objectContaining({ field: 'id' })
    );
    expect(harness.changeFind.mock.calls[1][0].where.rules).toContainEqual({
      field: 'id',
      operator: '>',
      value: 2
    });
  });

  it('legacy 映射按完整源变更回填，并以最大本地 change id 更新同步状态', async () => {
    const firstEntityId = '11111111-1111-1111-1111-111111111111' as UUID;
    const secondEntityId = '22222222-2222-2222-2222-222222222222' as UUID;
    const insert = createChange({ id: 3, entityId: firstEntityId, patch: { name: 'before' } });
    const otherInsert = createChange({ id: 5, entityId: secondEntityId, patch: { name: 'other' } });
    const update = createChange({
      id: 8,
      entityId: firstEntityId,
      type: 'UPDATE',
      patch: { name: 'after' },
      inversePatch: { name: 'before' }
    });
    const harness = createHarness({
      changes: [insert, otherInsert, update],
      mergeChanges: async () => ({
        changeIdMapping: [
          { localId: 3, remoteId: 108 },
          { localId: 8, remoteId: 108 }
        ]
      })
    });

    const result = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result).toMatchObject({ success: true, pushed: 2, failed: 0, compacted: 1, originalCount: 3 });
    expect(harness.mergeChanges).toHaveBeenCalledTimes(1);
    const [, branchId, sourceChanges] = harness.mergeChanges.mock.calls[0];
    expect(branchId).toBe('main');
    expect(sourceChanges).toEqual([insert, otherInsert, update]);
    expect(insert.remoteId).toBe(108);
    expect(update.remoteId).toBe(108);
    expect(otherInsert.remoteId).toBeNull();
    expect(harness.saveMany).toHaveBeenCalledWith([insert, update]);
    expect(harness.currentSync.lastPushedChangeId).toBe(8);
    expect(harness.currentSync.lastPushedAt).toBeInstanceOf(Date);
    expect(harness.syncUpdate).toHaveBeenCalledWith(
      harness.currentSync,
      expect.objectContaining({ lastPushedChangeId: 8, lastPushedAt: expect.any(Date), updatedAt: expect.any(Date) })
    );
  });

  it('拒绝远端返回未知本地 change id，且不推进同步水位线', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const change = createChange({ id: 3 });
    const harness = createHarness({
      changes: [change],
      mergeChanges: async () => ({
        changeIdMapping: [
          { localId: 3, remoteId: 103 },
          { localId: 999, remoteId: 199 }
        ]
      })
    });

    // 一条都没发到远端，抛裸错误（见 push-repository.ts 的 throwPushFailure）
    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toEqual(
      expect.objectContaining({ message: 'Remote change mapping references unknown local change: 999' })
    );
    expect(change.remoteId).toBeNull();
    expect(harness.saveMany).not.toHaveBeenCalled();
    expect(harness.syncUpdate).not.toHaveBeenCalled();
  });

  it('远端返回非映射结果时仍推进水位线，但不保存本地变更', async () => {
    const change = createChange({ id: 7 });
    const harness = createHarness({ changes: [change], mergeChanges: async () => 77 });

    const result = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result).toMatchObject({ success: true, pushed: 1, failed: 0 });
    expect(harness.saveMany).not.toHaveBeenCalled();
    expect(harness.currentSync.lastPushedChangeId).toBe(7);
  });

  it('远端提交失败时抛出，且不推进同步水位线', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const change = createChange({ id: 9 });
    const harness = createHarness({
      changes: [change],
      currentWatermark: 4,
      mergeChanges: async () => {
        throw 'remote offline';
      }
    });

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toEqual(
      new Error('remote offline')
    );

    expect(harness.currentSync.lastPushedChangeId).toBe(4);
    expect(harness.syncUpdate).not.toHaveBeenCalled();
    // 失败发 Error 事件而不是 Complete。此前推送失败也发 Complete（载荷里 failed: 1），
    // 只订阅 Complete 的监听方会把一次彻底失败的推送当成功收下。
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.constructor)).toEqual([
      RepositorySyncBeginEvent,
      RepositorySyncErrorEvent
    ]);
    expect(harness.dispatchEvent.mock.calls[1][0]).toEqual(
      expect.objectContaining({ error: new Error('remote offline') })
    );
  });

  it('远端成功后本地提交失败可幂等重试，且失败状态不泄漏映射', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const change = createChange({ id: 10 });
    const remoteChanges = new Map<number, number>();
    let remoteSideEffects = 0;
    let saveAttempts = 0;
    const localError = new Error('local transaction failed');
    const harness = createHarness({
      changes: [change],
      mergeChanges: async (_actions, _branchId, sourceChanges) => ({
        changeIdMapping: (sourceChanges ?? []).map(sourceChange => {
          let remoteId = remoteChanges.get(sourceChange.id);
          if (remoteId === undefined) {
            remoteId = 100 + sourceChange.id;
            remoteChanges.set(sourceChange.id, remoteId);
            remoteSideEffects++;
          }
          return { localId: sourceChange.id, remoteId };
        })
      }),
      saveChanges: async records => {
        saveAttempts++;
        if (saveAttempts === 1) throw localError;
        return records;
      }
    });

    // 本地事务失败 = 远端已收但本地没记，`pushed` 记 0，抛裸错误
    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toBe(localError);
    expect(change.remoteId).toBeNull();
    expect(harness.currentSync.lastPushedChangeId).toBeNull();

    const retry = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(retry).toMatchObject({ success: true, pushed: 1, failed: 0 });
    expect(harness.mergeChanges).toHaveBeenCalledTimes(2);
    expect(harness.transaction).toHaveBeenCalledTimes(2);
    expect(remoteChanges).toEqual(new Map([[10, 110]]));
    expect(remoteSideEffects).toBe(1);
    expect(change.remoteId).toBe(110);
    expect(harness.currentSync.lastPushedChangeId).toBe(10);
  });

  it('级联目标仓库的远端错误必须向调用方传播', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const userChange = createChange({ id: 1 });
    const pushError = new Error('user push failed');
    const harness = createHarness({
      changes: [userChange],
      entities: [User, Post],
      mergeChanges: async actions => {
        if ([...actions.inserts.keys()].some(key => key.startsWith('public:User:'))) {
          throw pushError;
        }
      }
    });
    const postSync = createSyncRecord('Post', 'main', null);
    harness.syncRecords.set(postSync.id, postSync);

    await expect(pushRepository(harness.vm, 'public', 'User')).rejects.toBe(pushError);
    expect(harness.dispatchEvent.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ error: pushError }));
    expect(harness.dispatchEvent.mock.calls.at(-1)?.[0]).toBeInstanceOf(RepositorySyncErrorEvent);
  });

  it('batchSize 等于变更数时只提交一个批次', async () => {
    const harness = createHarness({ changes: [createChange({ id: 1 }), createChange({ id: 2 })] });

    await pushRepository(harness.vm, 'public', 'User', { batchSize: 2, includeRelated: false });

    expect(harness.mergeChanges.mock.calls.map(([actions]) => actionCount(actions))).toEqual([2]);
  });

  it('batchSize 边界溢出时拆分尾批次', async () => {
    const harness = createHarness({
      changes: [createChange({ id: 1 }), createChange({ id: 2 }), createChange({ id: 3 })]
    });

    const result = await pushRepository(harness.vm, 'public', 'User', { batchSize: 2, includeRelated: false });

    expect(harness.mergeChanges.mock.calls.map(([actions]) => actionCount(actions))).toEqual([2, 1]);
    expect(result).toMatchObject({ success: true, pushed: 3, failed: 0 });
    expect(harness.currentSync.lastPushedChangeId).toBe(3);
  });

  it('batchSize 按压缩 action 分片，同时为 legacy 协议保留每批完整源历史', async () => {
    const firstEntityId = '11111111-1111-1111-1111-111111111111' as UUID;
    const secondEntityId = '22222222-2222-2222-2222-222222222222' as UUID;
    const insert = createChange({ id: 1, entityId: firstEntityId, patch: { name: 'before' } });
    const otherInsert = createChange({ id: 2, entityId: secondEntityId, patch: { name: 'other' } });
    const update = createChange({
      id: 3,
      entityId: firstEntityId,
      type: 'UPDATE',
      patch: { name: 'after' },
      inversePatch: { name: 'before' }
    });
    const harness = createHarness({
      changes: [insert, otherInsert, update],
      mergeChanges: async (_actions, _branchId, sourceChanges) => ({
        changeIdMapping: (sourceChanges ?? []).map(change => ({
          localId: change.id,
          remoteId: change.id + 100
        }))
      })
    });

    const result = await pushRepository(harness.vm, 'public', 'User', {
      batchSize: 1,
      includeRelated: false
    });

    expect(result).toMatchObject({ success: true, pushed: 2, failed: 0, compacted: 1, originalCount: 3 });
    expect(harness.mergeChanges.mock.calls.map(([actions]) => actionCount(actions))).toEqual([1, 1]);
    expect(harness.mergeChanges.mock.calls.map(([, branchId]) => branchId)).toEqual(['main', 'main']);
    expect(harness.mergeChanges.mock.calls.map(([actions]) => actionKeys(actions))).toEqual([
      [getRxDBChangeKey(insert)],
      [getRxDBChangeKey(otherInsert)]
    ]);
    expect(
      harness.mergeChanges.mock.calls.map(([, , sourceChanges]) => sourceChanges?.map(change => change.id))
    ).toEqual([[1, 3], [2]]);
    expect(insert.remoteId).toBe(101);
    expect(update.remoteId).toBe(103);
    expect(otherInsert.remoteId).toBe(102);
    expect(harness.saveMany.mock.calls.flatMap(([changes]) => changes)).toEqual([insert, update, otherInsert]);
    expect(harness.currentSync.lastPushedChangeId).toBe(3);
  });

  it('首个失败停止后续批次，保留远端计数且不提交本地推送状态', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const changes = [5, 6, 7, 8, 9].map(id => createChange({ id }));
    const batchError = new Error('second batch failed');
    let batchIndex = 0;
    const harness = createHarness({
      changes,
      currentWatermark: 4,
      mergeChanges: async (_actions, _branchId, sourceChanges) => {
        batchIndex++;
        if (batchIndex === 2) throw batchError;
        return {
          changeIdMapping: (sourceChanges ?? []).map(change => ({
            localId: change.id,
            remoteId: change.id + 100
          }))
        };
      }
    });

    const thrown = await pushRepository(harness.vm, 'public', 'User', {
      batchSize: 2,
      includeRelated: false
    }).catch((error: unknown) => error);

    // 首批 2 条已经落到远端且不会回滚，进度随 RxDBPartialSyncError 一起交出去
    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    const partial = thrown as RxDBPartialSyncError<PushRepositoryResult>;
    expect(partial.cause).toBe(batchError);
    expect(partial.result).toMatchObject({
      success: false,
      error: batchError,
      pushed: 2,
      failed: 3,
      compacted: 0,
      originalCount: 5
    });
    expect(harness.mergeChanges.mock.calls.map(([actions]) => actionCount(actions))).toEqual([2, 2]);
    expect(changes.map(change => change.remoteId)).toEqual([null, null, null, null, null]);
    expect(harness.saveMany).not.toHaveBeenCalled();
    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.currentSync.lastPushedChangeId).toBe(4);
    expect(harness.syncUpdate).not.toHaveBeenCalled();
  });
});

// RXD-030 残留：push 侧的级联调度契约。
//
// 1. 级联节点直接调 `pushSingleRepository`，从不校验该仓自己的 `syncType` ——
//    `remote`（只读）/ `local`（只在本地）/ `none` 的关联仓照样被推去远端。
//    `local` 那一支正是 `needsPush` 文档里写明的「私有本地数据对外泄露」。
// 2. 关联仓失败时只留在 `relatedResults` 里，目标仓成功就整体 resolve，
//    调用方没有任何结构化入口能拿到「这次级联里谁失败了、为什么」。
describe('pushRepository 级联调度契约（RXD-030）', () => {
  it('级联关联仓 syncType=remote 时按策略跳过，不去查它的待推变更', async () => {
    const harness = createHarness({ entities: [User, PushRemoteOnlyChild] });
    const childSync = createSyncRecord('PushRemoteOnlyChild', 'main', null);
    harness.syncRecords.set(childSync.id, childSync);

    const result = await pushRepository(harness.vm, 'public', 'User');

    expect(harness.changeFind.mock.calls.map(call => ruleValue(call[0].where, 'entity'))).toEqual([['User']]);
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'PushRemoteOnlyChild' },
      success: true,
      skipped: "syncType is 'remote' (read-only)"
    });
    expect(result.failures).toEqual([]);
  });

  it('级联关联仓失败时，目标结果必须结构化聚合失败清单', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const postChange = createChange({ id: 1, entity: 'Post' });
    const pushError = new Error('post push failed');
    const harness = createHarness({
      changes: [postChange],
      entities: [User, Post],
      mergeChanges: async actions => {
        if ([...actions.inserts.keys()].some(key => key.startsWith('public:Post:'))) throw pushError;
      }
    });
    const postSync = createSyncRecord('Post', 'main', null);
    harness.syncRecords.set(postSync.id, postSync);

    const result = await pushRepository(harness.vm, 'public', 'User');

    // 目标仓自己推成功了，所以仍然 resolve；但失败不能只藏在 relatedResults 里
    expect(result.success).toBe(true);
    expect(result.failures).toEqual([{ repository: { namespace: 'public', entity: 'Post' }, error: pushError }]);
  });

  it('单仓成功时 failures 是空数组而不是缺字段', async () => {
    const harness = createHarness();

    const result = await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(result.failures).toEqual([]);
  });
});

/**
 * RXD-060：级联推送的提交顺序必须按 action 类型分流。
 *
 * 同一个仓库图，INSERT 和 DELETE 需要的顺序正好相反：
 *
 * - INSERT 必须**父先**：`Post.authorId → User.id`，先提交 Post 会引用一个还不存在的 User 行，FK 失败。
 * - DELETE 必须**子先**：先删 User 会留下仍在引用它的 Post 行，同样 FK 失败。
 *
 * 原实现固定走 `topologicalSortForPush`（子→父）—— 对 DELETE 恰好对，对 INSERT 恰好错。
 * 一遍扫完所有仓库不可能同时满足两个方向，所以必须分两个相位。
 *
 * `Post` 的 `author` 是 MANY_TO_ONE → `User`，因此 User 是父、Post 是子。
 */
/** 把每次 mergeChanges 的动作摊平成 `实体:动作` 序列，跨调用保持先后。 */
const mergeTrace = (mergeChanges: ReturnType<typeof createHarness>['mergeChanges']): string[] =>
  mergeChanges.mock.calls.flatMap(([actions]) => {
    const kindOf = (kind: string, keys: Iterable<string>): string[] =>
      [...keys].map(key => `${key.split(':')[1]}:${kind}`);
    return [
      ...kindOf('DELETE', actions.deletes.keys()),
      ...kindOf('UPDATE', actions.updates.keys()),
      ...kindOf('INSERT', actions.inserts.keys())
    ];
  });

/**
 * `User`（父）+ `Post`（子）两仓级联夹具。
 *
 * 两个仓都要有 sync 记录，否则关联仓那次 `getOrCreateSyncRecord` 无处落脚。
 */
const createCascadeHarness = (changes: RxDBChange[], overrides?: Partial<Parameters<typeof createHarness>[0]>) => {
  const harness = createHarness({ changes, entities: [User, Post], ...overrides });
  const postSync = createSyncRecord('Post', 'main', null);
  harness.syncRecords.set(postSync.id, postSync);
  return harness;
};

describe('pushRepository 级联提交顺序按 action 类型分流（RXD-060）', () => {
  it('INSERT 必须父先子后（父行先落库，子行的外键才有得指）', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'User', type: 'INSERT' }),
      createChange({ id: 2, entity: 'Post', type: 'INSERT' })
    ]);

    await pushRepository(harness.vm, 'public', 'User');

    expect(mergeTrace(harness.mergeChanges)).toEqual(['User:INSERT', 'Post:INSERT']);
  });

  it('DELETE 必须子先父后（子行先删掉，父行才没人引用）', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'User', type: 'DELETE' }),
      createChange({ id: 2, entity: 'Post', type: 'DELETE' })
    ]);

    await pushRepository(harness.vm, 'public', 'User');

    expect(mergeTrace(harness.mergeChanges)).toEqual(['Post:DELETE', 'User:DELETE']);
  });

  /**
   * 混合负载才是真正的判据：单看任一类都可能被「碰巧对的那个方向」蒙混过去。
   * 整批 DELETE 先走完（子→父），再整批 INSERT/UPDATE（父→子）。
   */
  it('INSERT 与 DELETE 混在一批时，两个相位各自按自己的方向走', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'User', type: 'INSERT' }),
      createChange({ id: 2, entity: 'Post', type: 'INSERT' }),
      createChange({ id: 3, entity: 'User', type: 'DELETE' }),
      createChange({ id: 4, entity: 'Post', type: 'DELETE' })
    ]);

    await pushRepository(harness.vm, 'public', 'User');

    expect(mergeTrace(harness.mergeChanges)).toEqual(['Post:DELETE', 'User:DELETE', 'User:INSERT', 'Post:INSERT']);
  });

  /** UPDATE 跟 INSERT 同相位：改后的行同样可能新引用一个刚建的父行。 */
  it('UPDATE 与 INSERT 同相位，一起走父先子后', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'Post', type: 'UPDATE' }),
      createChange({ id: 2, entity: 'User', type: 'INSERT' })
    ]);

    await pushRepository(harness.vm, 'public', 'User');

    expect(mergeTrace(harness.mergeChanges)).toEqual(['User:INSERT', 'Post:UPDATE']);
  });

  /** 计数是跨相位聚合的，不能因为分两趟推就把同一批变更算两遍。 */
  it('分相位不改变每个仓库的推送计数', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'User', type: 'INSERT' }),
      createChange({ id: 3, entity: 'User', type: 'DELETE' }),
      createChange({ id: 2, entity: 'Post', type: 'INSERT' }),
      createChange({ id: 4, entity: 'Post', type: 'DELETE' })
    ]);

    const result = await pushRepository(harness.vm, 'public', 'User');

    expect(result).toMatchObject({
      repository: { namespace: 'public', entity: 'User' },
      originalCount: 2,
      pushed: 2,
      failed: 0,
      compacted: 0
    });
    expect(result.relatedResults?.[0]).toMatchObject({
      repository: { namespace: 'public', entity: 'Post' },
      originalCount: 2,
      pushed: 2,
      failed: 0,
      compacted: 0
    });
  });
});

/**
 * 级联的**依赖闸门**必须跟着相位翻转，不能两个相位都问 `dependsOn`。
 *
 * 顺序对了不代表闸门对。DELETE 相位是子→父，「谁排在我前面」就是 `requiredBy`；
 * INSERT/UPDATE 相位是父→子，才轮到 `dependsOn`。原实现两个相位都问 `dependsOn`，
 * 于是子仓删除失败时父仓照删不误 —— 远端要么当场违反外键约束，要么留下一批
 * 指向已删父行的孤儿，而结果里父仓还报 `success: true`。
 *
 * `Post.author` 是 MANY_TO_ONE → `User`：User 是父（`requiredBy: [Post]`），
 * Post 是子（`dependsOn: [User]`）。
 */
describe('pushRepository 级联依赖闸门按相位翻转', () => {
  /** DELETE 相位里子仓推失败，父仓的删除必须一条都不发。 */
  it('DELETE 相位子仓失败时挡下父仓的删除', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleteError = new Error('post delete failed');
    const harness = createCascadeHarness(
      [
        createChange({ id: 1, entity: 'User', type: 'DELETE' }),
        createChange({ id: 2, entity: 'Post', type: 'DELETE' })
      ],
      {
        mergeChanges: async actions => {
          if ([...actions.deletes.keys()].some(key => key.startsWith('public:Post:'))) throw deleteError;
        }
      }
    );

    const thrown = await pushRepository(harness.vm, 'public', 'User').then(
      () => {
        throw new Error('expected pushRepository to reject');
      },
      (error: unknown) => error as RxDBDependencyFailedError
    );

    expect(thrown).toBeInstanceOf(RxDBDependencyFailedError);
    expect(thrown.dependency).toEqual({ namespace: 'public', entity: 'Post' });
    expect(thrown.cause).toBe(deleteError);
    // 关键断言：User 的 DELETE 一条都没发出去
    expect(mergeTrace(harness.mergeChanges)).toEqual(['Post:DELETE']);
  });

  /** 闸门只在该挡的时候挡：子仓删除成功时，父仓照常删。 */
  it('DELETE 相位子仓成功时父仓照常删（守卫：闸门不能一刀切）', async () => {
    const harness = createCascadeHarness([
      createChange({ id: 1, entity: 'User', type: 'DELETE' }),
      createChange({ id: 2, entity: 'Post', type: 'DELETE' })
    ]);

    const result = await pushRepository(harness.vm, 'public', 'User');

    expect(mergeTrace(harness.mergeChanges)).toEqual(['Post:DELETE', 'User:DELETE']);
    expect(result.success).toBe(true);
  });

  /**
   * 被阻断的节点如果在**前一个相位**已经推了东西，这段进度必须如实交出去。
   *
   * 三级链 User ← Post ← PushComment：DELETE 相位（孙→父）三个仓全部推成功，
   * INSERT 相位（父→孙）走到 Post 时失败，PushComment 随即被 `dependsOn` 挡下。
   * 此时 PushComment 的 DELETE 早已发到远端。
   *
   * 此前这里无条件铺零进度，于是「远端确实收到了一条，结果里记作 0」，
   * 而水位线又因为本轮失败不会推进，调用方从计数上完全看不出发生过部分推送。
   */
  it('跨相位被阻断的节点保留已推送进度，不被抹成 0', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const insertError = new Error('post insert failed');
    const harness = createHarness({
      entities: [User, Post, PushComment],
      changes: [
        createChange({ id: 1, entity: 'User', type: 'INSERT' }),
        createChange({ id: 2, entity: 'Post', type: 'INSERT' }),
        createChange({ id: 3, entity: 'PushComment', type: 'INSERT' }),
        createChange({ id: 4, entity: 'PushComment', type: 'DELETE' })
      ],
      mergeChanges: async actions => {
        if ([...actions.inserts.keys()].some(key => key.startsWith('public:Post:'))) throw insertError;
      }
    });
    for (const entity of ['Post', 'PushComment']) {
      const record = createSyncRecord(entity, 'main', null);
      harness.syncRecords.set(record.id, record);
    }

    // 目标仓 User 自己推成功，所以整体 resolve；被阻断的孙仓在 relatedResults 里
    const result = await pushRepository(harness.vm, 'public', 'User');

    expect(result.success).toBe(true);

    const blocked = result.relatedResults?.find(item => item.repository.entity === 'PushComment');
    expect(blocked).toMatchObject({
      success: false,
      skipped: 'dependency public:Post failed',
      // DELETE 相位那一条已经发到远端，剩下的 INSERT 因阻断没发出去
      pushed: 1,
      failed: 1,
      originalCount: 2,
      compacted: 0
    });
    expect(blocked?.error).toBeInstanceOf(RxDBDependencyFailedError);
  });
});

// RXD-029：同 pull 一侧，`enabled` 此前对推送同样毫无约束力
describe('pushRepository 尊重 RxDBSync.enabled（RXD-029）', () => {
  it('enabled = false 时拒绝推送，且不碰远端', async () => {
    const harness = createHarness({ changes: [createChange({ id: 1 })] });
    harness.currentSync.enabled = false;

    await expect(pushRepository(harness.vm, 'public', 'User')).rejects.toThrow(/sync is disabled/);

    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('enabled = true 时照常推送（守卫：开关不能一刀切把所有仓库挡掉）', async () => {
    const harness = createHarness({ changes: [createChange({ id: 1 })] });

    const result = await pushRepository(harness.vm, 'public', 'User');

    expect(result.pushed).toBe(1);
    expect(harness.mergeChanges).toHaveBeenCalled();
  });
});

/**
 * `pushRepository` 的失败契约只有一条：抛。
 *
 * 此前级联路径抛错、单仓路径 resolve 出 `success: false`，两种形状并存。
 * `bulkSync.syncSingleRepository` 只看「有没有抛」来判定成败，于是单仓路径的失败
 * 被记成 `success: true`，`BulkSyncResult.failed` 恒为 0 —— 推送失败在聚合层完全消失。
 */
describe('pushRepository 失败一律抛出', () => {
  it('远端整批失败时抛出原始错误，而不是 resolve 出 success:false', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const remoteError = new Error('remote offline');
    const harness = createHarness({
      changes: [createChange({ id: 9 })],
      currentWatermark: 4,
      mergeChanges: async () => {
        throw remoteError;
      }
    });

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toBe(remoteError);
    // 一条都没发到远端，包一层 RxDBPartialSyncError 只会让调用方多剥一层
    expect(harness.currentSync.lastPushedChangeId).toBe(4);
  });

  it('部分批次已发到远端时，抛出的错误带上已推送进度', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const remoteError = new Error('remote offline');
    let batches = 0;
    const harness = createHarness({
      changes: [createChange({ id: 1, entityId: 'e1' as UUID }), createChange({ id: 2, entityId: 'e2' as UUID })],
      mergeChanges: async () => {
        batches++;
        if (batches === 2) throw remoteError;
        return { changeIdMapping: [{ localId: 1, remoteId: 101 }] };
      }
    });

    const thrown = await pushRepository(harness.vm, 'public', 'User', {
      includeRelated: false,
      batchSize: 1
    }).catch((error: unknown) => error);

    // 第一批已经落到远端且不会回滚，这正是 RxDBPartialSyncError 的语义
    expect(thrown).toBeInstanceOf(RxDBPartialSyncError);
    const partial = thrown as RxDBPartialSyncError<PushRepositoryResult>;
    expect(partial.cause).toBe(remoteError);
    expect(partial.result).toMatchObject({ pushed: 1, failed: 1, originalCount: 2, success: false });
    // 水位线不动：没推上去的那条下轮还要重发
    expect(harness.currentSync.lastPushedChangeId).toBeNull();
  });

  it('推送成功时照常 resolve（守卫：不能改成一律抛）', async () => {
    const harness = createHarness({ changes: [createChange({ id: 7 })] });

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).resolves.toMatchObject({
      success: true,
      pushed: 1,
      failed: 0
    });
  });
});

/**
 * 在飞区间认领：`pushRepository` 在往远端发之前就把本轮的最大变更 id 登记下来，
 * 结束（无论成败）时撤销登记。
 *
 * 缺了它，一次落在远端往返窗口里的 undo 会撤掉一条远端已经收下的变更，而撤销本身
 * 只是给原行盖 `revertChangeId`、不产生新行，出站队列又把盖过章的行排除掉 ——
 * 于是那次回滚永远发不出去，本地与远端永久分叉。详见 {@link PushInFlightRegistry}。
 */
describe('pushRepository 的在飞认领', () => {
  it('远端往返期间认领可见，往返结束后释放', async () => {
    let releaseRemote: (() => void) | undefined;
    const remoteArrived = new Promise<void>(resolve => {
      releaseRemote = resolve;
    });
    let arrived: (() => void) | undefined;
    const enteredRemote = new Promise<void>(resolve => {
      arrived = resolve;
    });

    const harness = createHarness({
      changes: [createChange({ id: 11 }), createChange({ id: 12 })],
      mergeChanges: async () => {
        arrived?.();
        await remoteArrived;
        return undefined;
      }
    });

    const pushed = pushRepository(harness.vm, 'public', 'User', { includeRelated: false });
    await enteredRemote;

    // 挂在远端调用里：这一刻正是 undo 会读到的状态
    expect([...harness.pushInFlight.snapshot()]).toEqual([['public:User', 12]]);

    releaseRemote?.();
    await pushed;

    expect([...harness.pushInFlight.snapshot()]).toEqual([]);
  });

  it('远端抛错时同样释放认领', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness({
      changes: [createChange({ id: 9 })],
      mergeChanges: async () => {
        throw new Error('remote offline');
      }
    });

    await expect(pushRepository(harness.vm, 'public', 'User', { includeRelated: false })).rejects.toThrow(
      'remote offline'
    );

    // 认领泄漏比不认领更糟：这个仓储的 undo 会被永久冻住
    expect([...harness.pushInFlight.snapshot()]).toEqual([]);
  });

  it('没有待推送变更时不认领', async () => {
    const harness = createHarness({ currentWatermark: 41 });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect([...harness.pushInFlight.snapshot()]).toEqual([]);
    expect(harness.mergeChanges).not.toHaveBeenCalled();
  });

  it('整批被本地压缩抵消时不认领：没有任何东西真的在飞', async () => {
    const entityId = '00000000-0000-0000-0000-000000000001' as UUID;
    const harness = createHarness({
      changes: [
        createChange({ id: 1, entityId, patch: { name: 'temporary' } }),
        createChange({ id: 2, entityId, type: 'DELETE', patch: null, inversePatch: null })
      ]
    });

    await pushRepository(harness.vm, 'public', 'User', { includeRelated: false });

    expect(harness.mergeChanges).not.toHaveBeenCalled();
    expect([...harness.pushInFlight.snapshot()]).toEqual([]);
  });
});
