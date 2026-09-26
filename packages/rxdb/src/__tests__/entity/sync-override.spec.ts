/**
 * US-026 —— 实例级实体同步覆盖（核心侧）。
 *
 * 断言尽量经生产入口（`RxDB` 构造 / `init()` / `connect()` / `EntityManager` 批量写 / 仓储），
 * 不只测解析器纯函数：本故事要防的正是「解析器是对的，某个消费者还在回读 `metadata.sync`」。
 */
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType, type SyncOptions } from '../../entity/metadata-options.interface.js';
import { RxDBMixedPrimaryAdapterError } from '../../entity/primary-adapter.js';
import {
  assertNoSystemEntityOverride,
  RxDBSyncOverrideError,
  type EntitySyncOverride
} from '../../entity/sync-override.js';
import { Repository } from '../../repository/Repository.js';
import type { IRxDBAdapter, RepositoryConstructor } from '../../rxdb-adapter.js';
import { getEntityMetadata, uuid } from '../../rxdb-utils.js';
import type { RxDBOptions } from '../../rxdb.interface.js';
import { RxDB } from '../../RxDB.js';
import { RxDBError, RxDBMissingPluginError } from '../../RxDBError.js';
import {
  createEntitySyncResolver,
  isEntitySyncResolver,
  toEntitySyncResolver
} from '../../sync-contract/entity-sync-resolver.js';
import { getSyncConfig, getSyncType } from '../../sync-contract/sync-type-utils.js';
import { RxDBChange } from '../../system/change.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

const QUERY_CACHE_SYNC: SyncOptions = {
  type: SyncType.QueryCache,
  local: { adapter: 'sqlite' },
  remote: { adapter: 'http' }
};
const LOCAL_ONLY: SyncOptions = { type: SyncType.None, local: { adapter: 'sqlite' } };

/** 前端声明：QueryCache，local + remote 都写死 */
@Entity({
  name: 'Recipe',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: QUERY_CACHE_SYNC
})
class Recipe extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

/** 对照实体：不写 sync，继承数据库默认配置 */
@Entity({
  name: 'Plain',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class Plain extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

/** 声明为 remote-only 的实体：批量写的主端判定要按覆盖后的配置走 */
@Entity({
  name: 'RemoteNote',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, remote: { adapter: 'http' } }
})
class RemoteNote extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

/** 两个 namespace 下同名的实体：按类引用区分，名字相同不是同一个目标 */
@Entity({ name: 'Item', namespace: 'alpha', properties: [{ name: 'title', type: PropertyType.string }] })
class AlphaItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({ name: 'Item', namespace: 'beta', properties: [{ name: 'title', type: PropertyType.string }] })
class BetaItem extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

const RESTRICTED_REPOSITORY = 'SyncOverrideRestrictedRepository';

/** 声明撑不住 QueryCache 的仓储上的实体：原声明是纯本地 */
@Entity({
  name: 'Menu',
  repository: RESTRICTED_REPOSITORY,
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: LOCAL_ONLY
})
class Menu extends EntityBase {}

/** 同一个受限仓储上、原声明就是 QueryCache 的实体 */
@Entity({
  name: 'CachedMenu',
  repository: RESTRICTED_REPOSITORY,
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: QUERY_CACHE_SYNC
})
class CachedMenu extends EntityBase {}

type Row = { id: string };

/** 记录批量写去向的最小适配器替身 */
const createRecordingAdapter = (name: string) => {
  const adapter = {
    name,
    mutations: vi.fn(async () => []),
    find: vi.fn(async (): Promise<Row[]> => []),
    create: vi.fn(async (entity: Row) => entity),
    update: vi.fn(async (entity: Row) => entity),
    remove: vi.fn(async (entity: Row) => entity),
    disconnect: vi.fn(async () => undefined),
    getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
    upsertMany: vi.fn(() => of(undefined)),
    deleteByIds: vi.fn(() => of(undefined)),
    getRepository: (): unknown => adapter
  };
  return adapter;
};

const registerRestrictedRepository = (rxdb: RxDB): void => {
  rxdb.repository(RESTRICTED_REPOSITORY, {
    class: Repository as RepositoryConstructor,
    unsupportedSyncTypes: { [SyncType.QueryCache]: '递归查询只能跑在完整的本地表上' }
  });
};

/** 标脏：只有 modified 的实体才会进批量集合 */
const dirty = <T extends { title: string }>(entity: T): T => {
  entity.title = 'dirty';
  return entity;
};

const { trackRxDB } = registerRxDBTeardown();

/** 服务端形态：数据库只有本地 sqlite，Recipe 被覆盖成纯本地 */
const serverOptions = (dbName: string, overrides: RxDBOptions['syncOverrides']): RxDBOptions => ({
  dbName,
  entities: [Recipe, Plain],
  sync: LOCAL_ONLY,
  syncOverrides: overrides
});

const catchError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected to throw');
};

describe('US-026 实例级实体同步覆盖', () => {
  describe('AC#1 QueryCache 实体被覆盖成纯本地', () => {
    it('init() 不再要求原声明里的 remote 适配器', () => {
      const rxdb = trackRxDB(new RxDB(serverOptions('override-local-init', [{ entity: Recipe, sync: LOCAL_ONLY }])));
      rxdb.adapter('sqlite', createMockAdapter);

      expect(() => rxdb.init()).not.toThrow();
    });

    it('对照：不覆盖时同一组配置在 init() 就被原声明的 QueryCache 拦下', () => {
      const rxdb = trackRxDB(new RxDB(serverOptions('override-local-control', undefined)));
      rxdb.adapter('sqlite', createMockAdapter);

      expect(() => rxdb.init()).toThrow(/QueryCache/);
    });

    it('connect() 不要求 QueryCache 插件，仓储走本地且不认识 remote', async () => {
      const rxdb = trackRxDB(new RxDB(serverOptions('override-local-connect', [{ entity: Recipe, sync: LOCAL_ONLY }])));
      rxdb.adapter('sqlite', createMockAdapter);

      await expect(rxdb.connect('sqlite')).resolves.toBeDefined();
      const repository = rxdb.entityManager.getRepository(Recipe);
      expect(repository.sync).toEqual(LOCAL_ONLY);
      expect(rxdb.entitySync.resolveType(Recipe)).toBe('local');
    });

    it('批量写落到本地适配器', async () => {
      const local = createRecordingAdapter('sqlite');
      const rxdb = trackRxDB(new RxDB(serverOptions('override-local-batch', [{ entity: Recipe, sync: LOCAL_ONLY }])));
      rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
      rxdb.init();

      await rxdb.entityManager.saveMany([
        dirty(rxdb.entityManager.createEntityRef(Recipe, { title: 'r', id: uuid() }))
      ]);

      expect(local.mutations).toHaveBeenCalledTimes(1);
      expect(local.upsertMany).not.toHaveBeenCalled();
    });
  });

  describe('AC#2 无覆盖时行为不变', () => {
    const databaseSync: SyncOptions = {
      type: SyncType.None,
      local: { adapter: 'sqlite' },
      remote: { adapter: 'http' }
    };

    it.each([
      ['省略', undefined],
      ['空列表', []]
    ])('%s：解析结果与既有 getSyncConfig / getSyncType 逐字相同', (_label, overrides) => {
      const rxdb = trackRxDB(
        new RxDB({
          dbName: `override-none-${String(overrides)}`,
          entities: [Recipe, Plain],
          sync: databaseSync,
          syncOverrides: overrides
        })
      );

      for (const EntityClass of [Recipe, Plain] as EntityType[]) {
        const metadata = getEntityMetadata(EntityClass);
        expect(rxdb.entitySync.resolve(EntityClass)).toBe(getSyncConfig(metadata, databaseSync));
        expect(rxdb.entitySync.resolveType(EntityClass)).toBe(getSyncType(metadata, databaseSync));
      }
    });

    it('继承数据库默认 None + local + remote 仍判为 full；声明为该组合则按字面判 none', () => {
      const resolver = createEntitySyncResolver(databaseSync);

      expect(resolver.resolveType(Plain)).toBe('full');
      expect(resolver.resolveType(Recipe)).toBe('querycache');
      expect(createEntitySyncResolver(undefined).resolveType(Plain)).toBe('none');
    });

    it('覆盖与装饰器一样是显式声明：None + local + remote 不借用继承特例', () => {
      const resolver = createEntitySyncResolver(databaseSync, new Map([[getEntityMetadata(Plain), databaseSync]]));

      expect(resolver.resolveType(Plain)).toBe('none');
    });

    it('旧签名传数据库级 sync 照常工作；解析器原样透传', () => {
      const resolver = createEntitySyncResolver(databaseSync);

      expect(toEntitySyncResolver(resolver)).toBe(resolver);
      expect(isEntitySyncResolver(databaseSync)).toBe(false);
      expect(isEntitySyncResolver(undefined)).toBe(false);
      expect(toEntitySyncResolver(databaseSync).resolve(Plain)).toBe(databaseSync);
    });
  });

  describe('AC#3 整体替换，不深合并', () => {
    it('低优先级的 remote、adapter 名与类型都不残留', () => {
      const rxdb = trackRxDB(new RxDB(serverOptions('override-replace', [{ entity: Recipe, sync: LOCAL_ONLY }])));

      const effective = rxdb.entitySync.resolve(Recipe);
      expect(effective).toEqual(LOCAL_ONLY);
      expect(effective).not.toHaveProperty('remote');
      expect(rxdb.entitySync.resolve(getEntityMetadata(Recipe))).toBe(effective);
    });
  });

  describe('AC#4 实例隔离', () => {
    it('同一实体类在两个实例里各走各的策略，原始元数据不变', async () => {
      const declared = getEntityMetadata(Recipe).sync;
      const server = trackRxDB(
        new RxDB(serverOptions('override-isolation-server', [{ entity: Recipe, sync: LOCAL_ONLY }]))
      );
      const browser = trackRxDB(
        new RxDB({
          dbName: 'override-isolation-browser',
          entities: [Recipe, Plain],
          sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }
        })
      );

      expect(server.entitySync.resolveType(Recipe)).toBe('local');
      expect(browser.entitySync.resolveType(Recipe)).toBe('querycache');

      await server.destroy();

      expect(browser.entitySync.resolveType(Recipe)).toBe('querycache');
      expect(getEntityMetadata(Recipe).sync).toBe(declared);
      expect(getEntityMetadata(Recipe).sync).toEqual(QUERY_CACHE_SYNC);
    });
  });

  describe('AC#5 配置在构造时快照', () => {
    it('调用方随后改原始条目与嵌套选项，运行中的策略不变', () => {
      const local = { adapter: 'sqlite' };
      const sync = { type: SyncType.None, local } as SyncOptions;
      const entry = { entity: Recipe as EntityType, sync };
      const overrides = [entry];
      const rxdb = trackRxDB(new RxDB(serverOptions('override-snapshot', overrides)));

      local.adapter = 'hijacked';
      (sync as { type: SyncType }).type = SyncType.Full;
      entry.entity = Plain;
      overrides.push({ entity: Plain, sync: QUERY_CACHE_SYNC });

      expect(rxdb.entitySync.resolve(Recipe)).toEqual(LOCAL_ONLY);
      expect(rxdb.entitySync.resolveType(Plain)).toBe('local');
    });

    it('冻的是实例副本，不冻调用方对象与实体类', () => {
      const sync: SyncOptions = { type: SyncType.None, local: { adapter: 'sqlite' } };
      const overrides: EntitySyncOverride[] = [{ entity: Recipe, sync }];
      const rxdb = trackRxDB(new RxDB(serverOptions('override-freeze', overrides)));
      const snapshot = rxdb.config.syncOverrides;

      expect(snapshot).not.toBe(overrides);
      expect(Object.isFrozen(snapshot)).toBe(true);
      expect(Object.isFrozen(snapshot?.[0])).toBe(true);
      expect(Object.isFrozen(snapshot?.[0].sync)).toBe(true);
      expect(Object.isFrozen(snapshot?.[0].sync.local)).toBe(true);
      expect(snapshot?.[0].entity).toBe(Recipe);
      expect(Object.isFrozen(overrides)).toBe(false);
      expect(Object.isFrozen(sync)).toBe(false);
      expect(Object.isFrozen(Recipe)).toBe(false);
    });

    it('Filter 的 filter 函数保留原引用，不被冻结', () => {
      const filter = Object.assign(() => ({ combinator: 'and', rules: [] }), { calls: 0 });
      const sync = {
        type: SyncType.Filter,
        local: { adapter: 'sqlite' },
        remote: { adapter: 'http', filter }
      } as unknown as SyncOptions;
      const rxdb = trackRxDB(new RxDB(serverOptions('override-filter-fn', [{ entity: Recipe, sync }])));

      const effective = rxdb.entitySync.resolve(Recipe) as { remote: { filter: unknown } };
      expect(effective.remote.filter).toBe(filter);
      expect(Object.isFrozen(filter)).toBe(false);
    });

    it('init() 冻结配置后覆盖快照不被深冻结波及调用方实体类', () => {
      const rxdb = trackRxDB(new RxDB(serverOptions('override-init-freeze', [{ entity: Recipe, sync: LOCAL_ONLY }])));
      rxdb.adapter('sqlite', createMockAdapter);
      rxdb.init();

      expect(Object.isFrozen(Recipe)).toBe(false);
      expect(() => new Recipe()).not.toThrow();
    });
  });

  describe('AC#6 按类引用命中', () => {
    it('不同 namespace 的同名实体分别覆盖，未覆盖实体照旧继承', () => {
      const rxdb = trackRxDB(
        new RxDB({
          dbName: 'override-namespace',
          entities: [AlphaItem, BetaItem, Plain],
          sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } },
          syncOverrides: [
            { entity: AlphaItem, sync: LOCAL_ONLY },
            { entity: BetaItem, sync: QUERY_CACHE_SYNC }
          ]
        })
      );

      expect(rxdb.entitySync.resolveType(AlphaItem)).toBe('local');
      expect(rxdb.entitySync.resolveType(BetaItem)).toBe('querycache');
      expect(rxdb.entitySync.resolveType(Plain)).toBe('full');
    });
  });

  describe('AC#7 非法配置在构造期失败', () => {
    const construct = (overrides: unknown) => () =>
      new RxDB(serverOptions('override-invalid', overrides as RxDBOptions['syncOverrides']));

    it.each([
      ['未注册目标', [{ entity: AlphaItem, sync: LOCAL_ONLY }], 'unregistered', 0, 'alpha.Item'],
      ['系统实体', [{ entity: RxDBChange, sync: LOCAL_ONLY }], 'system-entity', 0, undefined],
      [
        '重复条目',
        [
          { entity: Recipe, sync: LOCAL_ONLY },
          { entity: Recipe, sync: QUERY_CACHE_SYNC }
        ],
        'duplicate',
        1,
        'public.Recipe'
      ],
      ['sync 为 null', [{ entity: Recipe, sync: null }], 'invalid-sync', 0, 'public.Recipe'],
      [
        'sync 缺 type',
        [{ entity: Recipe, sync: { local: { adapter: 'sqlite' } } }],
        'invalid-sync',
        0,
        'public.Recipe'
      ],
      ['type 写错', [{ entity: Recipe, sync: { type: 'bogus' } }], 'invalid-sync', 0, 'public.Recipe'],
      [
        'local 形状不对',
        [{ entity: Recipe, sync: { type: SyncType.None, local: 'sqlite' } }],
        'invalid-sync',
        0,
        'public.Recipe'
      ],
      [
        'remote 形状不对',
        [{ entity: Recipe, sync: { type: SyncType.None, remote: {} } }],
        'invalid-sync',
        0,
        'public.Recipe'
      ],
      ['条目不是对象', [null], 'invalid-entry', 0, undefined],
      ['entity 不是实体类', [{ entity: class NotAnEntity {}, sync: LOCAL_ONLY }], 'invalid-entry', 0, undefined],
      ['容器不是数组', null, 'invalid-entry', 0, undefined]
    ])('%s → %s', (_label, overrides, reason, index, entity) => {
      const error = catchError(construct(overrides));

      expect(error).toBeInstanceOf(RxDBSyncOverrideError);
      expect(error).toBeInstanceOf(RxDBError);
      expect(error).toMatchObject({ name: 'RxDBSyncOverrideError', reason, index });
      if (entity) expect((error as RxDBSyncOverrideError).entity).toBe(entity);
      expect((error as Error).message).toContain(`[${reason}]`);
    });

    it('子类不继承基类的覆盖资格：未注册的子类被拒', () => {
      class RecipeDraft extends Recipe {}

      expect(() => construct([{ entity: RecipeDraft, sync: LOCAL_ONLY }])()).toThrow(/\[unregistered\]/);
    });

    it('插件在 use() 时贡献的系统实体由 init() 复核拒绝', () => {
      const overrides: readonly EntitySyncOverride[] = [
        { entity: Plain, sync: LOCAL_ONLY },
        { entity: Recipe, sync: LOCAL_ONLY }
      ];

      expect(() => assertNoSystemEntityOverride(overrides, [RxDBChange])).not.toThrow();
      const error = catchError(() => assertNoSystemEntityOverride(overrides, [Recipe]));
      expect(error).toMatchObject({ reason: 'system-entity', index: 1, entity: 'public.Recipe' });
    });
  });

  describe('AC#8 覆盖成 QueryCache 时既有 fail-fast 按生效配置触发', () => {
    it('数据库没有 remote：init() 抛 missingQueryCacheAdapter，不沿用原声明放行', () => {
      const rxdb = trackRxDB(
        new RxDB({
          dbName: 'override-qc-no-remote',
          entities: [Plain],
          sync: LOCAL_ONLY,
          syncOverrides: [{ entity: Plain, sync: QUERY_CACHE_SYNC }]
        })
      );
      rxdb.adapter('sqlite', createMockAdapter);

      expect(() => rxdb.init()).toThrow(/QueryCache/);
    });

    it('缺 QueryCache 插件：connect() 抛 RxDBMissingPluginError 并点名被覆盖的实体', async () => {
      const rxdb = trackRxDB(
        new RxDB({
          dbName: 'override-qc-no-plugin',
          entities: [Plain],
          sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } },
          syncOverrides: [{ entity: Plain, sync: QUERY_CACHE_SYNC }]
        })
      );
      rxdb.adapter('sqlite', createMockAdapter);
      rxdb.adapter('http', createMockAdapter);

      await expect(rxdb.connect('sqlite')).rejects.toThrow(RxDBMissingPluginError);
      await expect(rxdb.connect('sqlite')).rejects.toThrow(/Plain/);
    });
  });

  describe('AC#9 批量写与主端判定用同一份生效配置', () => {
    const createDatabase = (dbName: string, overrides: RxDBOptions['syncOverrides']) => {
      const local = createRecordingAdapter('sqlite');
      const remote = createRecordingAdapter('http');
      const rxdb = trackRxDB(
        new RxDB({
          dbName,
          entities: [Plain, RemoteNote],
          sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } },
          syncOverrides: overrides
        })
      );
      rxdb.adapter('sqlite', () => local as unknown as IRxDBAdapter);
      rxdb.adapter('http', () => remote as unknown as IRxDBAdapter);
      rxdb.init();
      return { rxdb, local, remote };
    };

    it('remote-only 声明被覆盖成本地后，与本地实体同批写入同一个事务', async () => {
      const { rxdb, local, remote } = createDatabase('override-batch-local', [
        { entity: RemoteNote, sync: LOCAL_ONLY }
      ]);
      const note = dirty(rxdb.entityManager.createEntityRef(RemoteNote, { title: 'n', id: uuid() }));
      const plain = dirty(rxdb.entityManager.createEntityRef(Plain, { title: 'p', id: uuid() }));

      await rxdb.entityManager.saveMany([note, plain]);

      expect(local.mutations).toHaveBeenCalledTimes(1);
      expect(remote.mutations).not.toHaveBeenCalled();
      expect(rxdb.entityManager.getRepository(RemoteNote).sync).toEqual(LOCAL_ONLY);
    });

    it('对照：不覆盖时同一批仍按既有契约拒绝混主端', async () => {
      const { rxdb } = createDatabase('override-batch-control', undefined);
      const note = dirty(rxdb.entityManager.createEntityRef(RemoteNote, { title: 'n', id: uuid() }));
      const plain = dirty(rxdb.entityManager.createEntityRef(Plain, { title: 'p', id: uuid() }));

      await expect(rxdb.entityManager.saveMany([note, plain])).rejects.toThrow(RxDBMixedPrimaryAdapterError);
    });

    it('本地实体被覆盖成 remote-only 后，与 remote-only 实体同批落到 remote', async () => {
      const { rxdb, local, remote } = createDatabase('override-batch-remote', [
        { entity: Plain, sync: { type: SyncType.None, remote: { adapter: 'http' } } }
      ]);
      const note = dirty(rxdb.entityManager.createEntityRef(RemoteNote, { title: 'n', id: uuid() }));
      const plain = dirty(rxdb.entityManager.createEntityRef(Plain, { title: 'p', id: uuid() }));

      await rxdb.entityManager.saveMany([note, plain]);

      expect(remote.mutations).toHaveBeenCalledTimes(1);
      expect(local.mutations).not.toHaveBeenCalled();
    });
  });

  describe('AC#11 不支持组合按生效策略拒绝', () => {
    const createDatabase = (dbName: string, entities: EntityType[], overrides: RxDBOptions['syncOverrides']) => {
      const rxdb = trackRxDB(
        new RxDB({
          dbName,
          entities,
          sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } },
          syncOverrides: overrides
        })
      );
      rxdb.adapter('sqlite', createMockAdapter);
      rxdb.adapter('http', createMockAdapter);
      registerRestrictedRepository(rxdb);
      return rxdb;
    };

    it('原声明合法、覆盖成 QueryCache：init() 拒绝', () => {
      const rxdb = createDatabase('override-restricted-qc', [Menu], [{ entity: Menu, sync: QUERY_CACHE_SYNC }]);

      expect(() => rxdb.init()).toThrow(/QueryCache/);
    });

    it('原声明非法、覆盖成纯本地：init() 放行', () => {
      const rxdb = createDatabase(
        'override-restricted-local',
        [CachedMenu],
        [{ entity: CachedMenu, sync: LOCAL_ONLY }]
      );

      expect(() => rxdb.init()).not.toThrow();
    });

    it('对照：原声明非法且不覆盖：init() 拒绝', () => {
      const rxdb = createDatabase('override-restricted-control', [CachedMenu], undefined);

      expect(() => rxdb.init()).toThrow(/QueryCache/);
    });
  });
});
