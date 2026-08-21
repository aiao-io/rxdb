/**
 * 安装时序回归。
 *
 * 本文件原来守的是插件**自己**等依赖那一套：先 `rxdb.connect(localAdapterName)`，
 * 再 `firstValueFrom(adapterConnected$(localAdapterName))`，靠「等的是按适配器的信号
 * 而不是聚合的 `connected$`」避免把 FTS DDL 打在还没建出来的主表上。
 *
 * US-015 之后这段等待整体交给了宿主：插件声明 `inject: ['adapter:local']`，
 * `install()` 被调用即代表引导链跑完。时序保证因此从「插件等对了信号」变成
 * 「宿主装晚了才装」，宿主侧的证据在
 * [RxDB.plugin-inject.spec.ts](../../../rxdb/src/__tests__/RxDB.plugin-inject.spec.ts) AC#2。
 *
 * 留在这一层的是两条**结构性**保证，它们不依赖任何时序约定：
 *  1. 插件不再触碰 `connect()` / `adapterConnected$`——死锁的两条边少了一条；
 *  2. FTS DDL 只走 `bootstrapTransaction`，不碰会自等 `connect()` 的 `adapter.rawQuery` / repo。
 */
import { Entity, EntityBase, PropertyType, type RxDB } from '@aiao/rxdb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FtsInstallPlan } from '../core/fts5-installer.js';
import type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from '../core/fts5-runtime.js';
import type { SearchResult } from '../types.js';

/**
 * 签名得显式写出来：下面第二条用例的 `mockImplementationOnce(async (_plan, executor, store) => …)`
 * 全靠它推形参类型。挂在 `vi.fn<T>()` 上而不是给默认实现写三个形参——那三个名字一个都用不到。
 */
type InstallFtsForEntity = (
  plan: FtsInstallPlan,
  executor: RuntimeSqlExecutor,
  store: MigrationRecordStore
) => Promise<InstallFtsResult>;

const { installFtsForEntity, engineSearch } = vi.hoisted(() => ({
  installFtsForEntity: vi.fn<InstallFtsForEntity>(async () => ({
    tableName: 'article',
    status: 'installed' as const,
    fields: [{ name: 'title', isArray: false }]
  })),
  engineSearch: vi.fn(async () => [
    {
      entity: 'Article',
      collection: 'article',
      id: 'article-1',
      rank: -1,
      matchedField: 'title',
      snippet: 'alpha result'
    }
  ])
}));

vi.mock('../core/fts5-runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../core/fts5-runtime.js')>('../core/fts5-runtime.js');
  return {
    ...actual,
    installFtsForEntity
  };
});

vi.mock('../core/search-engine.js', async () => {
  const actual = await vi.importActual<typeof import('../core/search-engine.js')>('../core/search-engine.js');
  return {
    ...actual,
    createSearchEngine: vi.fn(() => ({ search: engineSearch }))
  };
});

import { RxDBPluginSearch, rxDBPluginSearch } from '../plugin.js';
import { disposeScopes, installScoped } from './scoped-install.js';

@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'title', type: PropertyType.string, searchable: true }
  ]
})
class FakeArticle extends EntityBase {}

describe('search plugin install ordering', () => {
  afterEach(async () => {
    await disposeScopes();
    vi.clearAllMocks();
  });

  it('声明 inject 之后不自己等依赖：不调 connect()、不订阅 adapterConnected$', async () => {
    let landInstall!: () => void;
    const installGate = new Promise<void>(resolve => {
      landInstall = resolve;
    });
    installFtsForEntity.mockImplementationOnce(async () => {
      await installGate;
      return { tableName: 'article', status: 'installed' as const, fields: [{ name: 'title', isArray: false }] };
    });

    const rawQuery = vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] }));
    const migrationRepository = {
      find: vi.fn(async () => []),
      create: vi.fn(async (entity: unknown) => entity)
    };
    const adapter = {
      rawQuery,
      getRepository: vi.fn(() => migrationRepository),
      bootstrapTransaction: vi.fn(
        async (
          fn: (tx: { query: typeof rawQuery; getRepository: () => typeof migrationRepository }) => Promise<unknown>
        ) => fn({ query: rawQuery, getRepository: () => migrationRepository })
      )
    };
    const connect = vi.fn(async () => adapter);
    const adapterConnected$ = vi.fn();
    const fakeRxdb = {
      config: {
        // 同时配上 remote：宿主的 `inject` 解析只认 local 那一个键，配了 remote 不影响判定
        sync: { local: { adapter: 'sqlite-wasm' }, remote: { adapter: 'supabase' } },
        entities: [FakeArticle]
      },
      localAdapterSync: adapter,
      connect,
      adapterConnected$,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as RxDB;

    const plugin = rxDBPluginSearch(fakeRxdb, { debounce: 0 }) as RxDBPluginSearch;
    installScoped(plugin);

    // 在 ready 之前建的 handle：FTS 落库后必须被唤醒重查，否则首屏永久空
    const handle = fakeRxdb.search('alpha');
    const emissions: string[][] = [];
    const sub = handle.results$.subscribe((results: readonly Readonly<SearchResult>[]) => {
      emissions.push(results.map(result => result.id));
    });

    // 安装已经在跑（卡在 FTS 那一步），此刻插件一次都没回头找宿主要连接
    await vi.waitFor(() => expect(installFtsForEntity).toHaveBeenCalledTimes(1));
    expect(connect).not.toHaveBeenCalled();
    expect(adapterConnected$).not.toHaveBeenCalled();
    expect(emissions.at(-1) ?? []).toEqual([]);

    landInstall();
    await plugin.ready;

    expect(adapter.bootstrapTransaction).toHaveBeenCalledTimes(1);
    // 死锁的两条边：宿主等插件安装是一条，插件回头等宿主连接是另一条。后者被结构性地删掉了
    expect(connect).not.toHaveBeenCalled();
    expect(adapterConnected$).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(engineSearch).toHaveBeenCalled();
      expect(emissions.at(-1)).toEqual(['article-1']);
    });

    sub.unsubscribe();
    handle.destroy();
  });

  it('FTS DDL 走 bootstrapTransaction，不碰会自等 connect() 的 adapter.rawQuery / repo', async () => {
    installFtsForEntity.mockImplementationOnce(async (_plan, executor, store) => {
      await executor.rawQuery('SELECT 1');
      await store.listInstallMigrationsForTable('article');
      return {
        tableName: 'article',
        status: 'installed' as const,
        fields: [{ name: 'title', isArray: false }]
      };
    });

    // 插件外的常规入口在 connect() 结算之前一律挂起：`RxDB.connect()` 此刻还卡在
    // `#await_plugin_installs`，任何 `ready()` → 等 connect() 的调用都是等自己
    const hangForever = () => new Promise<never>(() => undefined);
    const rawQuery = vi.fn(hangForever);
    const migrationRepository = { find: vi.fn(hangForever), create: vi.fn(hangForever) };
    const installQuery = vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] }));
    const installRepository = {
      find: vi.fn(async () => []),
      create: vi.fn(async (entity: unknown) => entity)
    };
    const adapter = {
      rawQuery,
      getRepository: vi.fn(() => migrationRepository),
      bootstrapTransaction: vi.fn(
        async (
          fn: (tx: { query: typeof installQuery; getRepository: () => typeof installRepository }) => Promise<unknown>
        ) => fn({ query: installQuery, getRepository: () => installRepository })
      )
    };
    const fakeRxdb = {
      config: { sync: { local: { adapter: 'sqlite-wasm' } }, entities: [FakeArticle] },
      localAdapterSync: adapter,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as RxDB;

    const plugin = rxDBPluginSearch(fakeRxdb, { debounce: 0 }) as RxDBPluginSearch;
    installScoped(plugin);

    const hung = await Promise.race([
      plugin.ready.then(() => 'ready' as const),
      new Promise<'hung'>(resolve => {
        setTimeout(() => resolve('hung'), 50);
      })
    ]);

    expect(hung).toBe('ready');
    expect(adapter.bootstrapTransaction).toHaveBeenCalledTimes(1);
    expect(installQuery).toHaveBeenCalled();
    expect(rawQuery).not.toHaveBeenCalled();
    expect(migrationRepository.find).not.toHaveBeenCalled();
  });
});
