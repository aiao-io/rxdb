/**
 * 声明了 `SyncType.QueryCache` 却缺插件时的运行期护栏（US-025 阶段 B：B3 / 阶段 D：D3）。
 *
 * 阶段 B 把 QueryCache 读引擎搬进 `@aiao/rxdb-plugin-querycache`，`SyncType.QueryCache`
 * 这个枚举成员却必须留在核心 —— 策略轴闭合，`Repository` 构造里那处分支无从判定。
 * 于是核心多出一个指向「可能没装的插件」的取值，本文件盯的就是那个缺口。
 *
 * 阶段 D 之后缺口是**两个**：读引擎在 `@aiao/rxdb-plugin-querycache`，待提交写的查询
 * （出站队列）在 `@aiao/rxdb-plugin-sync`。所以一个 `SyncType.QueryCache` 实体要两个插件
 * 才跑得起来 —— 出站队列这一半尤其不能缺席也不能兜底成空集：读引擎对账
 * （`planReconcile`）拿它把「远端没返回」和「本地离线写过」分开，空集会让每一条离线写
 * 都被当成孤儿删掉。两个缺口各有各的护栏，下面两个 describe 分别盯一个。
 *
 * 判据有两条，缺一不可：
 *
 * 1. **在 `connect()` 阶段就拦下**，而不是等到第一次 `find()`。配置错误要在启动时响，
 *    否则它会以「这个实体查不到数据」的形态出现在生产日志里。
 * 2. **不静默降级为本地读**。降级之后调用方看到的是「远端确实没有数据」，与
 *    `RxDBQueryCacheCapabilityError` 拒绝降级是同一条理由：最难查的故障是那种
 *    看起来一切正常的。
 */
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type {
  QueryCacheEngineFactory,
  QueryCachePrimary,
  QueryCacheSession
} from '../../repository/query-cache-engine.interface.js';
import type { QueryCacheOutboxProvider } from '../../repository/query-cache-outbox.interface.js';
import { Repository } from '../../repository/Repository.js';
import { RxDB } from '../../RxDB.js';
import { RxDBMissingPluginError } from '../../RxDBError.js';
import { detachedReachability } from '../fixtures/reachability.js';
import { createMockAdapter, type MockLocalAdapter } from '../fixtures/test-db-setup.js';

@Entity({
  name: 'CachedProduct',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'supabase' }
  }
})
class CachedProduct extends EntityBase {
  title!: string;
}

/** 同一个库里的对照实体：它不该被这条护栏波及 */
@Entity({
  name: 'PlainProduct',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
})
class PlainProduct extends EntityBase {
  title!: string;
}

/**
 * 最小引擎工厂桩：只证明「槽位填上了护栏就放行」，不产生任何读行为。
 *
 * @remarks
 * 核心包不能 devDepend 插件包（Nx 项目图会出环），所以核心侧一律用桩验接缝，
 * 真引擎的行为断言在 `@aiao/rxdb-plugin-querycache` 里。
 */
const createEngineFactoryStub = (): QueryCacheEngineFactory => ({
  createSession: <T extends EntityType>(): QueryCacheSession<T> => ({
    createPrimary: () => ({}) as QueryCachePrimary<T>,
    clear: () => undefined
  })
});

/**
 * 最小出站队列桩：答「没有离线写占着」，同样不产生任何读行为。
 *
 * @remarks
 * 真队列在 `@aiao/rxdb-plugin-sync` 里读 `rxdb_change` / `rxdb_sync` 两张系统表，核心包
 * 同样不能 devDepend 它 —— 核心这一侧只证明槽位填上了护栏就放行。
 */
const createOutboxStub = (): QueryCacheOutboxProvider => ({
  pendingWriteIds: () => Promise.resolve(new Set<string>())
});

/**
 * 库级 sync 必须带 remote —— `SyncType.QueryCache` 的元数据校验只认库级注册的远端适配器，
 * 少这一侧会先撞 `missingQueryCacheAdapter`，本文件要盯的护栏一次都轮不到。
 */
const createDatabase = (dbName: string): { rxdb: RxDB; local: () => MockLocalAdapter | undefined } => {
  const rxdb = new RxDB({
    dbName,
    entities: [CachedProduct, PlainProduct],
    sync: { type: SyncType.Full, local: { adapter: 'sqlite' }, remote: { adapter: 'supabase' } }
  });
  // 取本地适配器要用函数而不是属性：实例是 `connect()` 里第一次 `getAdapter()` 才建的，
  // 在解构那一刻读到的只会是 undefined。
  let local: MockLocalAdapter | undefined;
  rxdb.adapter('sqlite', db => {
    local = createMockAdapter(db);
    return local;
  });
  rxdb.adapter('supabase', createMockAdapter);
  return { rxdb, local: () => local };
};

/**
 * 两个槽位可分别置空、两条适配器流都正常发射的 `RxDB` 替身。
 *
 * @param localAdapter - 本地适配器替身，用来盯「有没有偷偷退回本地读」
 * @param slots - 想填上的槽；不填的那个就是空的
 *
 * @remarks
 * 专门用来盯**兜底**那一道：`connect()` 的启动护栏只在启动那一刻扫一遍，而插件是带作用域
 * 注册的 —— 连上之后作用域一释放，槽位就又空了，此后新建的仓储只剩这一道。
 *
 * 走手搭替身而不是真库，是因为真库在 `connect()` 失败后不再发射适配器，读路径根本跑不起来，
 * 「订阅时抛」这件事在那条路上无从观察。
 */
const slotStubRxDB = (
  localAdapter: object,
  slots: { engine?: QueryCacheEngineFactory; outbox?: QueryCacheOutboxProvider } = {}
): RxDB =>
  ({
    localAdapter$: of(localAdapter),
    remoteAdapter$: of({ getRepository: () => ({}) }),
    config: { sync: undefined },
    addEventListener: () => undefined,
    reachability: detachedReachability(),
    entityManager: { createEntityRef: (_type: unknown, entity: unknown) => entity },
    getQueryCacheEngine: () => slots.engine,
    getQueryCacheOutbox: () => slots.outbox
  }) as unknown as RxDB;

describe('US-025 B3：没装 QueryCache 引擎时的启动护栏', () => {
  it('connect() 直接失败，错误点名实体与要装的包', async () => {
    const { rxdb } = createDatabase('querycache-missing-plugin-connect');

    await expect(rxdb.connect('sqlite')).rejects.toThrow(RxDBMissingPluginError);
    await expect(rxdb.connect('sqlite')).rejects.toThrow(/CachedProduct/);
    await expect(rxdb.connect('sqlite')).rejects.toThrow(/@aiao\/rxdb-plugin-querycache/);
  });

  it('不静默降级为本地读：护栏拦下之后本地读的 duck 一次都不亮', async () => {
    const { rxdb, local } = createDatabase('querycache-missing-plugin-no-downgrade');

    await expect(rxdb.connect('sqlite')).rejects.toThrow(RxDBMissingPluginError);

    const localAdapter = local();
    expect(localAdapter).toBeDefined();
    expect(localAdapter?.getMetadataByIds).not.toHaveBeenCalled();
    expect(localAdapter?.getRepository).not.toHaveBeenCalledWith(CachedProduct);
  });

  it('兜底在读路径上：槽位空时首次订阅即抛，不退回本地仓储', async () => {
    const localAdapter = { getRepository: vi.fn(() => ({})) };
    const repository = new Repository(slotStubRxDB(localAdapter), CachedProduct);

    await expect(firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } }))).rejects.toThrow(
      RxDBMissingPluginError
    );
    // 关键在 `not`：降级过的实现会在这里交出一个本地仓储，然后把「远端没有这行」当成查询结果
    expect(localAdapter.getRepository).not.toHaveBeenCalled();
  });

  it('两个槽都填上后放行：同一份配置连得上，且护栏不波及非 QueryCache 实体', async () => {
    const { rxdb } = createDatabase('querycache-missing-plugin-installed');
    rxdb.queryCacheEngine(createEngineFactoryStub());
    // 出站队列是 D3 之后的第二个槽；只填引擎连不上，见下面那个 describe
    rxdb.queryCacheOutbox(createOutboxStub());

    await expect(rxdb.connect('sqlite')).resolves.toBeDefined();
    expect(() => rxdb.entityManager.getRepository(PlainProduct)).not.toThrow();
  });

  it('库里没有 QueryCache 实体时护栏静默：两个插件都不装照样连得上', async () => {
    const rxdb = new RxDB({
      dbName: 'querycache-missing-plugin-irrelevant',
      entities: [PlainProduct],
      sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
    });
    rxdb.adapter('sqlite', createMockAdapter);

    await expect(rxdb.connect('sqlite')).resolves.toBeDefined();
  });
});

describe('US-025 D3：装了引擎却没装同步插件（查询出站队列）时的启动护栏', () => {
  it('connect() 直接失败，错误点名缺的是队列而不是引擎', async () => {
    const { rxdb } = createDatabase('querycache-missing-outbox-connect');
    rxdb.queryCacheEngine(createEngineFactoryStub());

    await expect(rxdb.connect('sqlite')).rejects.toThrow(RxDBMissingPluginError);
    await expect(rxdb.connect('sqlite')).rejects.toThrow(/CachedProduct/);
    await expect(rxdb.connect('sqlite')).rejects.toThrow(/@aiao\/rxdb-plugin-sync/);
    // 这一条是重点：引擎**已经装了**，还报「no engine is installed」会把人指向装好的那一半，
    // 于是照着错误提示做的每一步都不可能修好它。
    await expect(rxdb.connect('sqlite')).rejects.toThrow(/no outbox queue is installed/);
  });

  it('不静默兜底成空集：护栏拦下之后本地读的 duck 一次都不亮', async () => {
    const { rxdb, local } = createDatabase('querycache-missing-outbox-no-fallback');
    rxdb.queryCacheEngine(createEngineFactoryStub());

    await expect(rxdb.connect('sqlite')).rejects.toThrow(RxDBMissingPluginError);

    const localAdapter = local();
    expect(localAdapter).toBeDefined();
    expect(localAdapter?.getMetadataByIds).not.toHaveBeenCalled();
  });

  it('兜底在读路径上：队列槽空时首次订阅即抛，不退回本地仓储', async () => {
    const localAdapter = { getRepository: vi.fn(() => ({})) };
    const rxdb = slotStubRxDB(localAdapter, { engine: createEngineFactoryStub() });
    const repository = new Repository(rxdb, CachedProduct);

    await expect(firstValueFrom(repository.findAll({ where: { combinator: 'and', rules: [] } }))).rejects.toThrow(
      RxDBMissingPluginError
    );
    // 兜底成空集的实现会在这里若无其事地建出主仓储，然后把离线写过的行当成孤儿删掉
    expect(localAdapter.getRepository).not.toHaveBeenCalled();
  });
});
