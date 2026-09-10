import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_LOCAL_CREATE_EVENT } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { RxDBPartialSyncError } from '../../RxDBError.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { VersionManager } from '../../version/VersionManager.js';

type DetachedOperation = () => Promise<unknown>;
type EventListener = (event: unknown) => void;
type SubscriptionStub = { unsubscribe: () => void };

type ListenerSetup = {
  subscriptions: SubscriptionStub[];
  removers: Array<() => void>;
};

const doubles = vi.hoisted(() => ({
  history: {
    instances: [] as unknown[],
    constructed: vi.fn<(rxdb: unknown) => void>(),
    destroy: vi.fn<() => void>(),
    invalidateRedoStack: vi.fn<() => Promise<void>>(),
    isExecutingUndoRedo: vi.fn<() => boolean>(),
    resetSyncCleared: vi.fn<(changeIds: number[]) => void>(),
    clearUndoHistory: vi.fn<() => void>(),
    clearAllUndoHistory: vi.fn<() => void>(),
    resetPullableCount: vi.fn<() => void>(),
    beginPullableSettlement: vi.fn<() => number>(),
    reconcilePullableCount: vi.fn<(token: number, count: number) => void>(),
    settlePullableCount: vi.fn<(token: number, settlement: { complete: boolean; pulled: number }) => void>(),
    clearRedoStack: vi.fn<() => void>(),
    setUndoBranch: vi.fn<(branchId: string) => void>(),
    syncing: vi.fn<(operation: DetachedOperation) => void>(),
    history: vi.fn<(options?: unknown) => unknown>(),
    pushableCount$: { kind: 'pushable' },
    pullableCount$: { kind: 'pullable' }
  },
  syncListeners: {
    setup: vi.fn<(manager: unknown, historyManager: unknown) => ListenerSetup>(),
    isIgnorableError: vi.fn<(error: unknown) => boolean>()
  },
  delegates: {
    bulkSync: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    checkRepositoryUpdates: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    cleanupExpired: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    createBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getAllRepositorySyncStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getRepositorySyncStatus: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mergeBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pullRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pull: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    pushRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    push: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    removeBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getSwitchVersionActions: vi.fn<(...args: unknown[]) => unknown>(),
    switchBranchActions: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    syncBranches: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    syncRepository: vi.fn<(...args: unknown[]) => Promise<unknown>>()
  }
}));

vi.mock('../../version/HistoryManager.js', () => ({
  HistoryManager: class HistoryManagerMock {
    readonly pushableCount$ = doubles.history.pushableCount$;
    readonly pullableCount$ = doubles.history.pullableCount$;

    constructor(rxdb: unknown) {
      doubles.history.instances.push(this);
      doubles.history.constructed(rxdb);
    }

    destroy(): void {
      doubles.history.destroy();
    }

    invalidateRedoStack(): Promise<void> {
      return doubles.history.invalidateRedoStack();
    }

    isExecutingUndoRedo(): boolean {
      return doubles.history.isExecutingUndoRedo();
    }

    resetSyncCleared(changeIds: number[]): void {
      doubles.history.resetSyncCleared(changeIds);
    }

    clearUndoHistory(): void {
      doubles.history.clearUndoHistory();
    }

    clearAllUndoHistory(): void {
      doubles.history.clearAllUndoHistory();
    }

    resetPullableCount(): void {
      doubles.history.resetPullableCount();
    }

    beginPullableSettlement(): number {
      return doubles.history.beginPullableSettlement();
    }

    reconcilePullableCount(token: number, count: number): void {
      doubles.history.reconcilePullableCount(token, count);
    }

    settlePullableCount(token: number, settlement: { complete: boolean; pulled: number }): void {
      doubles.history.settlePullableCount(token, settlement);
    }

    clearRedoStack(): void {
      doubles.history.clearRedoStack();
    }

    setUndoBranch(branchId: string): void {
      doubles.history.setUndoBranch(branchId);
    }

    async syncing<T>(operation: () => Promise<T>): Promise<T> {
      doubles.history.syncing(operation);
      return operation();
    }

    history(options?: unknown): unknown {
      return doubles.history.history(options);
    }
  }
}));

vi.mock('../../version/sync-listeners.js', () => ({
  isIgnorableDetachedVersionEventError: doubles.syncListeners.isIgnorableError,
  setupVersionSyncListeners: doubles.syncListeners.setup
}));

vi.mock('../../version/bulk-sync.js', () => ({ bulkSync: doubles.delegates.bulkSync }));
vi.mock('../../version/check-repository-updates.js', () => ({
  checkRepositoryUpdates: doubles.delegates.checkRepositoryUpdates
}));
vi.mock('../../version/cleanup-expired.js', () => ({ cleanupExpired: doubles.delegates.cleanupExpired }));
vi.mock('../../version/create-branch.js', () => ({ create_branch: doubles.delegates.createBranch }));
vi.mock('../../version/get-all-repository-sync-status.js', () => ({
  getAllRepositorySyncStatus: doubles.delegates.getAllRepositorySyncStatus
}));
vi.mock('../../version/get-repository-sync-status.js', () => ({
  getRepositorySyncStatus: doubles.delegates.getRepositorySyncStatus
}));
vi.mock('../../version/merge-branch.js', () => ({ merge_branch: doubles.delegates.mergeBranch }));
vi.mock('../../version/pull-repository.js', () => ({ pullRepository: doubles.delegates.pullRepository }));
vi.mock('../../version/pull.js', () => ({ pull: doubles.delegates.pull }));
vi.mock('../../version/push-repository.js', () => ({ pushRepository: doubles.delegates.pushRepository }));
vi.mock('../../version/push.js', () => ({ push: doubles.delegates.push }));
vi.mock('../../version/remove-branch.js', () => ({ remove_branch: doubles.delegates.removeBranch }));
vi.mock('../../version/switch-branch-actions.js', () => ({
  get_switch_version_actions: doubles.delegates.getSwitchVersionActions,
  switch_branch_actions: doubles.delegates.switchBranchActions
}));
vi.mock('../../version/sync-branches.js', () => ({ syncBranches: doubles.delegates.syncBranches }));
vi.mock('../../version/sync-repository.js', () => ({ syncRepository: doubles.delegates.syncRepository }));

type RepositoryStub = {
  find: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

type AdapterStub = {
  getRepository: ReturnType<typeof vi.fn>;
  switchBranch: ReturnType<typeof vi.fn>;
};

type Harness = {
  manager: VersionManager;
  rxdb: RxDB;
  addEventListener: ReturnType<typeof vi.fn<(type: string, listener: EventListener) => void>>;
  removeEventListener: ReturnType<typeof vi.fn<(type: string, listener: EventListener) => void>>;
  dispatchEvent: ReturnType<typeof vi.fn<(event: { type: string }) => boolean>>;
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
  const addEventListener = vi.fn<(type: string, listener: EventListener) => void>();
  const removeEventListener = vi.fn<(type: string, listener: EventListener) => void>();
  const dispatchEvent = vi.fn<(event: { type: string }) => boolean>().mockReturnValue(true);
  const localBranchRepository = createRepository();
  const localChangeRepository = createRepository();
  const remoteBranchRepository = createRepository();
  const remoteChangeRepository = createRepository();
  const localAdapter = {
    getRepository: vi
      .fn<(entity: unknown) => unknown>()
      .mockImplementation(entity => (entity === RxDBBranch ? localBranchRepository : localChangeRepository)),
    switchBranch: vi.fn<(options: unknown) => Promise<void>>().mockResolvedValue(undefined)
  };
  const remoteAdapter = {
    getRepository: vi
      .fn<(entity: unknown) => unknown>()
      .mockImplementation(entity => (entity === RxDBBranch ? remoteBranchRepository : remoteChangeRepository)),
    switchBranch: vi.fn<(options: unknown) => Promise<void>>().mockResolvedValue(undefined)
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
    addEventListener,
    removeEventListener,
    dispatchEvent
  } as unknown as RxDB;
  const manager = new VersionManager(rxdb);

  return {
    manager,
    rxdb,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    localAdapter,
    remoteAdapter,
    localBranchRepository,
    localChangeRepository,
    remoteBranchRepository,
    remoteChangeRepository
  };
}

function getLocalCreateListener(addEventListener: Harness['addEventListener']): EventListener {
  const registration = addEventListener.mock.calls.find(([type]) => type === ENTITY_LOCAL_CREATE_EVENT);
  if (!registration) {
    throw new Error('VersionManager did not register the local create listener');
  }
  return registration[1];
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

async function flushDetachedTask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetAllMocks();
  doubles.history.instances.length = 0;
  doubles.history.invalidateRedoStack.mockResolvedValue(undefined);
  doubles.history.isExecutingUndoRedo.mockReturnValue(false);
  doubles.history.beginPullableSettlement.mockReturnValue(7);
  doubles.history.history.mockReturnValue({ type: 'database' });
  doubles.syncListeners.setup.mockReturnValue({ subscriptions: [], removers: [] });
  doubles.syncListeners.isIgnorableError.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VersionManager 对协作模块的编排契约', () => {
  it('initializes listeners and releases every lifecycle resource on destroy', () => {
    const harness = createHarness();
    const removeCreate = vi.fn();
    const removeUpdate = vi.fn();
    const unsubscribeConnected = vi.fn();
    const unsubscribeStatus = vi.fn();
    doubles.syncListeners.setup.mockReturnValue({
      subscriptions: [{ unsubscribe: unsubscribeConnected }, { unsubscribe: unsubscribeStatus }],
      removers: [removeCreate, removeUpdate]
    });

    harness.manager.init();

    expect(doubles.history.constructed).toHaveBeenCalledWith(harness.rxdb);
    expect(doubles.syncListeners.setup).toHaveBeenCalledWith(harness.manager, doubles.history.instances[0]);
    expect(harness.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));

    const localListener = getLocalCreateListener(harness.addEventListener);
    harness.manager.destroy();

    expect(doubles.history.destroy).toHaveBeenCalledOnce();
    expect(harness.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, localListener);
    expect(removeCreate).toHaveBeenCalledOnce();
    expect(removeUpdate).toHaveBeenCalledOnce();
    expect(unsubscribeConnected).toHaveBeenCalledOnce();
    expect(unsubscribeStatus).toHaveBeenCalledOnce();
  });

  it('resets session state and exposes HistoryManager count streams', () => {
    const { manager } = createHarness();

    expect(manager.pushableCount$).toBe(doubles.history.pushableCount$);
    expect(manager.pullableCount$).toBe(doubles.history.pullableCount$);
    expect(manager.history()).toEqual({ type: 'database' });
    expect(doubles.history.history).toHaveBeenCalledWith(undefined);

    manager.resetSessionState();

    // RXD-026：session 重置作废的是整个连接的历史，不只是当前分支
    expect(doubles.history.clearAllUndoHistory).toHaveBeenCalledOnce();
    expect(doubles.history.clearUndoHistory).not.toHaveBeenCalled();
    expect(doubles.history.resetPullableCount).toHaveBeenCalledOnce();
  });

  it('filters local events and forwards only numeric RxDBChange ids', async () => {
    const { manager, addEventListener } = createHarness();
    manager.init();
    const listener = getLocalCreateListener(addEventListener);

    listener({
      entities: [
        { namespace: 'rxdb', entity: 'RxDBChange', id: 41 },
        { namespace: 'rxdb', entity: 'RxDBChange', id: 'not-numeric' },
        { namespace: 'public', entity: 'Todo', id: 42 }
      ]
    });
    listener({});
    listener({ entities: [{ namespace: 'public', entity: 'Todo', id: 43 }] });
    await flushDetachedTask();

    expect(doubles.history.invalidateRedoStack).toHaveBeenCalledOnce();
    expect(doubles.history.resetSyncCleared).toHaveBeenCalledWith([41]);

    doubles.history.isExecutingUndoRedo.mockReturnValue(true);
    listener({ entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id: 44 }] });

    expect(doubles.history.invalidateRedoStack).toHaveBeenCalledOnce();
    expect(doubles.history.resetSyncCleared).toHaveBeenCalledOnce();
  });

  it('logs detached failures but ignores shutdown failures', async () => {
    const { manager, addEventListener } = createHarness();
    const shutdownError = new Error('adapter closed');
    const realError = new Error('storage failed');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    doubles.history.invalidateRedoStack.mockRejectedValueOnce(shutdownError).mockRejectedValueOnce(realError);
    doubles.syncListeners.isIgnorableError.mockImplementation(error => error === shutdownError);
    manager.init();
    const listener = getLocalCreateListener(addEventListener);

    listener({ entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id: 1 }] });
    listener({ entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id: 2 }] });
    await flushDetachedTask();

    expect(doubles.syncListeners.isIgnorableError).toHaveBeenCalledWith(shutdownError);
    expect(doubles.syncListeners.isIgnorableError).toHaveBeenCalledWith(realError);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('[VersionManager] invalidateRedoStack failed:', realError);
  });

  it('delegates branch, cleanup, status, and bulk operations with exact arguments', async () => {
    const harness = createHarness();
    const branch = { id: 'feature' };
    const branchSyncResult = { created: 1, updated: 0 };
    const cleanupResult = { removed: 2, removedIds: ['1', '2'] };
    const updateResult = { hasUpdates: true, updateCount: 3, latestChangeId: 9, lastPulledChangeId: 6 };
    const status = { namespace: 'public', entity: 'Todo' };
    const statuses = [status];
    const bulkResult = { succeeded: 1, failed: 0, results: [], durationMs: 5 };
    doubles.delegates.createBranch.mockResolvedValue(branch);
    doubles.delegates.removeBranch.mockResolvedValue(undefined);
    doubles.delegates.syncBranches.mockResolvedValue(branchSyncResult);
    doubles.delegates.cleanupExpired.mockResolvedValue(cleanupResult);
    doubles.delegates.checkRepositoryUpdates.mockResolvedValue(updateResult);
    doubles.delegates.getRepositorySyncStatus.mockResolvedValue(status);
    doubles.delegates.getAllRepositorySyncStatus.mockResolvedValue(statuses);
    doubles.delegates.bulkSync.mockResolvedValue(bulkResult);

    await expect(harness.manager.createBranch('feature', 17)).resolves.toBe(branch);
    await expect(harness.manager.removeBranch('obsolete')).resolves.toBeUndefined();
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

    expect(doubles.delegates.createBranch).toHaveBeenCalledWith(harness.manager, 'feature', 17);
    expect(doubles.delegates.removeBranch).toHaveBeenCalledWith(harness.manager, 'obsolete');
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

  it('refreshes pullable count from enabled repository watermarks', async () => {
    const harness = createHarness();
    doubles.delegates.getAllRepositorySyncStatus.mockResolvedValue([
      { enabled: true, pullableCount: 3 },
      { enabled: false, pullableCount: 40 },
      { enabled: true, pullableCount: 4 }
    ]);

    await expect(harness.manager.refreshPullableCount()).resolves.toBe(7);

    expect(doubles.history.beginPullableSettlement).toHaveBeenCalledOnce();
    expect(doubles.delegates.getAllRepositorySyncStatus).toHaveBeenCalledWith(harness.rxdb);
    expect(doubles.history.reconcilePullableCount).toHaveBeenCalledWith(7, 7);
  });

  it('wraps pull in the syncing guard and settles pull state', async () => {
    const { manager } = createHarness();
    const changed = createPullResult(2);
    doubles.delegates.pull.mockResolvedValueOnce(changed).mockResolvedValueOnce(createPullResult(0));

    await expect(manager.pull({ limit: 25, fetchAll: true })).resolves.toBe(changed);

    expect(doubles.history.syncing).toHaveBeenCalledOnce();
    expect(doubles.delegates.pull).toHaveBeenCalledWith(manager, { limit: 25, fetchAll: true });
    // RXD-034：令牌必须在 pull **之前**取，否则拉取期间到达的远端事件无从察觉
    expect(doubles.history.beginPullableSettlement.mock.invocationCallOrder[0]).toBeLessThan(
      doubles.delegates.pull.mock.invocationCallOrder[0]
    );
    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: true, pulled: 2 });
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();

    await manager.pull();

    expect(doubles.history.settlePullableCount).toHaveBeenCalledTimes(2);
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  // RXD-034：分页 / 逐仓 / 有失败的 pull 只处理了一部分，全局归零等于谎报「已经拉干净了」
  it.each([
    ['paged', { limit: 10 }, { hasMore: true }],
    ['repository-filtered', { repositoryFilter: ['public:Todo'] }, {}],
    ['partially failed', undefined, { failures: [{ error: new Error('remote down') }] }]
  ])('settles a %s pull as incomplete', async (_label, options, resultOverrides) => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockResolvedValue({ ...createPullResult(2), ...resultOverrides });

    await manager.pull(options);

    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: false, pulled: 2 });
    expect(doubles.history.resetPullableCount).not.toHaveBeenCalled();
  });

  it('still settles the pullable count when pull throws', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockRejectedValue(new Error('pull exploded'));

    await expect(manager.pull()).rejects.toThrow('pull exploded');

    // 拉失败说明一条都没结算掉，但令牌得收回来，否则下一次 pull 会一直被判成「有并发事件」
    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: false, pulled: 0 });
  });

  // 部分成功以异常形式抛出，但 `error.result` 里那部分是真的落库了 —— 得照实扣掉
  it('settles the already-applied portion of a partial pull failure', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockRejectedValue(
      new RxDBPartialSyncError(createPullResult(4), new Error('second repository failed'))
    );

    await expect(manager.pull({ repositoryFilter: ['public:Todo', 'public:Tag'] })).rejects.toBeInstanceOf(
      RxDBPartialSyncError
    );

    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: false, pulled: 4 });
  });

  // RXD-031：`pulled > 0` 只说明「从远端取回了变更」，压缩全抵消时本地实体数据没有任何变化。
  // 拿它当历史边界失效的判据，会把用户当前 session 的 undo 栈白白清空。
  it('does not clear undo history when a pull changed no local entity data', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockResolvedValue({
      pulled: 5,
      compacted: 5,
      applied: 0,
      hasMore: false,
      conflictsResolved: 0,
      conflictsDeferred: 0,
      persistedProgress: true,
      historyInvalidated: false,
      failures: []
    });

    await manager.pull();

    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: true, pulled: 5 });
    expect(doubles.history.clearUndoHistory).not.toHaveBeenCalled();
  });

  it('wraps push in the syncing guard and clears history only after changes', async () => {
    const { manager } = createHarness();
    const changed = createPushResult(3);
    doubles.delegates.push.mockResolvedValueOnce(changed).mockResolvedValueOnce(createPushResult(0));

    await expect(manager.push({ batchSize: 10 })).resolves.toBe(changed);

    expect(doubles.delegates.push).toHaveBeenCalledWith(manager, { batchSize: 10 });
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();

    await manager.push();

    expect(doubles.history.syncing).toHaveBeenCalledTimes(2);
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  it('runs sync as pull then push and preserves rejection semantics', async () => {
    const { manager } = createHarness();
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
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();

    const failure = new Error('pull failed');
    doubles.delegates.pull.mockRejectedValueOnce(failure);

    await expect(manager.sync()).rejects.toBe(failure);
    expect(doubles.delegates.push).toHaveBeenCalledOnce();
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();
  });

  it('does not clear history after a zero-change full sync', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockResolvedValue(createPullResult(0));
    doubles.delegates.push.mockResolvedValue(createPushResult(0));

    await manager.sync();

    expect(doubles.history.clearUndoHistory).not.toHaveBeenCalled();
  });

  // RXD-034：`sync()` 内部就是一次 pull，却从来不结算 pullable 计数 ——
  // 「同步完了远端待拉还是 5」这个 bug 只在走 sync 的路径上出现，与 pull() 的口径互相矛盾。
  it('settles the pullable count on the sync path too', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockResolvedValue(createPullResult(3));
    doubles.delegates.push.mockResolvedValue(createPushResult(0));

    await manager.sync({ pull: { repositoryFilter: ['public:Todo'] } });

    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: false, pulled: 3 });
  });

  it('settles the pullable count when the sync path pull throws', async () => {
    const { manager } = createHarness();
    doubles.delegates.pull.mockRejectedValue(new Error('sync pull exploded'));

    await expect(manager.sync()).rejects.toThrow('sync pull exploded');

    expect(doubles.history.settlePullableCount).toHaveBeenCalledWith(7, { complete: false, pulled: 0 });
  });

  it('wraps repository sync methods and applies their history rules', async () => {
    const { manager } = createHarness();
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
    expect(doubles.history.syncing).toHaveBeenCalledTimes(3);
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledTimes(3);
  });

  it('does not clear history for zero-change repository operations', async () => {
    const { manager } = createHarness();
    doubles.delegates.pullRepository.mockResolvedValue({ pulled: 0 });
    doubles.delegates.pushRepository.mockResolvedValue({ pushed: 0 });
    doubles.delegates.syncRepository.mockResolvedValue({
      pullResult: { pulled: 0 },
      pushResult: { pushed: 0 }
    });

    await manager.pullRepository('public', 'Todo');
    await manager.pushRepository('public', 'Todo');
    await manager.syncRepository('public', 'Todo');

    expect(doubles.history.clearUndoHistory).not.toHaveBeenCalled();
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

  it('switches branches through production orchestration and rolls back failures', async () => {
    const harness = createHarness();
    const currentBranch = Object.assign(Object.create(RxDBBranch.prototype) as InstanceType<typeof RxDBBranch>, {
      id: 'main',
      activated: true
    });
    const actions = { inserts: new Map(), updates: new Map(), deletes: new Map() };
    vi.spyOn(harness.manager, 'getCurrentBranch').mockResolvedValue(currentBranch);
    doubles.delegates.switchBranchActions.mockResolvedValue(actions);

    await harness.manager.switchBranch('feature');

    expect(doubles.delegates.switchBranchActions).toHaveBeenCalledWith(harness.manager, 'feature');
    expect(harness.localAdapter.switchBranch).toHaveBeenCalledWith({ branchId: 'feature', actions });
    expect(doubles.history.clearRedoStack).toHaveBeenCalledOnce();
    // RXD-026：undo session 按分支存放，切分支必须在这里同步把视图带过去
    expect(doubles.history.setUndoBranch).toHaveBeenCalledWith('feature');
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'SWITCH_BRANCH_BEGIN',
      'SWITCH_BRANCH_COMMIT'
    ]);

    const failure = new Error('switch failed');
    harness.localAdapter.switchBranch.mockRejectedValueOnce(failure);

    await expect(harness.manager.switchBranch('broken')).rejects.toBe(failure);
    expect(harness.dispatchEvent.mock.calls.at(-1)?.[0].type).toBe('SWITCH_BRANCH_ROLLBACK');

    // 适配器 switchBranch 已成功（内部事务已提交）之后的收尾动作失败时，
    // 不得再发 Rollback —— 分支确实切过去了，发回滚是假信号
    harness.dispatchEvent.mockClear();
    harness.localAdapter.switchBranch.mockResolvedValueOnce(undefined);
    doubles.history.clearRedoStack.mockImplementationOnce(() => {
      throw new Error('clearRedoStack failed');
    });

    await expect(harness.manager.switchBranch('committed-then-boom')).rejects.toThrow('clearRedoStack failed');
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.type)).not.toContain('SWITCH_BRANCH_ROLLBACK');
  });

  it('skips switching when the requested branch is already active', async () => {
    const harness = createHarness();
    const currentBranch = Object.assign(Object.create(RxDBBranch.prototype) as InstanceType<typeof RxDBBranch>, {
      id: 'main',
      activated: true
    });
    vi.spyOn(harness.manager, 'getCurrentBranch').mockResolvedValue(currentBranch);

    await harness.manager.switchBranch('main');

    expect(doubles.delegates.switchBranchActions).not.toHaveBeenCalled();
    expect(harness.localAdapter.switchBranch).not.toHaveBeenCalled();
    expect(harness.dispatchEvent).not.toHaveBeenCalled();
  });

  it('commits merge results, preserves history for no-op merges, and rolls back errors', async () => {
    const harness = createHarness();
    const currentBranch = Object.assign(Object.create(RxDBBranch.prototype) as InstanceType<typeof RxDBBranch>, {
      id: 'main',
      activated: true
    });
    vi.spyOn(harness.manager, 'getCurrentBranch').mockResolvedValue(currentBranch);
    const merged = { merged: 2 };
    doubles.delegates.mergeBranch.mockResolvedValueOnce(merged).mockResolvedValueOnce({ merged: 0 });

    await expect(harness.manager.mergeBranch('feature', { strategy: 'squash' })).resolves.toBe(merged);
    await harness.manager.mergeBranch('empty');

    expect(doubles.delegates.mergeBranch).toHaveBeenNthCalledWith(1, harness.manager, 'feature', 'main', {
      strategy: 'squash'
    });
    expect(doubles.history.clearUndoHistory).toHaveBeenCalledOnce();
    expect(harness.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual([
      'MERGE_BRANCH_BEGIN',
      'MERGE_BRANCH_COMMIT',
      'MERGE_BRANCH_BEGIN',
      'MERGE_BRANCH_COMMIT'
    ]);

    const failure = new Error('merge failed');
    doubles.delegates.mergeBranch.mockRejectedValueOnce(failure);

    await expect(harness.manager.mergeBranch('broken')).rejects.toBe(failure);

    const failureTypes = harness.dispatchEvent.mock.calls.slice(-1).map(([event]) => event.type);
    expect(failureTypes).toContain('MERGE_BRANCH_FAILED');
  });

  it('rejects merge when the active branch lookup yields no branch', async () => {
    const { manager } = createHarness();
    vi.spyOn(manager, 'getCurrentBranch').mockImplementation(
      async () => undefined as unknown as InstanceType<typeof RxDBBranch>
    );

    await expect(manager.mergeBranch('feature')).rejects.toThrow('No active branch found');
    expect(doubles.delegates.mergeBranch).not.toHaveBeenCalled();
  });
});
