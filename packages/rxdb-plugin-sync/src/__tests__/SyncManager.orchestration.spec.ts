/**
 * @fileoverview SyncManager 对协作模块的编排契约
 *
 * US-025 阶段 D 之前这些用例住在 `@aiao/rxdb-plugin-history` 的
 * `VersionManager.orchestration.spec.ts` 里。推拉同步搬进本包之后它们跟着走，
 * 唯一的实质改动是历史侧的替身：管理器整体换成了那张窄接口
 * （{@link SyncHistoryBridge}），于是「这次算不算完整同步」的判定不再在本包断言 ——
 * 它由桥自己用 `isCompletePull` 算，归历史包的 `pullable-count.spec.ts` 守。
 * 本包要守的是**传过去的是不是原件**：选项与结果原样交出，两边的口径才不会漂。
 */

import { RxDB, RxDBBranch, RxDBChange, RxDBPartialSyncError } from '@aiao/rxdb';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncManager } from '../SyncManager.js';

type SubscriptionStub = { unsubscribe: () => void };

type ListenerSetup = {
  subscriptions: SubscriptionStub[];
  removers: Array<() => void>;
};

const doubles = vi.hoisted(() => ({
  syncListeners: {
    setup: vi.fn<(manager: unknown) => ListenerSetup>()
  },
  delegates: {
    bulkSync: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    checkRepositoryUpdates: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    cleanupExpired: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getAllRepositorySyncStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getRepositorySyncStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pullRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pull: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pushRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    push: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    syncBranches: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    syncRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>()
  }
}));

vi.mock('../sync-listeners.js', () => ({ setupSyncListeners: doubles.syncListeners.setup }));
vi.mock('../bulk-sync.js', () => ({ bulkSync: doubles.delegates.bulkSync }));
vi.mock('../check-repository-updates.js', () => ({
  checkRepositoryUpdates: doubles.delegates.checkRepositoryUpdates
}));
vi.mock('../cleanup-expired.js', () => ({ cleanupExpired: doubles.delegates.cleanupExpired }));
vi.mock('../get-all-repository-sync-status.js', () => ({
  getAllRepositorySyncStatus: doubles.delegates.getAllRepositorySyncStatus
}));
vi.mock('../get-repository-sync-status.js', () => ({
  getRepositorySyncStatus: doubles.delegates.getRepositorySyncStatus
}));
vi.mock('../pull-repository.js', () => ({ pullRepository: doubles.delegates.pullRepository }));
vi.mock('../pull.js', () => ({ pull: doubles.delegates.pull }));
vi.mock('../push-repository.js', () => ({ pushRepository: doubles.delegates.pushRepository }));
vi.mock('../push.js', () => ({ push: doubles.delegates.push }));
vi.mock('../sync-branches.js', () => ({ syncBranches: doubles.delegates.syncBranches }));
vi.mock('../sync-repository.js', () => ({ syncRepository: doubles.delegates.syncRepository }));

type RepositoryStub = {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type AdapterStub = {
  getRepository: ReturnType<typeof vi.fn>;
};

/**
 * 历史桥的替身。
 *
 * @remarks
 * 只有八个成员，逐个手搭而不是 `as unknown as`：接口一旦加成员，这里立刻编译失败，
 * 而那正是两个包之间唯一的耦合面，漏一个都该被拦下来。
 *
 * `syncing` 透传而不是吞掉：同步 guard 的语义是「包住它跑」，替身把回调丢掉的话，
 * 下面每一条 `expect(delegates.pull).toHaveBeenCalledWith(...)` 都会变成空断言。
 */
const createBridge = () => ({
  pushInFlight: { kind: 'push-in-flight' },
  syncing: vi.fn(<T>(operation: () => Promise<T>) => operation()),
  clearUndoHistory: vi.fn<() => void>(),
  beginPullableSettlement: vi.fn<() => number>(() => 7),
  settlePull: vi.fn<(token: number, options: unknown, result: unknown) => void>(),
  settleAbortedPull: vi.fn<(token: number, pulled: number) => void>(),
  reconcilePullableCount: vi.fn<(token: number, count: number) => void>(),
  incrementPullableCount: vi.fn<(count: number) => void>()
});

type Bridge = ReturnType<typeof createBridge>;

type Harness = {
  manager: SyncManager;
  rxdb: RxDB;
  history: Bridge;
  localAdapter: AdapterStub;
  remoteAdapter: AdapterStub;
  localBranchRepository: RepositoryStub;
  localChangeRepository: RepositoryStub;
  remoteBranchRepository: RepositoryStub;
  remoteChangeRepository: RepositoryStub;
};

function createRepository(): RepositoryStub {
  return {
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (entity: unknown) => entity),
    update: vi.fn().mockImplementation(async (entity: unknown, patch: object) => Object.assign(entity as object, patch))
  };
}

function createHarness(entities: unknown[] = []): Harness {
  const localBranchRepository = createRepository();
  const localChangeRepository = createRepository();
  const remoteBranchRepository = createRepository();
  const remoteChangeRepository = createRepository();
  const localAdapter = {
    getRepository: vi
      .fn<(entity: unknown) => unknown>()
      .mockImplementation(entity => (entity === RxDBBranch ? localBranchRepository : localChangeRepository))
  };
  const remoteAdapter = {
    getRepository: vi
      .fn<(entity: unknown) => unknown>()
      .mockImplementation(entity => (entity === RxDBBranch ? remoteBranchRepository : remoteChangeRepository))
  };
  const rxdb = {
    config: {
      entities,
      sync: {
        local: { adapter: 'local' },
        remote: { adapter: 'remote' }
      }
    },
    localAdapter$: of(localAdapter),
    remoteAdapter$: of(remoteAdapter),
    connected$: of(false),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as RxDB;
  const history = createBridge();
  const manager = new SyncManager(rxdb, history as unknown as SyncManager['history']);

  return {
    manager,
    rxdb,
    history,
    localAdapter,
    remoteAdapter,
    localBranchRepository,
    localChangeRepository,
    remoteBranchRepository,
    remoteChangeRepository
  };
}

function createPullResult(pulled: number) {
  return {
    pulled,
    compacted: 0,
    applied: pulled,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: pulled > 0,
    historyInvalidated: pulled > 0,
    failures: []
  };
}

function createPushResult(pushed: number) {
  return {
    pushed,
    failed: 0,
    compacted: 0,
    originalCount: pushed
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  doubles.syncListeners.setup.mockReturnValue({ subscriptions: [], removers: [] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SyncManager 对协作模块的编排契约', () => {
  it('initializes listeners and releases every lifecycle resource on destroy', () => {
    const harness = createHarness();
    const removeCreate = vi.fn();
    const removeUpdate = vi.fn();
    const unsubscribeResume = vi.fn();
    const unsubscribeStatus = vi.fn();
    doubles.syncListeners.setup.mockReturnValue({
      subscriptions: [{ unsubscribe: unsubscribeResume }, { unsubscribe: unsubscribeStatus }],
      removers: [removeCreate, removeUpdate]
    });

    harness.manager.init();

    expect(doubles.syncListeners.setup).toHaveBeenCalledWith(harness.manager);

    harness.manager.destroy();

    expect(removeCreate).toHaveBeenCalledOnce();
    expect(removeUpdate).toHaveBeenCalledOnce();
    expect(unsubscribeResume).toHaveBeenCalledOnce();
    expect(unsubscribeStatus).toHaveBeenCalledOnce();
  });

  // 在飞登记处的主人在历史侧（push 与 undo 唯一的会合点），本管理器只是把桥上那一个转出去。
  // 自己 new 一个的话，push 认领的区间 undo 永远读不到。
  it('exposes the history-owned push-in-flight registry', () => {
    const harness = createHarness();

    expect(harness.manager.pushInFlight).toBe(harness.history.pushInFlight);
  });

  it('refreshes pullable count from enabled repository watermarks', async () => {
    const harness = createHarness();
    doubles.delegates.getAllRepositorySyncStatus.mockResolvedValue([
      { enabled: true, pullableCount: 3 },
      { enabled: false, pullableCount: 40 },
      { enabled: true, pullableCount: 4 }
    ]);

    await expect(harness.manager.refreshPullableCount()).resolves.toBe(7);

    expect(harness.history.beginPullableSettlement).toHaveBeenCalledOnce();
    expect(doubles.delegates.getAllRepositorySyncStatus).toHaveBeenCalledWith(harness.rxdb);
    expect(harness.history.reconcilePullableCount).toHaveBeenCalledWith(7, 7);
  });

  it('wraps pull in the syncing guard and settles pull state', async () => {
    const { manager, history } = createHarness();
    const changed = createPullResult(2);
    doubles.delegates.pull.mockResolvedValueOnce(changed).mockResolvedValueOnce(createPullResult(0));

    await expect(manager.pull({ limit: 25, fetchAll: true })).resolves.toBe(changed);

    expect(history.syncing).toHaveBeenCalledOnce();
    expect(doubles.delegates.pull).toHaveBeenCalledWith(manager, { limit: 25, fetchAll: true });
    // RXD-034：令牌必须在 pull **之前**取，否则拉取期间到达的远端事件无从察觉
    expect(history.beginPullableSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.delegates.pull.mock.invocationCallOrder[0]
    );
    expect(history.settlePull).toHaveBeenCalledWith(7, { limit: 25, fetchAll: true }, changed);
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();

    await manager.pull();

    expect(history.settlePull).toHaveBeenCalledTimes(2);
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  // RXD-034：分页 / 逐仓 / 有失败的 pull 只处理了一部分，全局归零等于谎报「已经拉干净了」。
  // 判据（`isCompletePull`）留在历史侧，由 `pullable-count.spec.ts` 守；本包只保证选项与结果
  // 原样送到 —— 在这儿先算一遍再传结论，两边的口径迟早会漂。
  it.each([
    ['paged', { limit: 10 }, { hasMore: true }],
    ['repository-filtered', { repositoryFilter: ['public:Todo'] }, {}],
    ['partially failed', undefined, { failures: [{ error: new Error('remote down') }] }]
  ])('hands the history bridge the untouched options and result of a %s pull', async (_label, options, overrides) => {
    const { manager, history } = createHarness();
    const result = { ...createPullResult(2), ...overrides };
    doubles.delegates.pull.mockResolvedValue(result);

    await manager.pull(options);

    expect(history.settlePull).toHaveBeenCalledWith(7, options, result);
    expect(history.settleAbortedPull).not.toHaveBeenCalled();
  });

  it('still settles the pullable count when pull throws', async () => {
    const { manager, history } = createHarness();
    doubles.delegates.pull.mockRejectedValue(new Error('pull exploded'));

    await expect(manager.pull()).rejects.toThrow('pull exploded');

    // 拉失败说明一条都没结算掉，但令牌得收回来，否则下一次 pull 会一直被判成「有并发事件」
    expect(history.settleAbortedPull).toHaveBeenCalledWith(7, 0);
    expect(history.settlePull).not.toHaveBeenCalled();
  });

  // 部分成功以异常形式抛出，但 `error.result` 里那部分是真的落库了 —— 得照实扣掉
  it('settles the already-applied portion of a partial pull failure', async () => {
    const { manager, history } = createHarness();
    doubles.delegates.pull.mockRejectedValue(
      new RxDBPartialSyncError(createPullResult(4), new Error('second repository failed'))
    );

    await expect(manager.pull({ repositoryFilter: ['public:Todo', 'public:Tag'] })).rejects.toBeInstanceOf(
      RxDBPartialSyncError
    );

    expect(history.settleAbortedPull).toHaveBeenCalledWith(7, 4);
    // 已落库的那部分改写了本地实体数据，undo 边界照样要作废
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  // RXD-031：`pulled > 0` 只说明「从远端取回了变更」，压缩全抵消时本地实体数据没有任何变化。
  // 拿它当历史边界失效的判据，会把用户当前 session 的 undo 栈白白清空。
  it('does not clear undo history when a pull changed no local entity data', async () => {
    const { manager, history } = createHarness();
    const result = {
      pulled: 5,
      compacted: 5,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: true,
      historyInvalidated: false,
      failures: []
    };
    doubles.delegates.pull.mockResolvedValue(result);

    await manager.pull();

    expect(history.settlePull).toHaveBeenCalledWith(7, undefined, result);
    expect(history.clearUndoHistory).not.toHaveBeenCalled();
  });

  it('wraps push in the syncing guard and clears history only after changes', async () => {
    const { manager, history } = createHarness();
    const changed = createPushResult(3);
    doubles.delegates.push.mockResolvedValueOnce(changed).mockResolvedValueOnce(createPushResult(0));

    await expect(manager.push({ batchSize: 10 })).resolves.toBe(changed);

    expect(doubles.delegates.push).toHaveBeenCalledWith(manager, { batchSize: 10 });
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();

    await manager.push();

    expect(history.syncing).toHaveBeenCalledTimes(2);
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  it('runs sync as pull then push and preserves rejection semantics', async () => {
    const { manager, history } = createHarness();
    const pullResult = createPullResult(0);
    const pushResult = createPushResult(1);
    doubles.delegates.pull.mockResolvedValueOnce(pullResult);
    doubles.delegates.push.mockResolvedValueOnce(pushResult);

    await expect(manager.sync({ pull: { limit: 7 }, push: { batchSize: 4 } })).resolves.toEqual({
      pullResult,
      pushResult
    });

    expect(doubles.delegates.pull).toHaveBeenCalledWith(manager, { limit: 7 });
    expect(doubles.delegates.push).toHaveBeenCalledWith(manager, { batchSize: 4 });
    expect(doubles.delegates.pull.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.delegates.push.mock.invocationCallOrder[0]
    );
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();

    const failure = new Error('pull failed');
    doubles.delegates.pull.mockRejectedValueOnce(failure);

    await expect(manager.sync()).rejects.toBe(failure);
    expect(doubles.delegates.push).toHaveBeenCalledOnce();
    expect(history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  it('does not clear history after a zero-change full sync', async () => {
    const { manager, history } = createHarness();
    doubles.delegates.pull.mockResolvedValue(createPullResult(0));
    doubles.delegates.push.mockResolvedValue(createPushResult(0));

    await manager.sync();

    expect(history.clearUndoHistory).not.toHaveBeenCalled();
  });

  // RXD-034：`sync()` 内部就是一次 pull，却从来不结算 pullable 计数 ——
  // 「同步完了远端待拉还是 5」这个 bug 只在走 sync 的路径上出现，与 pull() 的口径互相矛盾。
  it('settles the pullable count on the sync path too', async () => {
    const { manager, history } = createHarness();
    const pullResult = createPullResult(3);
    doubles.delegates.pull.mockResolvedValue(pullResult);
    doubles.delegates.push.mockResolvedValue(createPushResult(0));

    await manager.sync({ pull: { repositoryFilter: ['public:Todo'] } });

    expect(history.settlePull).toHaveBeenCalledWith(7, { repositoryFilter: ['public:Todo'] }, pullResult);
  });

  it('settles the pullable count when the sync path pull throws', async () => {
    const { manager, history } = createHarness();
    doubles.delegates.pull.mockRejectedValue(new Error('sync pull exploded'));

    await expect(manager.sync()).rejects.toThrow('sync pull exploded');

    expect(history.settleAbortedPull).toHaveBeenCalledWith(7, 0);
  });

  it('wraps repository sync methods and applies their history rules', async () => {
    const { manager, history } = createHarness();
    const pullResult = {
      repository: { namespace: 'public', entity: 'Todo' },
      pulled: 2,
      persistedProgress: true,
      historyInvalidated: true
    };
    const pushResult = { repository: { namespace: 'public', entity: 'Todo' }, pushed: 1 };
    const syncResult = {
      pullResult: {
        repository: { namespace: 'public', entity: 'Todo' },
        pulled: 0,
        persistedProgress: false,
        historyInvalidated: false
      },
      pushResult: { repository: { namespace: 'public', entity: 'Todo' }, pushed: 1 }
    };
    doubles.delegates.pullRepository.mockResolvedValue(pullResult);
    doubles.delegates.pushRepository.mockResolvedValue(pushResult);
    doubles.delegates.syncRepository.mockResolvedValue(syncResult);

    await expect(manager.pullRepository('public', 'Todo', { limit: 20, includeRelated: false })).resolves.toBe(
      pullResult
    );
    await expect(manager.pushRepository('public', 'Todo', { batchSize: 5, includeRelated: false })).resolves.toBe(
      pushResult
    );
    await expect(
      manager.syncRepository('public', 'Todo', {
        direction: 'sync',
        pull: { limit: 10 },
        push: { batchSize: 2 }
      })
    ).resolves.toBe(syncResult);

    expect(doubles.delegates.pullRepository).toHaveBeenCalledWith(manager, 'public', 'Todo', {
      limit: 20,
      includeRelated: false
    });
    expect(doubles.delegates.pushRepository).toHaveBeenCalledWith(manager, 'public', 'Todo', {
      batchSize: 5,
      includeRelated: false
    });
    expect(doubles.delegates.syncRepository).toHaveBeenCalledWith(manager, 'public', 'Todo', {
      direction: 'sync',
      pull: { limit: 10 },
      push: { batchSize: 2 }
    });
    expect(history.syncing).toHaveBeenCalledTimes(3);
    expect(history.clearUndoHistory).toHaveBeenCalledTimes(3);
  });

  it('does not clear history for zero-change repository operations', async () => {
    const { manager, history } = createHarness();
    doubles.delegates.pullRepository.mockResolvedValue({ pulled: 0 });
    doubles.delegates.pushRepository.mockResolvedValue({ pushed: 0 });
    doubles.delegates.syncRepository.mockResolvedValue({
      pullResult: { pulled: 0 },
      pushResult: { pushed: 0 }
    });

    await manager.pullRepository('public', 'Todo');
    await manager.pushRepository('public', 'Todo');
    await manager.syncRepository('public', 'Todo');

    expect(history.clearUndoHistory).not.toHaveBeenCalled();
  });

  it('delegates branch sync, cleanup, status, and bulk operations with exact arguments', async () => {
    const harness = createHarness();
    const branchSyncResult = { created: 1, updated: 0 };
    const cleanupResult = { removed: 2, removedIds: ['1', '2'] };
    const updateResult = { hasUpdates: true, updateCount: 3, latestChangeId: 9, lastPulledChangeId: 6 };
    const status = { namespace: 'public', entity: 'Todo' };
    const statuses = [status];
    const bulkResult = { succeeded: 1, failed: 0, results: [], durationMs: 5 };
    doubles.delegates.syncBranches.mockResolvedValue(branchSyncResult);
    doubles.delegates.cleanupExpired.mockResolvedValue(cleanupResult);
    doubles.delegates.checkRepositoryUpdates.mockResolvedValue(updateResult);
    doubles.delegates.getRepositorySyncStatus.mockResolvedValue(status);
    doubles.delegates.getAllRepositorySyncStatus.mockResolvedValue(statuses);
    doubles.delegates.bulkSync.mockResolvedValue(bulkResult);

    await expect(harness.manager.syncBranches()).resolves.toBe(branchSyncResult);
    await expect(harness.manager.cleanupExpired('public', 'Todo', { dryRun: true })).resolves.toBe(cleanupResult);
    await expect(harness.manager.checkRepositoryUpdates('public', 'Todo')).resolves.toBe(updateResult);
    await expect(harness.manager.getRepositorySyncStatus('public', 'Todo')).resolves.toBe(status);
    await expect(harness.manager.getAllRepositorySyncStatus({ enabled: true })).resolves.toBe(statuses);
    await expect(
      harness.manager.bulkSync({
        operation: 'pull',
        repositories: [{ namespace: 'public', entity: 'Todo' }],
        concurrent: true,
        concurrency: 2
      })
    ).resolves.toBe(bulkResult);

    expect(doubles.delegates.syncBranches).toHaveBeenCalledWith(harness.manager);
    expect(doubles.delegates.cleanupExpired).toHaveBeenCalledWith(harness.manager, 'public', 'Todo', { dryRun: true });
    expect(doubles.delegates.checkRepositoryUpdates).toHaveBeenCalledWith(harness.rxdb, 'public', 'Todo');
    expect(doubles.delegates.getRepositorySyncStatus).toHaveBeenCalledWith(harness.rxdb, 'public', 'Todo');
    expect(doubles.delegates.getAllRepositorySyncStatus).toHaveBeenCalledWith(harness.rxdb, { enabled: true });
    expect(doubles.delegates.bulkSync).toHaveBeenCalledWith(harness.rxdb, {
      operation: 'pull',
      repositories: [{ namespace: 'public', entity: 'Todo' }],
      concurrent: true,
      concurrency: 2
    });
  });

  // 依赖图与拓扑排序是纯函数，替身只会把「真的排出这个顺序了吗」换成「真的调了这个函数吗」。
  // 这里跑真实现，断言排出来的图与顺序本身。
  it('从已注册实体算出真实依赖图与拉取顺序', () => {
    const { manager } = createHarness([RxDBBranch]);

    const graph = manager.getRepositoryDependencyGraph();
    expect(graph.has('rxdb:RxDBBranch')).toBe(true);

    expect(manager.getRepositorySyncOrder('pull')).toEqual([{ namespace: 'rxdb', entity: 'RxDBBranch' }]);
  });

  it('returns local and remote system repositories from their adapter streams', async () => {
    const harness = createHarness();

    await expect(harness.manager.getLocalRepositories()).resolves.toEqual({
      branchRepository: harness.localBranchRepository,
      changeRepository: harness.localChangeRepository,
      adapter: harness.localAdapter
    });
    await expect(harness.manager.getRemoteRepositories()).resolves.toEqual({
      branchRepository: harness.remoteBranchRepository,
      changeRepository: harness.remoteChangeRepository,
      adapter: harness.remoteAdapter
    });

    expect(harness.localAdapter.getRepository).toHaveBeenNthCalledWith(1, RxDBBranch);
    expect(harness.localAdapter.getRepository).toHaveBeenNthCalledWith(2, RxDBChange);
    expect(harness.remoteAdapter.getRepository).toHaveBeenNthCalledWith(1, RxDBBranch);
    expect(harness.remoteAdapter.getRepository).toHaveBeenNthCalledWith(2, RxDBChange);
  });

  describe('undo 边界与部分失败', () => {
    // US-025 阶段 D 之前这组用例住在历史包的 `VersionManager.spec.ts` 里，跟着方法一起搬过来。
    // 判据统一是 `historyInvalidated` 而非 `pulled`：拉回来的变更可能被压缩全部抵消，
    // 那种情况下本地实体数据一个字节都没变，清空用户的 undo 栈没有任何依据。

    it('部分失败但只推进了水位线时不动 undo 边界', async () => {
      const { manager, history } = createHarness();
      const untouched = { ...createPullResult(2), applied: 0, compacted: 2, historyInvalidated: false };
      doubles.delegates.pull.mockRejectedValue(new RxDBPartialSyncError(untouched, new Error('repo pull failed')));

      await expect(manager.pull()).rejects.toBeInstanceOf(RxDBPartialSyncError);

      expect(history.settleAbortedPull).toHaveBeenCalledWith(7, 2);
      expect(history.clearUndoHistory).not.toHaveBeenCalled();
    });

    it('普通错误既不结算已落库条数也不动 undo 边界', async () => {
      const { manager, history } = createHarness();
      const plainError = new Error('network down');
      doubles.delegates.pull.mockRejectedValue(plainError);

      await expect(manager.pull()).rejects.toBe(plainError);

      expect(history.settleAbortedPull).toHaveBeenCalledWith(7, 0);
      expect(history.clearUndoHistory).not.toHaveBeenCalled();
    });

    // RXD-031 D：fetchAll 多轮拉取中途失败时，前面几轮的事务已经真实提交
    it.each([
      ['改写了本地数据', true, 1],
      ['只推进了水位线', false, 0]
    ])('pullRepository 部分失败且%s时清空 %d 次 undo 历史', async (_label, historyInvalidated, expected) => {
      const { manager, history } = createHarness();
      const partial = {
        repository: { namespace: 'public', entity: 'Todo' },
        pulled: 4,
        compacted: 0,
        applied: historyInvalidated ? 2 : 0,
        hasMore: true,
        conflictsResolved: 0,
        conflictsDeferred: 0,
        persistedProgress: true,
        historyInvalidated,
        failures: []
      };
      const partialError = new RxDBPartialSyncError(partial, new Error('round 2 failed'));
      doubles.delegates.pullRepository.mockRejectedValue(partialError);

      await expect(manager.pullRepository('public', 'Todo')).rejects.toBe(partialError);

      expect(history.clearUndoHistory).toHaveBeenCalledTimes(expected);
    });

    // RXD-068：失败仓库在失败前可能已经提交了部分进度，它藏在 `item.error.result` 里。
    // 只看 `item.result` 会漏掉这部分 —— 远端数据已落库，用户却仍能 undo 回同步前状态，
    // 重新制造本地/远端分叉。
    it('bulkSync 里失败仓库携带的 partial 进度也要推进 undo 边界', async () => {
      const { manager, history } = createHarness();
      const partialError = new RxDBPartialSyncError(
        {
          pullResult: { pulled: 4, compacted: 0, applied: 4, hasMore: false },
          persistedProgress: true,
          historyInvalidated: true
        },
        new Error('second page failed')
      );
      doubles.delegates.bulkSync.mockResolvedValue({
        succeeded: 0,
        failed: 1,
        results: [{ repository: { namespace: 'public', entity: 'User' }, success: false, error: partialError }],
        durationMs: 3
      });

      await manager.bulkSync();

      expect(history.clearUndoHistory).toHaveBeenCalledOnce();
    });

    // `pull()` / `pullRepository()` 早就补了这道 catch，`sync()` / `syncRepository()` 一直没有：
    // 部分成功以异常形式抛出，方法直接返回错误、undo 边界原地不动，而远端数据已经落库。
    it.each([
      ['改写了本地数据', true, 1],
      ['只推进了水位线', false, 0]
    ])('sync 的 pull 阶段部分失败且%s时清空 %d 次 undo 历史', async (_label, historyInvalidated, expected) => {
      const { manager, history } = createHarness();
      const partial = { ...createPullResult(4), applied: historyInvalidated ? 4 : 0, historyInvalidated };
      const partialError = new RxDBPartialSyncError(partial, new Error('round 2 failed'));
      doubles.delegates.pull.mockRejectedValue(partialError);

      await expect(manager.sync()).rejects.toBe(partialError);

      expect(history.clearUndoHistory).toHaveBeenCalledTimes(expected);
    });

    // pull 已经把远端变更合进来了，push 才抛错：进度不在异常里，而在那个再也出不来的 pullResult 上。
    it('sync 的 pull 已合并、push 抛错时仍清空 undo 历史', async () => {
      const { manager, history } = createHarness();
      const pushFailure = new Error('push failed');
      doubles.delegates.pull.mockResolvedValue(createPullResult(4));
      doubles.delegates.push.mockRejectedValue(pushFailure);

      await expect(manager.sync()).rejects.toBe(pushFailure);

      expect(history.clearUndoHistory).toHaveBeenCalledOnce();
    });

    it('sync 的 pull 一条没改、push 抛错时不动 undo 边界', async () => {
      const { manager, history } = createHarness();
      const pushFailure = new Error('push failed');
      doubles.delegates.pull.mockResolvedValue(createPullResult(0));
      doubles.delegates.push.mockRejectedValue(pushFailure);

      await expect(manager.sync()).rejects.toBe(pushFailure);

      expect(history.clearUndoHistory).not.toHaveBeenCalled();
    });

    // 仓库粒度的判据比 pull 多一条：push 已经上行的部分同样不可 undo，
    // 此时 `historyInvalidated` 仍是 false，只有 `pushResult.pushed` 看得见。
    it.each([
      ['pull 改写了本地数据', true, 0, 1],
      ['push 已经上行', false, 3, 1],
      ['两段都只是空转', false, 0, 0]
    ])('syncRepository 部分失败且%s时清空 %d 次 undo 历史', async (_label, historyInvalidated, pushed, expected) => {
      const { manager, history } = createHarness();
      const partial = {
        pullResult: { ...createPullResult(4), applied: historyInvalidated ? 4 : 0, historyInvalidated },
        pushResult: createPushResult(pushed),
        persistedProgress: true,
        historyInvalidated
      };
      const partialError = new RxDBPartialSyncError(partial, new Error('push batch 2 failed'));
      doubles.delegates.syncRepository.mockRejectedValue(partialError);

      await expect(manager.syncRepository('public', 'Todo')).rejects.toBe(partialError);

      expect(history.clearUndoHistory).toHaveBeenCalledTimes(expected);
    });
  });
});
