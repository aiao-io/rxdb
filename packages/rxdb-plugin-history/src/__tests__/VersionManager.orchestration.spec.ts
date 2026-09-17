/**
 * @fileoverview VersionManager 对协作模块的编排契约
 *
 * US-025 阶段 D 之前这份文件还管着推拉同步的编排。同步搬进 `@aiao/rxdb-plugin-sync`
 * 之后那半边跟着走（见该包的 `SyncManager.orchestration.spec.ts`），这里只剩本包自己
 * 的三件事：生命周期、本地事件过滤、分支编排。
 */

import { ENTITY_LOCAL_CREATE_EVENT, RxDB, RxDBBranch, RxDBChange } from '@aiao/rxdb';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionManager } from '../VersionManager.js';

type DetachedOperation = () => Promise<unknown>;
type EventListener = (event: unknown) => void;

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
    clearRedoStack: vi.fn<() => void>(),
    setUndoBranch: vi.fn<(branchId: string) => void>(),
    syncing: vi.fn<(operation: DetachedOperation) => void>(),
    history: vi.fn<(options?: unknown) => unknown>(),
    pushableCount$: { kind: 'pushable' },
    pullableCount$: { kind: 'pullable' }
  },
  detachedError: {
    isIgnorable: vi.fn<(error: unknown) => boolean>()
  },
  delegates: {
    createBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    mergeBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    removeBranch: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    getSwitchVersionActions: vi.fn<(...args: unknown[]) => unknown>(),
    switchBranchActions: vi.fn<(...args: unknown[]) => Promise<unknown>>()
  }
}));

vi.mock('../HistoryManager.js', () => ({
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

vi.mock('../detached-event-error.js', () => ({
  isIgnorableDetachedVersionEventError: doubles.detachedError.isIgnorable
}));

vi.mock('../create-branch.js', () => ({ create_branch: doubles.delegates.createBranch }));
vi.mock('../merge-branch.js', () => ({ merge_branch: doubles.delegates.mergeBranch }));
vi.mock('../remove-branch.js', () => ({ remove_branch: doubles.delegates.removeBranch }));
vi.mock('../switch-branch-actions.js', () => ({
  get_switch_version_actions: doubles.delegates.getSwitchVersionActions,
  switch_branch_actions: doubles.delegates.switchBranchActions
}));

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

function createHarness(): Harness {
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
      entities: [],
      sync: {
        local: { adapter: 'local' },
        remote: { adapter: 'remote' }
      }
    },
    localAdapter$: of(localAdapter),
    remoteAdapter$: of(remoteAdapter),
    connected$: of(false),
    // 没有能力插件贡献：切换前的前置判定短路，编排顺序与今天一致。
    systemContributions: [],
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

async function flushDetachedTask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetAllMocks();
  doubles.history.instances.length = 0;
  doubles.history.invalidateRedoStack.mockResolvedValue(undefined);
  doubles.history.isExecutingUndoRedo.mockReturnValue(false);
  doubles.history.history.mockReturnValue({ type: 'database' });
  doubles.detachedError.isIgnorable.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VersionManager 对协作模块的编排契约', () => {
  // 阶段 D 之后 `init()` 只登记本包自己的事件监听：远端事件那几条随同步插件走了。
  // 断言逐条列出注册与注销的配对，是因为「装了没拆」在真实环境里表现为换库之后
  // 旧实例还在收事件，而它不会让任何一条现有用例变红。
  it('initializes listeners and releases every lifecycle resource on destroy', () => {
    const harness = createHarness();

    harness.manager.init();

    expect(doubles.history.constructed).toHaveBeenCalledWith(harness.rxdb);
    expect(harness.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));

    const localListener = getLocalCreateListener(harness.addEventListener);
    const registeredTypes = harness.addEventListener.mock.calls.map(([type]) => type);
    harness.manager.destroy();

    expect(doubles.history.destroy).toHaveBeenCalledOnce();
    expect(harness.removeEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, localListener);
    expect(harness.removeEventListener.mock.calls.map(([type]) => type)).toEqual(registeredTypes);
  });

  // 同步桥是两包之间唯一的耦合面，而 `pushInFlight` 必须与 undo 侧读的是同一个实例
  // —— 桥上换成另一个登记处，push 认领的区间 undo 就永远读不到。
  it('exposes a sync bridge that shares the push-in-flight registry', () => {
    const { manager } = createHarness();

    expect(manager.syncBridge.pushInFlight).toBe(manager.pushInFlight);
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
    doubles.detachedError.isIgnorable.mockImplementation(error => error === shutdownError);
    manager.init();
    const listener = getLocalCreateListener(addEventListener);

    listener({ entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id: 1 }] });
    listener({ entities: [{ namespace: 'rxdb', entity: 'RxDBChange', id: 2 }] });
    await flushDetachedTask();

    expect(doubles.detachedError.isIgnorable).toHaveBeenCalledWith(shutdownError);
    expect(doubles.detachedError.isIgnorable).toHaveBeenCalledWith(realError);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('[VersionManager] invalidateRedoStack failed:', realError);
  });

  it('delegates branch operations with exact arguments', async () => {
    const harness = createHarness();
    const branch = { id: 'feature' };
    doubles.delegates.createBranch.mockResolvedValue(branch);
    doubles.delegates.removeBranch.mockResolvedValue(undefined);

    await expect(harness.manager.createBranch('feature', 17)).resolves.toBe(branch);
    await expect(harness.manager.removeBranch('obsolete')).resolves.toBeUndefined();

    expect(doubles.delegates.createBranch).toHaveBeenCalledWith(harness.manager, 'feature', 17);
    expect(doubles.delegates.removeBranch).toHaveBeenCalledWith(harness.manager, 'obsolete');
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
