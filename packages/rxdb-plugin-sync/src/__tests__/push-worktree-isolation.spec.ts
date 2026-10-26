import {
  createEntitySyncResolver,
  type EntityType,
  type IRxDBChange,
  type RemoteMergeResult,
  type RxDB,
  RxDBBranch,
  RxDBChange,
  RxDBSync,
  type SyncOptions,
  SyncType,
  type TransactionExecutor,
  WorktreeTableSet
} from '@aiao/rxdb';
import { PushInFlightRegistry, type SyncHistoryBridge } from '@aiao/rxdb-plugin-history';
import { of } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { SyncManager } from '../SyncManager.js';
import { makeBranch } from './fixtures/branch-repository-stub.js';
import { User } from './fixtures/test-entities.js';
import { createTransactionExecutorStub } from './fixtures/transaction-executor-stub.js';

const createHarness = (changeCount = 1) => {
  let tableSet = WorktreeTableSet.MAIN;
  const shadow = WorktreeTableSet.of('wt_review', [User]);
  const sync: SyncOptions = { type: SyncType.Full, local: { adapter: 'local' }, remote: { adapter: 'remote' } };
  const main = makeBranch('main');
  const branch = makeBranch('private-checkout');
  branch.activated = false;
  branch.activeKey = shadow.holderKey;
  const change: RxDBChange = {
    id: 1,
    branchId: main.id,
    namespace: 'public',
    entity: 'User',
    entityId: '00000000-0000-0000-0000-000000000001',
    type: 'INSERT',
    patch: { id: '00000000-0000-0000-0000-000000000001', name: 'main data' },
    inversePatch: null,
    remoteId: null,
    revertChangeId: null,
    rejectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch$: Object.assign(of(main), { set: vi.fn(), remove: vi.fn() })
  };
  const records = [main, branch].map(item => {
    const record: RxDBSync = {
      id: `public:User:${item.id}`,
      namespace: 'public',
      entity: 'User',
      branchId: item.id,
      enabled: true,
      syncType: 'full',
      lastPushedChangeId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      lastPullRemoteChangeId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      remove: async () => record,
      reset: vi.fn(),
      save: async () => record
    };
    return record;
  });
  const changes = Array.from({ length: changeCount }, (_, index): RxDBChange => ({
    ...change,
    id: index + 1,
    entityId: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    patch: { id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`, name: 'main data' }
  }));
  const branchRepository = {
    find: vi.fn(async (options: { where: { rules: Array<{ field: string; value: unknown }> } }) => {
      const rule = options.where.rules[0];
      if (rule.field === 'activated') return [main];
      if (rule.field === 'activeKey') return [branch];
      return rule.value === branch.id ? [branch] : [main];
    })
  };
  const syncRepository = {
    find: vi.fn(async (options: { where: { rules: Array<{ value: unknown }> } }) =>
      records.filter(item => item.id === options.where.rules[0].value)
    ),
    update: vi.fn(async (item: RxDBSync, patch: Partial<RxDBSync>) => Object.assign(item, patch))
  };
  const changeRepository = { find: vi.fn(async () => changes) };
  const getRepository = (entity: EntityType) => {
    if (entity === RxDBBranch) return branchRepository;
    if (entity === RxDBSync) return syncRepository;
    if (entity === RxDBChange) return changeRepository;
    throw new Error('意外仓库');
  };
  const adapter = {
    getRepository,
    transaction: async (fun: (executor: TransactionExecutor) => Promise<unknown>) =>
      fun(
        createTransactionExecutorStub({
          getRepository,
          tableSet,
          saveMany: async items => items
        })
      )
  };
  const mergeChanges = vi.fn(
    async (_actions: unknown, _branchId: unknown, changes: IRxDBChange[]): Promise<RemoteMergeResult> => ({
      results: changes.map(item => ({ localId: item.id, status: 'applied', remoteId: item.id + 100 }))
    })
  );
  const remote = { mergeChanges, getRepository };
  const rxdb = {
    config: { entities: [User], sync },
    context: { clientId: 'review' },
    entitySync: createEntitySyncResolver(sync),
    localAdapter$: of(adapter),
    remoteAdapter$: of(remote),
    get worktreeTableSet() {
      return tableSet;
    },
    dispatchEvent: vi.fn(),
    syncState: { reportRejections: vi.fn() }
  } as unknown as RxDB;
  const clearUndoHistory = vi.fn<(branchId?: string) => void>();
  const history = {
    pushInFlight: new PushInFlightRegistry(),
    syncing: <T>(fun: () => Promise<T>) => fun(),
    clearUndoHistory,
    captureUndoHistory: (branchId: string) => () => clearUndoHistory(branchId),
    beginPullableSettlement: () => 0,
    settlePull: vi.fn(),
    settleAbortedPull: vi.fn(),
    reconcilePullableCount: vi.fn(),
    incrementPullableCount: vi.fn()
  } satisfies SyncHistoryBridge;
  const manager = new SyncManager(rxdb, history);
  return {
    manager,
    shadow,
    branch,
    change: changes[0],
    mergeChanges,
    clearUndoHistory: history.clearUndoHistory,
    mount: (set: WorktreeTableSet) => {
      tableSet = set;
    }
  };
};

it('主检出位 push 在规划前换挂后拒绝上传', async () => {
  const { manager, shadow, mergeChanges, mount } = createHarness();
  const getRemoteRepositories = manager.getRemoteRepositories.bind(manager);
  const reached = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  let first = true;
  vi.spyOn(manager, 'getRemoteRepositories').mockImplementation(async () => {
    if (first) {
      first = false;
      reached.resolve();
      await resume.promise;
    }
    return getRemoteRepositories();
  });

  const pending = manager.pushRepository('public', 'User', { includeRelated: false });
  await reached.promise;
  mount(shadow);
  resume.resolve();
  await expect(pending).rejects.toThrow('同步只在主检出位上跑');
  expect(mergeChanges).not.toHaveBeenCalled();
});

it('读取期间换挂再挂回主检出位也拒绝影子分支快照', async () => {
  const { manager, shadow, branch, mergeChanges, mount } = createHarness();
  vi.spyOn(manager, 'getCurrentBranch').mockImplementation(async () => {
    mount(shadow);
    const snapshot = branch;
    mount(WorktreeTableSet.MAIN);
    return snapshot;
  });

  await expect(manager.pushRepository('public', 'User', { includeRelated: false })).rejects.toThrow(
    '拒绝同步非主检出位分支 private-checkout'
  );
  expect(mergeChanges).not.toHaveBeenCalled();
});

it('规划完成但尚未发出时换挂也不上传', async () => {
  const { manager, shadow, mergeChanges, mount } = createHarness();
  const getRemoteRepositories = manager.getRemoteRepositories.bind(manager);
  let reads = 0;
  vi.spyOn(manager, 'getRemoteRepositories').mockImplementation(async () => {
    reads += 1;
    if (reads === 2) mount(shadow);
    return getRemoteRepositories();
  });

  await expect(manager.pushRepository('public', 'User', { includeRelated: false })).rejects.toThrow(
    '同步只在主检出位上跑'
  );
  expect(mergeChanges).not.toHaveBeenCalled();
});

it('已发出的主分支变更在换挂后只记回执，不清影子分支的历史', async () => {
  const { manager, shadow, change, mergeChanges, mount, clearUndoHistory } = createHarness();
  mergeChanges.mockImplementationOnce(async (_actions, _branchId, changes) => {
    mount(shadow);
    return { results: changes.map(item => ({ localId: item.id, status: 'applied', remoteId: item.id + 100 })) };
  });

  const result = await manager.pushRepository('public', 'User', { includeRelated: false });
  expect(result.pushed).toBe(1);
  expect(mergeChanges.mock.calls[0]?.[1]).toBe('main');
  expect(change.remoteId).toBe(101);
  expect(clearUndoHistory).toHaveBeenCalledWith('main');
});

it('始终挂在主检出位时照常推送并清理历史', async () => {
  const { manager, mergeChanges, clearUndoHistory } = createHarness();
  const result = await manager.pushRepository('public', 'User', { includeRelated: false });
  expect(result.pushed).toBe(1);
  expect(mergeChanges.mock.calls[0]?.[1]).toBe('main');
  expect(clearUndoHistory).toHaveBeenCalledWith('main');
});

it('首批已上传后换挂阻止第二批：失效来源 main 历史，回执尚未落库也不能撤销', async () => {
  const { manager, shadow, change, mergeChanges, mount, clearUndoHistory } = createHarness(2);
  mergeChanges.mockImplementationOnce(async (_actions, _branchId, changes) => {
    mount(shadow);
    return { results: changes.map(item => ({ localId: item.id, status: 'applied', remoteId: item.id + 100 })) };
  });

  await expect(manager.pushRepository('public', 'User', { includeRelated: false, batchSize: 1 })).rejects.toMatchObject(
    {
      result: { pushed: 1, failed: 1 }
    }
  );
  expect(mergeChanges).toHaveBeenCalledOnce();
  expect(change.remoteId).toBeNull();
  expect(clearUndoHistory).toHaveBeenCalledWith('main');
});
