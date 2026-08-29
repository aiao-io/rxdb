/**
 * US-023 阶段 A —— QueryCache 远端变更的失效上报口。
 *
 * 用例全部经**统一 `Repository` + 真实 `QueryManager`** 断言，不用 `StubQueryManager`：
 * 本故事要证的正是「清记忆」与「重跑活查询」发生在同一条路径上且顺序固定（D2），
 * 换成直通替身就把被测的那件事替换掉了。
 *
 * 覆盖 AC#1–#8、#10、#26–#30；AC#9 在 `gateway/RxDBTabsGateway.spec.ts`，
 * AC#31 在 `@aiao/rxdb-devtools` 的 `connector-events.spec.ts`。
 */
import { BehaviorSubject, delay, Observable, of, Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IEntity } from '../../entity/entity.interface.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../../entity/metadata-options.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { RelationKind } from '../../entity/relation-types.interface.js';
import type { QueryCachePrimaryLocalAdapter } from '../../repository/query-cache-primary.js';
import { createQueryCachePrimary } from '../../repository/query-cache-primary.js';
import {
  DEFAULT_QUERY_CACHE_SYNC_STALE_TIME,
  queryCacheFingerprint,
  QueryCacheSyncMemo
} from '../../repository/query-cache-sync-memo.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type {
  QueryCacheLocalAdapter,
  QueryCacheLocalReader,
  QueryCacheRemoteAdapter
} from '../../repository/QueryCacheRepository.js';
import { QueryCacheRepository } from '../../repository/QueryCacheRepository.js';
import { Repository } from '../../repository/Repository.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import { REMOTE_ENTITY_INVALIDATED_EVENT, RemoteEntityInvalidatedEvent } from '../../rxdb-events.js';
import { RxDB } from '../../RxDB.js';
import { METADATA, STATUS } from '../../rxdb.private.js';
import { SyncStateHub } from '../../sync-state.js';
import { detachedReachability } from '../fixtures/reachability.js';

class RecipeEntity {
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id!: string;
  updatedAt!: string;
  value?: number;
}

type RecipeEntityCtor = typeof RecipeEntity;

/** AC#27 直接驱动 {@link QueryCacheRepository} 时用到的最小视图 */
interface InflightCache {
  find(options: { where: RuleGroup<RecipeEntity> }): Observable<RecipeEntity[]>;
  invalidateInflight(): void;
}

/** 被 `RecipeEntity` 的 `where` 引用的关联实体（AC#7 的 B） */
class IngredientEntity extends RecipeEntity {}

/** 对照组：版本化路径，用来证明失效上报口不渗进它（AC#8 / D15） */
class VersionedEntity extends RecipeEntity {}

Object.assign(RecipeEntity, {
  [METADATA]: {
    name: 'RecipeEntity',
    namespace: 'public',
    repository: 'Repository',
    // AC#7 走 `exists` 分支取依赖：`entity_type_dependencies` 在那里读 `relationMap`
    relationMap: new Map([
      ['ingredients', { mappedEntity: 'IngredientEntity', mappedNamespace: 'public', kind: RelationKind.ONE_TO_MANY }]
    ]),
    propertyMap: new Map(),
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }
  }
});

Object.assign(IngredientEntity, {
  [METADATA]: {
    name: 'IngredientEntity',
    namespace: 'public',
    repository: 'Repository',
    relationMap: new Map(),
    propertyMap: new Map(),
    sync: {
      type: SyncType.QueryCache,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }
  }
});

Object.assign(VersionedEntity, {
  [METADATA]: {
    name: 'VersionedEntity',
    namespace: 'public',
    repository: 'Repository',
    relationMap: new Map(),
    propertyMap: new Map(),
    sync: {
      type: SyncType.Full,
      local: { adapter: 'local' },
      remote: { adapter: 'remote' }
    }
  }
});

const ENTITY_REGISTRY: Record<string, RecipeEntityCtor> = {
  'public:RecipeEntity': RecipeEntity,
  'public:IngredientEntity': IngredientEntity as unknown as RecipeEntityCtor,
  'public:VersionedEntity': VersionedEntity as unknown as RecipeEntityCtor
};

/** 指纹进 `STATUS`：AC#30 判「有没有重复发射」靠的就是它，全 `undefined` 会让用例恒绿 */
const row = (id: string, updatedAt: string, value = 0): RecipeEntity => {
  const entity = new RecipeEntity();
  entity.id = id;
  entity.updatedAt = updatedAt;
  entity.value = value;
  Object.assign(entity, { [STATUS]: { local: false, fingerprint: `${id}@${updatedAt}@${value}` } });
  return entity;
};

const allWhere = (): RuleGroup<RecipeEntity> => ({ combinator: 'and', rules: [] });

/** AC#7：`where` 里引用关联实体 B */
const relationWhere = (): RuleGroup<RecipeEntity> =>
  ({ combinator: 'and', rules: [{ field: 'ingredients', operator: 'exists' }] }) as unknown as RuleGroup<RecipeEntity>;

/** 有状态的两侧存储：AC#5 / AC#6 要看到本地投影真的跟着远端变 */
const createStores = () => ({
  local: new Map<string, RecipeEntity>(),
  remote: new Map<string, RecipeEntity>()
});

type Stores = ReturnType<typeof createStores>;

const createLocalRepo = (stores: Stores) => ({
  find: vi.fn<(options?: { where: RuleGroup<RecipeEntity> }) => Promise<RecipeEntity[]>>(async () =>
    Array.from(stores.local.values())
  ),
  count: vi.fn(async () => stores.local.size),
  create: vi.fn(async (entity: RecipeEntity) => entity),
  update: vi.fn(async (entity: RecipeEntity) => entity),
  remove: vi.fn(async (entity: RecipeEntity) => entity)
});

const createLocalAdapter = (stores: Stores, localRepo: ReturnType<typeof createLocalRepo>) => ({
  name: 'local',
  getRepository: vi.fn(() => localRepo),
  getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
  upsertMany: vi.fn((_entityName: string, rows: RecipeEntity[]) => {
    rows.forEach(entity => stores.local.set(entity.id, entity));
    return of(undefined);
  }),
  deleteByIds: vi.fn((_entityName: string, ids: string[]) => {
    ids.forEach(id => stores.local.delete(id));
    return of(undefined);
  })
});

const createRemoteAdapter = (stores: Stores, fetchDelayMs = 0) => ({
  name: 'remote',
  getRepository: vi.fn(),
  // 签名写全是为了让 `mock.calls[n][0]` 保留 `entityName` 的类型（AC#7 断言它）
  fetchMetadata: vi.fn<(entityName: string, where: RuleGroup<RecipeEntity>) => Observable<QueryCacheEntityMetadata[]>>(
    () =>
      of(Array.from(stores.remote.values()).map(entity => ({ id: entity.id, updatedAt: entity.updatedAt }))).pipe(
        delay(fetchDelayMs)
      )
  ),
  findByIds: vi.fn((_entityName: string, ids: string[]) =>
    of(ids.map(id => stores.remote.get(id)).filter((entity): entity is RecipeEntity => entity !== undefined))
  ),
  create: vi.fn((_entityName: string, data: RecipeEntity) => of(data)),
  update: vi.fn((_entityName: string, id: string) => of(stores.remote.get(id))),
  delete: vi.fn(() => of(undefined))
});

const setup = (
  overrides: {
    /** 初始两侧都有的行；默认一行且完全一致（AC#4 的前置） */
    seed?: RecipeEntity[];
    fetchDelayMs?: number;
  } = {}
) => {
  const stores = createStores();
  for (const entity of overrides.seed ?? [row('a', '2024-01-01T00:00:00Z', 1)]) {
    stores.local.set(entity.id, entity);
    stores.remote.set(entity.id, entity);
  }

  const localRepo = createLocalRepo(stores);
  const localAdapter = createLocalAdapter(stores, localRepo);
  const remoteAdapter = createRemoteAdapter(stores, overrides.fetchDelayMs);
  const localAdapter$ = new BehaviorSubject(localAdapter);
  const remoteAdapter$ = new BehaviorSubject(remoteAdapter);

  // 真实事件总线：注销必须真的注销（AC#29），派发必须真的打到监听器（AC#1）
  const listeners = new Map<string, Set<(event: RxDBEvent) => void>>();
  const addEventListener = vi.fn((type: string, listener: (event: RxDBEvent) => void) => {
    const set = listeners.get(type) ?? new Set<(event: RxDBEvent) => void>();
    set.add(listener);
    listeners.set(type, set);
  });
  const removeEventListener = vi.fn((type: string, listener: (event: RxDBEvent) => void) => {
    listeners.get(type)?.delete(listener);
  });
  const dispatchEvent = vi.fn((event: RxDBEvent) => {
    Array.from(listeners.get(event.type) ?? []).forEach(listener => listener(event));
  });

  const rxdb = {
    localAdapter$,
    remoteAdapter$,
    config: { sync: undefined },
    addEventListener,
    removeEventListener,
    dispatchEvent,
    reachability: detachedReachability(),
    schemaManager: {
      getEntityType: vi.fn((entity: string, namespace: string) => ENTITY_REGISTRY[`${namespace}:${entity}`]),
      getEntityMetadata: vi.fn(() => undefined)
    },
    entityManager: {
      getEntityRef: vi.fn(() => undefined),
      createEntityRef: vi.fn((_type: unknown, entity: RecipeEntity) => entity)
    }
  } as unknown as RxDB;

  const invalidate = (entity: string, namespace = 'public'): void => {
    rxdb.dispatchEvent(new RemoteEntityInvalidatedEvent(namespace, entity));
  };

  return {
    rxdb,
    stores,
    localRepo,
    localAdapter,
    remoteAdapter,
    listeners,
    addEventListener,
    removeEventListener,
    invalidate,
    repositoryOf: <E extends RecipeEntityCtor>(EntityType: E) => new Repository<E>(rxdb, EntityType)
  };
};

/** 放行两轮宏任务：合流窗口是微任务，同步链上还有 `delay(0)` 与若干 `await` */
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('US-023 阶段 A：QueryCache 远端失效上报口', () => {
  const subscriptions: Subscription[] = [];
  const repositories: { destroy(): void }[] = [];

  const track = <R extends { destroy(): void }>(repository: R): R => {
    repositories.push(repository);
    return repository;
  };

  afterEach(() => {
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe());
    repositories.splice(0).forEach(repository => repository.destroy());
  });

  describe('重跑与清记忆（AC#1 / AC#2 / AC#28）', () => {
    let ctx: ReturnType<typeof setup>;
    let repository: Repository<RecipeEntityCtor>;

    beforeEach(() => {
      ctx = setup();
      repository = track(ctx.repositoryOf(RecipeEntity));
    });

    // AC#1：N 个活查询各重跑一次，且每次都真的走 fetchMetadata
    it('AC#1 每个活查询各重跑一次并真的回远端', async () => {
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      subscriptions.push(repository.find({ where: allWhere(), limit: 5 }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;
      expect(baseline).toBeGreaterThanOrEqual(1);

      ctx.invalidate('RecipeEntity');
      await settle();

      // 两个任务 where 相同、指纹相同：清记忆后各自重跑，同步不再命中记忆
      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBeGreaterThan(baseline);
      expect(ctx.localRepo.find.mock.calls.length).toBeGreaterThan(0);
    });

    // AC#2：清记忆必须发生在重跑之前，否则重跑会命中窗口、读回同一份陈旧本地行
    it('AC#2 记忆窗口内的重跑仍然回远端', async () => {
      expect(DEFAULT_QUERY_CACHE_SYNC_STALE_TIME).toBeGreaterThan(0);
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;

      // 不等窗口到期，立刻上报
      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline + 1);
    });

    // AC#28 D14：同一合流窗口内连续 K 次上报，每个任务只重跑一次
    it('AC#28 同一窗口内的多次上报合流成一次重跑', async () => {
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;

      ctx.invalidate('RecipeEntity');
      ctx.invalidate('RecipeEntity');
      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline + 1);
    });
  });

  describe('幂等与早退（AC#3 / AC#8 / AC#29）', () => {
    // AC#3 前半：该实体上没有任何活查询
    it('AC#3 没有活查询时连续上报 100 次零请求', async () => {
      const ctx = setup();
      track(ctx.repositoryOf(RecipeEntity));

      for (let i = 0; i < 100; i++) {
        expect(() => ctx.invalidate('RecipeEntity')).not.toThrow();
      }
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata).not.toHaveBeenCalled();
      expect(ctx.remoteAdapter.findByIds).not.toHaveBeenCalled();
    });

    // AC#3 后半 + D9：未注册的实体名不抛、不做事
    it('AC#3 未注册的实体名连续上报 100 次零请求', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;

      for (let i = 0; i < 100; i++) {
        expect(() => ctx.invalidate('NotRegisteredEntity')).not.toThrow();
      }
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline);
    });

    // AC#8 / D15：非 QueryCache 实体上的上报是 no-op，且结构上根本没注册监听器
    it('AC#8 版本化实体不注册失效监听器，上报零重跑零请求', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(VersionedEntity as unknown as RecipeEntityCtor));
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      const localFindBaseline = ctx.localRepo.find.mock.calls.length;

      ctx.invalidate('VersionedEntity');
      await settle();

      expect(ctx.addEventListener.mock.calls.map(call => call[0])).not.toContain(REMOTE_ENTITY_INVALIDATED_EVENT);
      expect(ctx.remoteAdapter.fetchMetadata).not.toHaveBeenCalled();
      expect(ctx.localRepo.find.mock.calls.length).toBe(localFindBaseline);
    });

    // AC#29 / D2：destroy() 之后监听器已注销，上报零重跑零请求
    it('AC#29 destroy 之后上报零重跑，监听器已注销', async () => {
      const ctx = setup();
      const repository = ctx.repositoryOf(RecipeEntity);
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;

      repository.destroy();
      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.removeEventListener.mock.calls.map(call => call[0])).toContain(REMOTE_ENTITY_INVALIDATED_EVENT);
      expect(ctx.listeners.get(REMOTE_ENTITY_INVALIDATED_EVENT)?.size ?? 0).toBe(0);
      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline);
    });
  });

  describe('同步的实际动作（AC#4 / AC#5 / AC#6 / AC#30）', () => {
    // AC#4：远端与本地完全一致时，只发 fetchMetadata，零 findByIds
    it('AC#4 元数据一致时零 findByIds', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await settle();
      ctx.remoteAdapter.findByIds.mockClear();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;

      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline + 1);
      expect(ctx.remoteAdapter.findByIds).not.toHaveBeenCalled();
    });

    // AC#30：同上前置，锁定「不向订阅者重复发射」这一条出路
    it('AC#30 元数据一致时不向订阅者重复发射', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      const emissions: RecipeEntity[][] = [];
      subscriptions.push(repository.find({ where: allWhere() }).subscribe(rows => emissions.push(rows)));
      await settle();
      expect(emissions).toHaveLength(1);

      ctx.invalidate('RecipeEntity');
      await settle();

      expect(emissions).toHaveLength(1);
    });

    // AC#5：远端某行变新 → 被拉取、写入本地、活查询发射新值
    it('AC#5 远端行变新时拉取并向活查询发射新值', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      const emissions: RecipeEntity[][] = [];
      subscriptions.push(repository.find({ where: allWhere() }).subscribe(rows => emissions.push(rows)));
      await settle();

      ctx.stores.remote.set('a', row('a', '2024-01-09T00:00:00Z', 42));
      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.remoteAdapter.findByIds).toHaveBeenCalledWith('RecipeEntity', ['a']);
      expect(ctx.localAdapter.upsertMany).toHaveBeenCalled();
      expect(emissions).toHaveLength(2);
      expect(emissions[1][0].value).toBe(42);
    });

    // AC#6：远端删掉结果集里的一行 → 孤儿被驱逐、活查询发射不含该行的结果
    it('AC#6 远端删行时驱逐孤儿并发射不含该行的结果', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      const emissions: RecipeEntity[][] = [];
      subscriptions.push(repository.find({ where: allWhere() }).subscribe(rows => emissions.push(rows)));
      await settle();

      ctx.stores.remote.delete('a');
      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.localAdapter.deleteByIds).toHaveBeenCalledWith('RecipeEntity', ['a']);
      expect(emissions).toHaveLength(2);
      expect(emissions[1]).toEqual([]);
    });
  });

  describe('扩散到依赖方（AC#7 / D1）', () => {
    // AC#7：A 的 where 引用 B，上报 B → A 重跑且 A 自己的 fetchMetadata 真的发生
    it('AC#7 上报 B 时依赖它的 A 清自己的记忆并回远端', async () => {
      const ctx = setup();
      const repository = track(ctx.repositoryOf(RecipeEntity));
      subscriptions.push(repository.find({ where: relationWhere() }).subscribe());
      await settle();
      const baseline = ctx.remoteAdapter.fetchMetadata.mock.calls.length;
      expect(baseline).toBe(1);

      // 不等 A 的记忆窗口到期
      ctx.invalidate('IngredientEntity');
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(baseline + 1);
      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.at(-1)?.[0]).toBe('RecipeEntity');
    });
  });

  describe('公开入口的签名（AC#10 / D8）', () => {
    // AC#10：上报口的参数里没有任何东西能承载行数据
    it('AC#10 上报口只接实体名与命名空间，且派发的事件不带行数据', () => {
      const database = new RxDB({
        dbName: 'us-023-signature',
        entities: [],
        sync: { local: { adapter: 'local' }, type: SyncType.None }
      });
      const dispatched: RxDBEvent[] = [];
      const spy = vi.spyOn(database, 'dispatchEvent').mockImplementation(event => {
        dispatched.push(event);
      });

      database.invalidateRemoteEntity('RecipeEntity');
      database.invalidateRemoteEntity('RecipeEntity', 'public');

      // 参数只有两个字符串：多一个位置都会让「传行数据」在类型上成立
      expect(database.invalidateRemoteEntity.length).toBe(1);
      expect(dispatched).toHaveLength(2);
      const event = dispatched[0] as RemoteEntityInvalidatedEvent;
      expect(event.type).toBe(REMOTE_ENTITY_INVALIDATED_EVENT);
      expect(Object.keys({ ...event }).sort()).toEqual(['entity', 'namespace', 'type']);
      expect(event.entity).toBe('RecipeEntity');
      expect(event.namespace).toBe('public');
      spy.mockRestore();
    });
  });

  describe('记忆代次（AC#26 / D12）', () => {
    // 代次未变：照常记住
    it('AC#26 代次未变时 remember 生效', () => {
      const memo = new QueryCacheSyncMemo(1000);
      const generation = memo.generation;

      memo.remember('fp', generation);

      expect(memo.has('fp')).toBe(true);
    });

    // 代次变了：这次同步的结果按定义就不新鲜，不许进记忆
    it('AC#26 同步飞行中发生 clear 时 remember 不生效', () => {
      const memo = new QueryCacheSyncMemo(1000);
      const generation = memo.generation;

      memo.clear();
      memo.remember('fp', generation);

      expect(memo.has('fp')).toBe(false);
      expect(memo.generation).not.toBe(generation);
    });

    // 接线：`#sync` 必须在 await 之前取代次，否则飞行中被清掉的记忆会被它写回来。
    // 这一条经主仓储断言而不是经 `Repository`：`Repository` 上失效必然伴随重跑，
    // 而重跑那次同步**理应**进记忆，两者叠在一起会把陈旧写回遮成看不见。
    it('AC#26 同步飞行中被清掉的记忆不会被写回来', async () => {
      const stores = createStores();
      stores.local.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      stores.remote.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      const localRepo = createLocalRepo(stores);
      const localAdapter = createLocalAdapter(stores, localRepo);
      const remoteAdapter = createRemoteAdapter(stores, 5);
      const syncMemo = new QueryCacheSyncMemo(1000);
      const primary = createQueryCachePrimary<RecipeEntityCtor>(
        'RecipeEntity',
        RecipeEntity,
        localAdapter as unknown as QueryCachePrimaryLocalAdapter<RecipeEntityCtor>,
        remoteAdapter as unknown as QueryCacheRemoteAdapter,
        false,
        syncMemo,
        detachedReachability(),
        new SyncStateHub({ online$: of(true), pushableCount$: of(0) })
      );

      void primary.find({ where: allWhere() });
      await Promise.resolve();
      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);

      // 失效上报做的正是这一步：同步、在同步回来之前
      syncMemo.clear();
      await new Promise(resolve => setTimeout(resolve, 20));

      // 记忆窗口（1000ms）内再读一次：那次陈旧同步若写回了指纹，这里就是零请求
      expect(syncMemo.has(queryCacheFingerprint({ where: allWhere() }))).toBe(false);
      void primary.find({ where: allWhere() });
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
    });
  });

  describe('作废在飞查询（AC#27 / D13）', () => {
    // 作废 ≠ 取消：原订阅者照常拿到结果，下一次 find 不再复用它
    it('AC#27 invalidateInflight 后同指纹的 find 发起新的 fetchMetadata', async () => {
      const stores = createStores();
      stores.local.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      stores.remote.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      const localRepo = createLocalRepo(stores);
      const localAdapter = createLocalAdapter(stores, localRepo);
      const remoteAdapter = createRemoteAdapter(stores, 5);
      // `RecipeEntity.updatedAt` 是 string，撑不起 `EntityBaseType`（那里要 `Date`），
      // 因此按默认泛型构造再窄回本用例真正用到的两个成员。
      const cache = new QueryCacheRepository(
        'RecipeEntity',
        remoteAdapter as unknown as QueryCacheRemoteAdapter,
        localAdapter as unknown as QueryCacheLocalAdapter,
        {
          find: (options: { where: RuleGroup<RecipeEntity> }) => localRepo.find(options)
        } as unknown as QueryCacheLocalReader<IEntity>
      ) as unknown as InflightCache;

      const first: RecipeEntity[][] = [];
      subscriptions.push(cache.find({ where: allWhere() }).subscribe(rows => first.push(rows)));
      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);

      cache.invalidateInflight();
      const second: RecipeEntity[][] = [];
      subscriptions.push(cache.find({ where: allWhere() }).subscribe(rows => second.push(rows)));

      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
      await new Promise(resolve => setTimeout(resolve, 20));
      // 原订阅者照常收到它们那次的结果
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
    });

    // 去重表按指纹存，但删除必须按**身份**：失效清表后新流用同一指纹重新入表，
    // 旧流退订时若照指纹删，删掉的是刚入表的那条 —— 并发去重被静默打穿
    it('AC#27 旧流退订不得把同指纹的新流从去重表里删掉', async () => {
      const stores = createStores();
      stores.local.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      stores.remote.set('a', row('a', '2024-01-01T00:00:00Z', 1));
      const localRepo = createLocalRepo(stores);
      const localAdapter = createLocalAdapter(stores, localRepo);
      const remoteAdapter = createRemoteAdapter(stores, 5);
      const cache = new QueryCacheRepository(
        'RecipeEntity',
        remoteAdapter as unknown as QueryCacheRemoteAdapter,
        localAdapter as unknown as QueryCacheLocalAdapter,
        {
          find: (options: { where: RuleGroup<RecipeEntity> }) => localRepo.find(options)
        } as unknown as QueryCacheLocalReader<IEntity>
      ) as unknown as InflightCache;

      const stale = cache.find({ where: allWhere() }).subscribe();
      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);

      cache.invalidateInflight();
      subscriptions.push(cache.find({ where: allWhere() }).subscribe());
      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);

      // 作废不是取消：旧流照旧跑完并在最后一个订阅者退订时收口
      stale.unsubscribe();
      subscriptions.push(cache.find({ where: allWhere() }).subscribe());

      // 第三次 find 该复用还在飞的第二条流，而不是再发一次远端请求
      expect(remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(2);
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // 作废之后那条还在飞的拉取，问的是失效前的远端状态：结果照常交给它自己的订阅者，
    // 但不能再落本地 —— 落下去就把重跑刚写进来的新行盖回旧值，且本地库会一直错到
    // 记忆窗口到期为止（重跑那次的 `remember` 是成功的，窗口内没人会再校验一次）
    it('AC#27 作废之后的陈旧拉取不再落本地，不覆盖重跑写入的新行', async () => {
      const stores = createStores();
      const localRepo = createLocalRepo(stores);
      const localAdapter = createLocalAdapter(stores, localRepo);

      let remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'a', updatedAt: '2024-01-01T00:00:00Z' }];
      // 每次 findByIds 都挂起，由用例决定谁先回来：竞态的方向必须是可控的，不能靠 delay 赌
      const pulls: ((rows: RecipeEntity[]) => void)[] = [];
      const remoteAdapter = {
        name: 'remote',
        getRepository: vi.fn(),
        fetchMetadata: vi.fn(() => of(remoteMetadata)),
        findByIds: vi.fn(
          () =>
            new Observable<RecipeEntity[]>(subscriber => {
              pulls.push(rows => {
                subscriber.next(rows);
                subscriber.complete();
              });
            })
        )
      };
      const cache = new QueryCacheRepository(
        'RecipeEntity',
        remoteAdapter as unknown as QueryCacheRemoteAdapter,
        localAdapter as unknown as QueryCacheLocalAdapter,
        {
          find: (options: { where: RuleGroup<RecipeEntity> }) => localRepo.find(options)
        } as unknown as QueryCacheLocalReader<IEntity>
      ) as unknown as InflightCache;

      // 第一次同步：本地空 → 缺 'a' → 拉取停在飞行中
      subscriptions.push(cache.find({ where: allWhere() }).subscribe());
      await settle();
      expect(pulls).toHaveLength(1);

      // 失效上报：作废在飞查询；远端此刻已经是新版本，重跑问到的是它
      cache.invalidateInflight();
      remoteMetadata = [{ id: 'a', updatedAt: '2024-01-09T00:00:00Z' }];
      subscriptions.push(cache.find({ where: allWhere() }).subscribe());
      await settle();
      expect(pulls).toHaveLength(2);

      // 重跑先落地新行，陈旧拉取随后才回来
      pulls[1]([row('a', '2024-01-09T00:00:00Z', 42)]);
      await settle();
      pulls[0]([row('a', '2024-01-01T00:00:00Z', 1)]);
      await settle();

      expect(stores.local.get('a')?.value).toBe(42);
      expect(localAdapter.upsertMany).toHaveBeenCalledTimes(1);
    });

    // 经统一 Repository 的同款证据：失效瞬间重跑不复用在飞结果
    it('AC#27 在飞窗口内上报失效，重跑发起新的 fetchMetadata', async () => {
      const ctx = setup({ fetchDelayMs: 5 });
      const repository = track(ctx.repositoryOf(RecipeEntity));
      subscriptions.push(repository.find({ where: allWhere() }).subscribe());
      await Promise.resolve();
      expect(ctx.remoteAdapter.fetchMetadata).toHaveBeenCalledTimes(1);

      ctx.invalidate('RecipeEntity');
      await settle();

      expect(ctx.remoteAdapter.fetchMetadata.mock.calls.length).toBe(2);
    });
  });
});
