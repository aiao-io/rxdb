import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, type SyncOptions, SyncType } from '../../entity/metadata-options.interface.js';
import type { ReachabilityMonitor } from '../../network/reachability.js';
import {
  countQueryCacheOutbox,
  flushQueryCacheOutbox,
  type QueryCacheOutboxResult
} from '../../repository/query-cache-outbox.js';
import {
  ENTITY_REMOTE_CREATE_EVENT,
  ENTITY_REMOTE_REMOVE_EVENT,
  ENTITY_REMOTE_UPDATE_EVENT,
  EntityRemoteCreatedEvent,
  EntityRemoteRemovedEvent,
  EntityRemoteUpdatedEvent,
  type RxDBEntityRemoteCreatedEventData
} from '../../rxdb-events.js';
import { SyncStateHub } from '../../sync-state.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import { RxDBMigration } from '../../system/migration.js';
import { RxDBSync } from '../../system/sync.js';
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
    conflicts: [],
    failures: []
  };
}

vi.mock('../../repository/query-cache-outbox.js', () => ({
  flushQueryCacheOutbox: vi.fn((_vm: unknown, namespace: string, entity: string) =>
    Promise.resolve(makeOutboxResult(namespace, entity))
  ),
  countQueryCacheOutbox: vi.fn(() => Promise.resolve(0))
}));

const flushOutbox = vi.mocked(flushQueryCacheOutbox);
const countOutbox = vi.mocked(countQueryCacheOutbox);

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

/** 第二个 QueryCache 仓库：证明一轮里各仓库互不背书 */
@Entity({
  name: 'CachedNote',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
})
class CachedNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

/** Full 仓库：由用户显式调 `versionManager.push()` 负责，自动轮次一概不碰 */
@Entity({
  name: 'VersionedTodo',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
})
class VersionedTodo extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

/**
 * Local 仓库：没有远端，两条路都不该碰它
 *
 * @remarks
 * 「只有本地」不是独立的 `SyncType`，而是 `SyncType.None` 配上 `local`、不配 `remote` ——
 * {@link getSyncType} 由这个组合判出 `'local'`。
 */
@Entity({
  name: 'LocalDraft',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
})
class LocalDraft extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
}

/**
 * 不写 `sync` 的业务实体：完全跟随库级配置
 *
 * @remarks
 * 与系统表的**唯一**区别就是它不在系统表清单里。修复若误伤这一支，
 * 「实体不写 sync、跟随全局」这条语义就没了。
 */
@Entity({
  name: 'InheritedTodo',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class InheritedTodo extends EntityBase {
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
  reachability?: ReachabilityMonitor;
  /** 库级 `sync`；不传时只配一个远端适配器名，实体各自带着自己的 `sync` */
  sync?: SyncOptions;
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
  syncState: SyncStateHub;
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
 * 回推链是「逐个仓库 flush → 重算积压」的串行 await，微任务数量随仓库个数变化，
 * 数着 `Promise.resolve()` 迟早会数漏。让出一个宏任务把整条链跑到底，计数断言才可信。
 */
const settleDetachedTasks = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/**
 * 本轮用例建过的 harness，`afterEach` 统一拆掉。
 *
 * @remarks
 * 每个 harness 都带一个真的 {@link ReachabilityMonitor}。离线期间它按退避不停发
 * `wakeup$`，而订阅链只要还活着就会继续回推 —— 用例结束并不会让这两样自己停下。
 * 退避被压到 1ms 的那个用例因此能在后续每个用例里持续打同一个 `flushOutbox`
 * 模块级 mock，把计数断言污染成随执行顺序漂移的假失败。
 */
const liveHarnesses: SyncListenerHarness[] = [];

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
  // 两个 changelog 探针不接受覆写：自动轮次一步都不该碰它们，用例只断言「没被调过」
  const syncBranches = vi.fn<SyncBranches>(() => Promise.resolve());
  const getCurrentBranch = vi.fn<GetCurrentBranch>(options.getCurrentBranch ?? (() => Promise.resolve({ id: 'main' })));
  const incrementPullableCount = vi.fn<IncrementPullableCount>();
  const push = vi.fn<Push>(() => Promise.resolve({ pushed: 0 }));
  const reachability = options.reachability ?? detachedReachability();
  const entities = options.entities ?? [CachedRecipe, VersionedTodo, LocalDraft];
  // 用真的 hub 而不是探针：这一层的契约是「面板最终显示什么」，
  // 断言方法调用只能证明有人喊了一声，证明不了喊出来的是不是对的状态。
  const syncState = new SyncStateHub({
    online$: reachability.online$,
    pushableCount$: new BehaviorSubject(0)
  });
  const rxdb = {
    config:
      options.hasRemoteAdapter === false ?
        { entities }
      : {
          entities,
          sync: options.sync ?? { remote: { adapter: 'remote' } }
        },
    connected$: connected$.asObservable(),
    reachability,
    syncState,
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

  const harness: SyncListenerHarness = {
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
    syncBranches,
    syncState
  };

  liveHarnesses.push(harness);
  return harness;
};

afterEach(() => {
  // 先断掉订阅与退避计时器，再清 mock：反过来的话，拆除前漏出的调用会留在计数里
  for (const harness of liveHarnesses.splice(0)) {
    for (const subscription of harness.result.subscriptions) {
      subscription.unsubscribe();
    }
    for (const remove of harness.result.removers) {
      remove();
    }
    harness.reachability.destroy();
    harness.syncState.destroy();
  }

  vi.restoreAllMocks();
  flushOutbox.mockClear();
  flushOutbox.mockImplementation((_vm, namespace, entity) => Promise.resolve(makeOutboxResult(namespace, entity)));
  countOutbox.mockClear();
  countOutbox.mockImplementation(() => Promise.resolve(0));
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
    expect(flushOutbox).not.toHaveBeenCalled();

    harness.connected$.next(false);
    expect(flushOutbox).not.toHaveBeenCalled();

    harness.connected$.next(true);
    expect(flushOutbox).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe to connected$ without a remote adapter', () => {
    const harness = createHarness({ connected: true, hasRemoteAdapter: false });

    expect(harness.result.subscriptions).toHaveLength(0);
    expect(flushOutbox).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);

    expect(flushOutbox).not.toHaveBeenCalled();
    expect(harness.addEventListener).toHaveBeenCalledTimes(3);
  });

  it('swallows sync rejection and retries on the next connected emission', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    flushOutbox.mockRejectedValue(new Error('sync failed'));
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(flushOutbox).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();

    harness.connected$.next(false);
    harness.connected$.next(true);
    await settleDetachedTasks();

    expect(flushOutbox).toHaveBeenCalledTimes(2);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe('setupVersionSyncListeners 联网回推', () => {
  /** 断网：`report` 认定网络故障后 `online` 立刻翻 false，并排上退避节拍 */
  const goOffline = (reachability: ReachabilityMonitor): void => {
    reachability.report(new TypeError('Failed to fetch'));
    expect(reachability.online).toBe(false);
  };

  it('恢复可达时重放 QueryCache 出站队列', async () => {
    const harness = createHarness({ connected: false });
    goOffline(harness.reachability);
    harness.connected$.next(true);
    await settleDetachedTasks();
    flushOutbox.mockClear();

    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe']);
  });

  // `push` 是用户的决定，和 git 的 push 一样。自动替他按下去，界面上的 Push 按钮与
  // `pushableCount` 就成了摆设，「写在本地、还没推」这个状态从此不存在 ——
  // `dev-rxdb-supabase` 的 e2e「未 push 的本地写不该出现在另一端」正是守这条。
  it('changelog 那半边一步都不自动跑', async () => {
    const harness = createHarness({ connected: false });
    goOffline(harness.reachability);
    harness.connected$.next(true);
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(harness.syncBranches).not.toHaveBeenCalled();
    expect(harness.push).not.toHaveBeenCalled();
  });

  // 适配器 connect() 完成不代表网通了（HTTP 适配器的 connect 根本不发请求）。
  // 只认 connected 会让整条回推链在断网期间空转，每次都以网络错误收场。
  it('适配器已连接但网络判为不可达时不回推', async () => {
    const harness = createHarness({ connected: false });
    goOffline(harness.reachability);

    harness.connected$.next(true);
    await settleDetachedTasks();

    expect(flushOutbox).not.toHaveBeenCalled();
  });

  // 反过来也一样：网是通的，但适配器还没连上，这时候回推没有可用的本地仓储
  it('网络可达但适配器未连接时不回推', async () => {
    createHarness({ connected: false });

    await settleDetachedTasks();

    expect(flushOutbox).not.toHaveBeenCalled();
  });

  // 退避节拍是「现在可以再试一次」。没有它，断网期间就只剩下用户手动操作能触发重试
  it('离线期间的退避节拍驱动重试', async () => {
    const harness = createHarness({
      connected: true,
      reachability: detachedReachability({ baseDelayMs: 1, maxDelayMs: 1 })
    });
    await settleDetachedTasks();
    flushOutbox.mockClear();

    goOffline(harness.reachability);
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(flushOutbox.mock.calls.length).toBeGreaterThan(0);
  });

  // 恢复瞬间常常连着来好几个信号（online 事件、退避节拍、用户手动重试）。
  // 每个都起一轮回推会让同一批变更被并发重放。
  it('上一轮没跑完时的触发被单飞挡掉', async () => {
    let release: (() => void) | undefined;
    flushOutbox.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve(makeOutboxResult('public', 'CachedRecipe'));
        })
    );
    const harness = createHarness({ connected: false });

    harness.connected$.next(true);
    await settleDetachedTasks();
    expect(flushOutbox).toHaveBeenCalledTimes(1);

    // 第一轮卡在 flush 上，这几次触发都该被丢掉
    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(flushOutbox).toHaveBeenCalledTimes(1);

    release?.();
    await settleDetachedTasks();
  });

  it('只 flush QueryCache 仓库，changelog 仓库一概不碰', async () => {
    createHarness({ connected: true });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(flushedEntities()).not.toContain('VersionedTodo');
    expect(flushedEntities()).not.toContain('LocalDraft');
  });

  // 一个 QueryCache 仓库都没有（`dev-rxdb-supabase` 这种纯 Full 的库就是）时整轮不进：
  // 既省掉必然为空的一次 COUNT，也不让面板为一轮什么都不做的回推闪一下 syncing
  it('没有 QueryCache 仓库时整轮不进', async () => {
    const harness = createHarness({ connected: true, entities: [VersionedTodo, LocalDraft] });

    await settleDetachedTasks();

    expect(flushOutbox).not.toHaveBeenCalled();
    expect(countOutbox).not.toHaveBeenCalled();
    expect(harness.syncState.snapshot).toMatchObject({ syncing: false, pendingCount: 0, lastError: null });
  });

  // 全 QueryCache 的库（HTTP demo 就是）压根没有 changelog 端点：`syncBranches` 与
  // `push` 一进门就撞 `getRemoteRepositories()`，HTTP 适配器对此直接抛。自动轮次不碰
  // 它们，这一轮才可能全绿 —— 否则面板会常亮一句「不支持 getRepository」，
  // 而真正推成功了的 REST 重放反倒没人替它宣布。
  it('纯 QueryCache 的库整轮全绿', async () => {
    const harness = createHarness({ connected: true, entities: [CachedRecipe, LocalDraft] });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(harness.syncState.snapshot.lastError).toBeNull();
  });

  // 上一条用例给的 `entities` 是手写清单，而真实的库里 `SchemaManager.init()` 还会补进
  // 四张系统表。它们不带自己的 `sync`，于是跟随库级配置，`getSyncType` 会照着库级口径
  // 把这四张本地簿记表也判成用户仓库。系统表的同步由 VersionManager 直接安排，
  // 混进 REST 重放名单等于对着没有 REST 端点的簿记表反复重放。
  it('注入的系统实体不进 flush 名单', async () => {
    createHarness({
      connected: true,
      entities: [CachedRecipe, RxDBBranch, RxDBChange, RxDBMigration, RxDBSync],
      sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
    });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe']);
  });

  // 反面：真有业务实体靠继承库级 sync 拿到 querycache 时，它照样要被重放。
  // 摘系统表不该把「实体不写 sync、跟随全局」这条语义一起废掉。
  it('继承库级 sync 的业务实体仍然走 REST 重放', async () => {
    createHarness({
      connected: true,
      entities: [InheritedTodo, RxDBBranch, RxDBChange, RxDBMigration, RxDBSync],
      sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
    });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['InheritedTodo']);
  });

  it('没有远程适配器时不 flush', async () => {
    createHarness({ connected: true, hasRemoteAdapter: false });

    await settleDetachedTasks();

    expect(flushOutbox).not.toHaveBeenCalled();
  });

  // 各仓库互不背书：一个仓库的出站队列重放不上，不代表另一个仓库那条 REST 路也走不通
  it('一个仓库 flush 失败不阻塞其它仓库', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    flushOutbox.mockImplementation((_vm, namespace, entity) =>
      entity === 'CachedRecipe' ?
        Promise.reject(new Error('recipe flush down'))
      : Promise.resolve(makeOutboxResult(namespace, entity))
    );
    const harness = createHarness({ connected: true, entities: [CachedRecipe, CachedNote, VersionedTodo] });

    await settleDetachedTasks();

    expect(flushedEntities()).toEqual(['CachedRecipe', 'CachedNote']);
    expect(harness.syncState.snapshot.lastError).toMatchObject({ message: 'recipe flush down' });
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

  // `resumeSync` 里被 `runQuietly` 兜住的只有逐仓库 flush 那一步。枚举仓库（读实体元数据、
  // 判同步类型）与面板的 `beginRound` 都在兜底之外，它们抛错会顺着 `exhaustMap` 冒到订阅上，
  // 把整条触发流当场终结 —— 此后 online 事件、退避节拍、重新连接一律无效，自动回推永久停摆。
  // 而「离线恢复」本来就是最容易出错的场景，一次意外把它永久关掉代价太大。
  it('未兜住的那步抛错时触发流仍存活，下一次恢复照常回推', async () => {
    const boom = new Error('回推入口炸了');
    vi.spyOn(SyncStateHub.prototype, 'beginRound').mockImplementationOnce(() => {
      throw boom;
    });
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();
    expect(flushOutbox).not.toHaveBeenCalled();
    // 吞掉不等于藏起来：这一轮的失败必须出现在面板上
    expect(harness.syncState.snapshot.lastError).toBe(boom);

    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    // 关键断言：触发流被终结时这里一条都推不出去
    expect(flushedEntities()).toEqual(['CachedRecipe']);
    expect(harness.result.subscriptions.every(subscription => subscription.closed)).toBe(false);
  });

  it('取消订阅后不再回推', async () => {
    const harness = createHarness({ connected: true });
    await settleDetachedTasks();
    flushOutbox.mockClear();

    for (const subscription of harness.result.subscriptions) {
      subscription.unsubscribe();
    }
    harness.reachability.report(new TypeError('Failed to fetch'));
    harness.reachability.report(null);
    await settleDetachedTasks();

    expect(flushOutbox).not.toHaveBeenCalled();
  });
});

describe('setupVersionSyncListeners 同步状态上报', () => {
  it('一轮回推期间 syncing 为真，跑完落回假', async () => {
    let release: (() => void) | undefined;
    flushOutbox.mockImplementation(
      (_vm, namespace, entity) =>
        new Promise(resolve => {
          release = () => resolve(makeOutboxResult(namespace, entity));
        })
    );
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();
    expect(harness.syncState.snapshot.syncing).toBe(true);

    release?.();
    await settleDetachedTasks();
    expect(harness.syncState.snapshot.syncing).toBe(false);
  });

  it('某一步失败时记下 lastError', async () => {
    const failure = new Error('flush down');
    flushOutbox.mockRejectedValue(failure);
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.lastError).toBe(failure);
  });

  // 一轮全绿意味着积压真的推上去了，上一次的红字不该继续挂着
  it('一轮全程无失败时清掉上一次的错误', async () => {
    const harness = createHarness({ connected: true });
    harness.syncState.reportError(new Error('上一轮的旧账'));

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.lastError).toBeNull();
  });

  // 失败的那一轮不能顺手清账：清了就等于宣称本轮成功
  it('本轮有失败时不清掉错误', async () => {
    flushOutbox.mockRejectedValue(new Error('flush down'));
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.lastError).toMatchObject({ message: 'flush down' });
  });

  it('flush 判负的实体转成 lastConflict', async () => {
    flushOutbox.mockImplementation((_vm, namespace, entity) =>
      Promise.resolve({ ...makeOutboxResult(namespace, entity), conflicts: ['r-1', 'r-2'] })
    );
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.lastConflict).toMatchObject({
      namespace: 'public',
      entity: 'CachedRecipe',
      entityId: 'r-2',
      winner: 'remote'
    });
  });

  it('一轮结束后按出站计数刷新 pendingCount', async () => {
    countOutbox.mockResolvedValue(3);
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.pendingCount).toBe(3);
  });

  // 计数是读操作，读不到只该让面板停在上一个数字，不该被当成同步失败
  it('出站计数读失败不算作同步失败', async () => {
    countOutbox.mockRejectedValue(new Error('count down'));
    const harness = createHarness({ connected: true });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot.lastError).toBeNull();
    expect(harness.syncState.snapshot.syncing).toBe(false);
  });

  it('没有远程适配器时不动同步状态', async () => {
    const harness = createHarness({ connected: true, hasRemoteAdapter: false });

    await settleDetachedTasks();

    expect(harness.syncState.snapshot).toMatchObject({ syncing: false, pendingCount: 0, lastError: null });
    expect(countOutbox).not.toHaveBeenCalled();
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

    expect(flushOutbox).not.toHaveBeenCalled();
    expect(harness.getCurrentBranch).not.toHaveBeenCalled();
    expect(harness.incrementPullableCount).not.toHaveBeenCalled();
  });
});
