import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { ReachabilityMonitor } from '../../network/reachability.js';
import { flushQueryCacheOutbox, type QueryCacheOutboxResult } from '../../repository/query-cache-outbox.js';
import {
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent,
  type RxDBEntityRemoteCreatedEventData
} from '../../rxdb-events.js';
import type { HistoryManager } from '../../version/HistoryManager.js';
import { isIgnorableDetachedVersionEventError, setupVersionSyncListeners } from '../../version/sync-listeners.js';
import type { VersionManager } from '../../version/VersionManager.js';
import { detachedReachability } from '../fixtures/reachability.js';

// 出站重放本身有自己的用例（`repository/query-cache-outbox.spec.ts`）。这里只关心
// 「谁在什么时候调它、调了几次、拿哪几个仓库调」，所以整模块换成一个探针。
// 用函数声明而不是 const：`vi.mock` 的工厂会被提升到 import 之前执行，那时 const 还没初始化。
function makeOutboxResult(namespace: string, entity: string): QueryCacheOutboxResult {
  return {
    repository: { namespace, entity },
    originalCount: 0,
    compacted: 0,
    replayed: 0,
    discarded: 0,
    noop: 0,
    watermark: null,
    failures: []
  };
}

vi.mock('../../repository/query-cache-outbox.js', () => ({
  flushQueryCacheOutbox: vi.fn((_vm: unknown, namespace: string, entity: string) =>
    Promise.resolve(makeOutboxResult(namespace, entity))
  )
}));

const flushOutbox = vi.mocked(flushQueryCacheOutbox);

/** flush 探针收到的仓库名单，按调用顺序 */
const flushedEntities = (): string[] => flushOutbox.mock.calls.map(([, , entity]) => entity);

/** QueryCache 仓库：联网后走 REST 重放，不进 changelog 管道 */
@Entity({
  name: 'CachedRecipe',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
})
class CachedRecipe extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

/** Full 仓库：由 `versionManager.push()` 负责，不该出现在 flush 名单里 */
@Entity({
  name: 'VersionedTodo',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
})
class VersionedTodo extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

/** Local 仓库：没有远端，两条路都不该碰它 */
@Entity({
  name: 'LocalDraft',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.Local, local: { adapter: 'sqlite' } }
})
class LocalDraft extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

type RemoteEventType =
  typeof ENTITY_REMOTE_CREATE_EVENT | typeof ENTITY_REMOTE_UPDATE_EVENT | typeof ENTITY_REMOTE_REMOVE_EVENT;
type RemoteEntityEvent = EntityRemoteCreatedEvent | EntityRemoteUpdatedEvent | EntityRemoteRemovedEvent;
type RemoteEventHandler = (event: RemoteEntityEvent) => void;
type SyncBranches = () => Promise<void>;
type GetCurrentBranch = () => Promise<{ id: string }>;
type IncrementPullableCount = (count: number) => void;

type Push = () => Promise<{ pushed: number }>;

type HarnessOptions = {
  connected?: boolean;
  entities?: unknown[];
  getCurrentBranch?: GetCurrentBranch;
  hasRemoteAdapter?: boolean;
  push?: Push;
  reachability?: ReachabilityMonitor;
  syncBranches?: SyncBranches;
};

type SyncListenerHarness = {
  addEventListener: ReturnType<typeof vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>>;
  connected$: BehaviorSubject<boolean>;
  emit: (event: RemoteEntityEvent) => void;
  getCurrentBranch: ReturnType<typeof vi.fn<GetCurrentBranch>>;
  incrementPullableCount: ReturnType<typeof vi.fn<IncrementPullableCount>>;
  listeners: Map<RemoteEventType, Set<RemoteEventHandler>>;
  push: ReturnType<typeof vi.fn<Push>>;
  reachability: ReachabilityMonitor;
  removeEventListener: ReturnType<typeof vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>>;
  result: ReturnType<typeof setupVersionSyncListeners>;
  syncBranches: ReturnType<typeof vi.fn<SyncBranches>>;
};

type RemoteEventCase = {
  eventName: string;
  label: string;
  create: (entities: RxDBEntityRemoteCreatedEventData[]) => RemoteEntityEvent;
};

const REMOTE_EVENT_CASES: readonly RemoteEventCase[] = [
  {
    eventName: ENTITY_REMOTE_CREATE_EVENT,
    label: 'onRemoteCreate',
    create: entities => new EntityRemoteCreatedEvent(entities)
  },
  {
    eventName: ENTITY_REMOTE_UPDATE_EVENT,
    label: 'onRemoteUpdate',
    create: entities => new EntityRemoteUpdatedEvent(entities)
  },
  {
    eventName: ENTITY_REMOTE_REMOVE_EVENT,
    label: 'onRemoteRemove',
    create: entities => new EntityRemoteRemovedEvent(entities)
  }
];

const createRemoteEntity = (
  type: 'INSERT' | 'UPDATE' | 'DELETE',
  id: string,
  branchId?: string
): RxDBEntityRemoteCreatedEventData => ({
  type,
  namespace: 'app',
  entity: 'Todo',
  id,
  recordAt: new Date('2026-07-10T00:00:00.000Z'),
  data: { id },
  ...(branchId === undefined ? {} : { branchId })
});

/**
 * 把已经排上队的异步任务放完。
 *
 * @remarks
 * 回推链是「syncBranches → push → 逐个 flush」的串行 await，微任务数量随仓库个数变化，
 * 数着 `Promise.resolve()` 迟早会数漏。让出一个宏任务把整条链跑到底，计数断言才可信。
 */
const settleDetachedTasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

const createHarness = (options: HarnessOptions = {}): SyncListenerHarness => {
  const connected$ = new BehaviorSubject(options.connected ?? false);
  const listeners = new Map<RemoteEventType, Set<RemoteEventHandler>>();
  const addEventListener = vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>((type, handler) => {
    const handlers = listeners.get(type) ?? new Set<RemoteEventHandler>();
    handlers.add(handler);
    listeners.set(type, handlers);
  });
  const removeEventListener = vi.fn<(type: RemoteEventType, handler: RemoteEventHandler) => void>((type, handler) => {
    listeners.get(type)?.delete(handler);
  });
  const syncBranches = vi.fn<SyncBranches>(options.syncBranches ?? (() => Promise.resolve()));
  const getCurrentBranch = vi.fn<GetCurrentBranch>(options.getCurrentBranch ?? (() => Promise.resolve({ id: 'main' })));
  const incrementPullableCount = vi.fn<IncrementPullableCount>();
  const push = vi.fn<Push>(options.push ?? (() => Promise.resolve({ pushed: 0 })));
  const reachability = options.reachability ?? detachedReachability();
  const entities = options.entities ?? [CachedRecipe, VersionedTodo, LocalDraft];
  const rxdb = {
    config:
      options.hasRemoteAdapter === false ?
        { entities }
      : {
          entities,
          sync: {
            remote: { adapter: 'remote' }
          }
        },
    connected$: connected$.asObservable(),
    reachability,
    addEventListener,
    removeEventListener
  };
  const versionManager = {
    rxdb,
    syncBranches,
    push,
    getCurrentBranch
  } as unknown as VersionManager;
  const historyManager = { incrementPullableCount } as unknown as HistoryManager;
  const result = setupVersionSyncListeners(versionManager, historyManager);

  return {
    addEventListener,
    connected$,
    emit: event => {
      const type = event.type as RemoteEventType;
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
    getCurrentBranch,
    incrementPullableCount,
    listeners,
    push,
    reachability,
    removeEventListener,
    result,
    syncBranches
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  flushOutbox.mockClear();
  flushOutbox.mockImplementation((_vm, namespace, entity) => Promise.resolve(makeOutboxResult(namespace, entity)));
});

describe('isIgnorableDetachedVersionEventError', () => {
  const cases: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['errno 44', { errno: 44 }, true],
    ['AbortError', { name: 'AbortError' }, true],
    ['adapter shutdown', new Error('database is closed'), true],
    ['ordinary error', new Error('query failed'), false],
    ['null', null, false],
    ['primitive', 44, false]
  ];

  for (const [name, error, expected] of cases) {
    it(`classifies ${name}`, () => {
      expect(isIgnorableDetachedVersionEventError(error)).toBe(expected);
    });
  }
});

describe('setupVersionSyncListeners connected lifecycle', () => {
  it('syncs only after a configured remote adapter becomes connected', () => {
    const harness = createHarness({ connected: false });

    expect(harness.result.subscriptions).toHaveLength(1);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(false);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(true);
    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to connected$ without a remote adapter', () => {
    const harness = createHarness({ connected: true, hasRemoteAdapter: false });

    expect(harness.result.subscriptions).toHaveLength(0);
    expect(harness.syncBranches).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.addEventListener).toHaveBeenCalledTimes(3);
  });

  it('swallows sync rejection and retries on the next connected emission', async () => {
    const syncError = new Error('sync failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness({
      connected: true,
      syncBranches: () => Promise.reject(syncError)
    });

    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);
    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(2);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('setupVersionSyncListeners 联网回推', () => {
  /** 断网：`report` 认定网络故障后 `online` 立刻翻 false，并排上退避节拍 */
  const goOffline = (reachability: ReachabilityMonitor): void => {
    reachability.report(new TypeError('Failed to fetch'));
    expect(reachability.online).toBe(false);
  };

  it('恢复可达时依次跑 syncBranches、push 与 QueryCache flush', async () => {
    const harness = createHarness({ connected: false });
    goOffline(harness.reachability);
    harness.connected$.next(true);
    await settleDetachedTasks();
    harness.syncBranches.mockClear();
    harness.push.mockClear();
    flushOutbox.mockClear();

    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
    expect(harness.push).toHaveBeenCalledTimes(1);
    expect(flushedEntities()).toEqual(['CachedRecipe']);
  });

  // 适配器 connect() 完成不代表网通了（HTTP 适配器的 connect 根本不发请求）。
  // 只认 connected 会让整条回推链在断网期间空转，每次都以网络错误收场。
  it('适配器已连接但网络判为不可达时不回推', async () => {
    const harness = createHarness({ connected: false });
    goOffline(harness.reachability);

    harness.connected$.next(true);
    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.push).not.toHaveBeenCalled();
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  // 反过来也一样：网是通的，但适配器还没连上，这时候回推没有可用的本地仓储
  it('网络可达但适配器未连接时不回推', async () => {
    const harness = createHarness({ connected: false });

    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.push).not.toHaveBeenCalled();
  });

  // 退避节拍是「现在可以再试一次」。没有它，断网期间就只剩下用户手动操作能触发重试
  it('离线期间的退避节拍驱动重试', async () => {
    const harness = createHarness({
      connected: true,
      reachability: detachedReachability({ baseDelayMs: 1, maxDelayMs: 1 })
    });
    await settleDetachedTasks();
    harness.syncBranches.mockClear();

    goOffline(harness.reachability);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(harness.syncBranches.mock.calls.length).toBeGreaterThan(0);
  });

  // 恢复瞬间常常连着来好几个信号（online 事件、退避节拍、用户手动重试）。
  // 每个都起一轮回推会让同一批变更被并发重放。
  it('上一轮没跑完时的触发被单飞挡掉', async () => {
    let release: (() => void) | undefined;
    const harness = createHarness({
      connected: false,
      syncBranches: () =>
        new Promise<void>(resolve => {
          release = resolve;
        })
    });

    harness.connected$.next(true);
    await settleDetachedTasks();
    expect(harness.syncBranches).toHaveBeenCalledTimes(1);

    // 第一轮卡在 syncBranches 上，这几次触发都该被丢掉
    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(1);

    release?.();
    await settleDetachedTasks();
  });

  it('只 flush QueryCache 仓库，changelog 仓库交给 push', async () => {
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(flushedEntities()).not.toContain('VersionedTodo');
    expect(flushedEntities()).not.toContain('LocalDraft');
  });

  it('没有 QueryCache 仓库时一次 flush 都不发', async () => {
    const harness = createHarness({ connected: true, entities: [VersionedTodo, LocalDraft] });

    await settleDetachedTasks();

    expect(harness.push).toHaveBeenCalledTimes(1);
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  it('没有远程适配器时既不 push 也不 flush', async () => {
    const harness = createHarness({ connected: true, hasRemoteAdapter: false });

    await settleDetachedTasks();

    expect(harness.push).not.toHaveBeenCalled();
    expect(flushOutbox).not.toHaveBeenCalled();
  });

  // 三步互不背书：分支元数据同步不上，不代表本地攒的写就该继续压着
  it('syncBranches 失败不阻塞 push 与 flush', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness({ connected: true, syncBranches: () => Promise.reject(new Error('branches down')) });

    await settleDetachedTasks();

    expect(harness.push).toHaveBeenCalledTimes(1);
    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('push 失败不阻塞 QueryCache flush', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = createHarness({ connected: true, push: () => Promise.reject(new Error('push down')) });

    await settleDetachedTasks();

    expect(harness.syncBranches).toHaveBeenCalledTimes(1);
    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('flush 抛错不掐断订阅，下一次恢复照常重试', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    flushOutbox.mockRejectedValue(new Error('flush down'));
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();
    expect(flushOutbox).toHaveBeenCalledTimes(1);

    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(flushOutbox).toHaveBeenCalledTimes(2);
    expect(harness.result.subscriptions.every(subscription => subscription.closed)).toBe(false);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('取消订阅后不再回推', async () => {
    const harness = createHarness({ connected: true });
    await settleDetachedTasks();
    harness.syncBranches.mockClear();
    flushOutbox.mockClear();

    for (const subscription of harness.result.subscriptions) {
      subscription.unsubscribe();
    }
    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(flushOutbox).not.toHaveBeenCalled();
  });
});

describe('setupVersionSyncListeners remote events', () => {
  for (const eventCase of REMOTE_EVENT_CASES) {
    it(`counts current and branchless entities for ${eventCase.eventName}`, async () => {
      const harness = createHarness();
      const event = eventCase.create([
        createRemoteEntity('INSERT', 'current', 'main'),
        createRemoteEntity('UPDATE', 'other', 'feature'),
        createRemoteEntity('DELETE', 'branchless')
      ]);

      harness.emit(event);
      await settleDetachedTasks();

      expect(harness.getCurrentBranch).toHaveBeenCalledTimes(1);
      expect(harness.incrementPullableCount).toHaveBeenCalledOnce();
      expect(harness.incrementPullableCount).toHaveBeenCalledWith(2);
    });
  }

  it('does not increment when every entity belongs to another branch', async () => {
    const harness = createHarness();

    harness.emit(
      new EntityRemoteUpdatedEvent([
        createRemoteEntity('UPDATE', 'feature-1', 'feature'),
        createRemoteEntity('UPDATE', 'feature-2', 'feature')
      ])
    );
    await settleDetachedTasks();

    expect(harness.getCurrentBranch).toHaveBeenCalledTimes(1);
    expect(harness.incrementPullableCount).not.toHaveBeenCalled();
  });

  const ignorableErrors: ReadonlyArray<readonly [string, unknown, RemoteEventCase]> = [
    ['errno 44', { errno: 44 }, REMOTE_EVENT_CASES[0]],
    ['AbortError', { name: 'AbortError' }, REMOTE_EVENT_CASES[1]],
    ['adapter shutdown', new Error('adapter is disconnected'), REMOTE_EVENT_CASES[2]]
  ];

  for (const [name, error, eventCase] of ignorableErrors) {
    it(`does not log ${name} from ${eventCase.eventName}`, async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness({ getCurrentBranch: () => Promise.reject(error) });

      harness.emit(eventCase.create([createRemoteEntity('INSERT', name)]));
      await settleDetachedTasks();

      expect(harness.incrementPullableCount).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });
  }

  for (const eventCase of REMOTE_EVENT_CASES) {
    it(`logs ordinary errors from ${eventCase.eventName}`, async () => {
      const error = new Error(`${eventCase.eventName} failed`);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const harness = createHarness({ getCurrentBranch: () => Promise.reject(error) });

      harness.emit(eventCase.create([createRemoteEntity('INSERT', eventCase.eventName)]));
      await settleDetachedTasks();

      expect(consoleError).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(`[VersionManager] ${eventCase.label} failed:`, error);
    });
  }
});

describe('setupVersionSyncListeners cleanup lifecycle', () => {
  it('removes the exact remote handlers and unsubscribes connected sync', async () => {
    const harness = createHarness({ connected: false });
    const registeredListeners = harness.addEventListener.mock.calls;

    expect(registeredListeners.map(([type]) => type)).toEqual([
      ENTITY_REMOTE_CREATE_EVENT,
      ENTITY_REMOTE_UPDATE_EVENT,
      ENTITY_REMOTE_REMOVE_EVENT
    ]);
    expect(harness.result.removers).toHaveLength(3);

    for (const remove of harness.result.removers) {
      remove();
    }
    for (const subscription of harness.result.subscriptions) {
      subscription.unsubscribe();
    }

    expect(harness.removeEventListener).toHaveBeenCalledTimes(3);
    for (const [type, handler] of registeredListeners) {
      expect(harness.removeEventListener).toHaveBeenCalledWith(type, handler);
      expect(harness.listeners.get(type)?.has(handler)).toBe(false);
    }
    expect(harness.result.subscriptions.every(subscription => subscription.closed)).toBe(true);

    harness.connected$.next(true);
    harness.emit(new EntityRemoteCreatedEvent([createRemoteEntity('INSERT', 'after-cleanup', 'main')]));
    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.incrementPullableCount).not.toHaveBeenCalled();
  });
});
