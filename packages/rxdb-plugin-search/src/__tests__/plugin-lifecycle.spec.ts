/**
 * 插件生命周期回归测试。
 *
 * 覆盖:
 *  - `install()` 同步阶段对 schema 做 fail-fast（接入 `assertSearchableSchemaValid`）
 *  - `install()` 同步阶段就挂载 entity 事件通道（在 `await ready` 之前 handle 也能收到事件）
 *  - 作用域释放即拆卸：US-015 之后插件声明 `lifecycle: 'scoped'`，`destroy()` 已删除，
 *    状态复位挂在作用域的 `'search:state'` 条目上，`ready` 随之 reject
 */
import {
  Entity,
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  EntityBase,
  PropertyType,
  type EntityLocalCreatedEvent,
  type EntityLocalRemovedEvent,
  type EntityLocalUpdatedEvent,
  type EntityPropertyMetadataOptions,
  type RxDB
} from '@aiao/rxdb';
import { LifecycleScope } from '@aiao/utils';
import { firstValueFrom, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { installFtsForEntity, createSearchEngine } = vi.hoisted(() => ({
  installFtsForEntity: vi.fn(async () => ({
    tableName: 'article',
    status: 'installed' as const,
    fields: [{ name: 'title', isArray: false }]
  })),
  createSearchEngine: vi.fn(() => ({ search: vi.fn(async () => []) }))
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
    createSearchEngine
  };
});

import { MAX_QUERY_LENGTH } from '../core/query-compiler.js';
import { rxDBPluginSearch, type RxDBPluginSearch } from '../plugin.js';
import { SearchError, SearchExecutionError, SearchQueryLimitError, type SearchState } from '../types.js';
import { disposeScopes, installScoped } from './scoped-install.js';

const invalidSearchableIntegerProperty = {
  name: 'views',
  type: PropertyType.integer,
  searchable: true
} as unknown as EntityPropertyMetadataOptions;

@Entity({
  name: 'Article',
  tableName: 'article',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'title', type: PropertyType.string, searchable: true }
  ]
})
class FakeArticle extends EntityBase {}

@Entity({
  name: 'Note',
  tableName: 'note',
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'body', type: PropertyType.string, searchable: true }
  ]
})
class FakeNote extends EntityBase {}

@Entity({
  name: 'InvalidArticle',
  tableName: 'invalid_article',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }, invalidSearchableIntegerProperty]
})
class InvalidArticle extends EntityBase {}

type EntityChangeEvent = EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent;

/**
 * 探测一个 promise 当前是否已结算。
 *
 * @remarks
 * `pending` 是 `ready` 的一个**正常**状态（依赖未就绪 / 安装中），断言它需要一个
 * 「等一小会儿仍没动静」的证据，而不是 `rejects` / `resolves` 那种终局断言。
 */
const settlementOf = (promise: Promise<unknown>): Promise<'pending' | 'rejected' | 'resolved'> =>
  Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const
    ),
    new Promise<'pending'>(resolve => {
      setTimeout(() => resolve('pending'), 20);
    })
  ]);

const buildFakeRxdb = (entities: unknown[] = [FakeArticle], exposesRawQuery = true) => {
  const rawQuery = vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] }));
  const migrationRepository = {
    find: vi.fn(async () => []),
    create: vi.fn(async (entity: unknown) => entity)
  };
  const listeners = new Map<string, ((event: EntityChangeEvent) => void)[]>();
  const activeAdapter =
    exposesRawQuery ?
      {
        rawQuery,
        getRepository: vi.fn(() => migrationRepository),
        bootstrapTransaction: async (
          fn: (tx: { query: typeof rawQuery; getRepository: () => typeof migrationRepository }) => Promise<unknown>
        ) => fn({ query: rawQuery, getRepository: () => migrationRepository })
      }
    : {};
  const rxdb = {
    config: {
      sync: { local: { adapter: 'sqlite-wasm' } },
      entities
    },
    // 插件按 `inject: ['adapter:local']` 拿实例：宿主保证调用 `install()` 时它已就绪。
    // 连接信号（`connect` / `adapterConnected$` / `localAdapter$`）插件已经不再读，
    // 假宿主也就不提供——真读了会立刻 TypeError，而不是静默走回老路。
    localAdapterSync: activeAdapter,
    addEventListener: vi.fn((type: string, listener: (event: EntityChangeEvent) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    }),
    removeEventListener: vi.fn((type: string, listener: (event: EntityChangeEvent) => void) => {
      const list = listeners.get(type);
      if (!list) return;
      listeners.set(
        type,
        list.filter(l => l !== listener)
      );
    })
  };
  return {
    rawQuery,
    adapter: activeAdapter,
    listeners,
    rxdb: rxdb as unknown as RxDB
  };
};

describe('search plugin lifecycle', () => {
  afterEach(async () => {
    await disposeScopes();
    vi.clearAllMocks();
  });

  it('install() synchronously rejects invalid `searchable` declarations (fail-fast)', () => {
    const fake = buildFakeRxdb([InvalidArticle]);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    expect(() => installScoped(plugin)).toThrow(/Invalid "searchable"/);
    // schema 校验先于 `scope.acquire()`，作用域里一条登记都没有
    expect(fake.rxdb.addEventListener).not.toHaveBeenCalled();
  });

  it('fail-fast 之后 `ready` 也要结算，不能永久 pending', async () => {
    const fake = buildFakeRxdb([InvalidArticle]);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    expect(() => installScoped(plugin)).toThrow(/Invalid "searchable"/);

    // `ready` 是文档承诺的「装了没有」确认点。schema 校验抛在 `scope.acquire()` 之前，
    // 于是既没人 reject 这一格，作用域里也没有 `search:state` 条目能在释放时补上——
    // 不显式结算的话 `await plugin.ready` 会永久挂起，而调用方看不出与「还没轮到装」的区别。
    expect(await settlementOf(plugin.ready)).toBe('rejected');
    await expect(plugin.ready).rejects.toThrow(/Invalid "searchable"/);
  });

  it('install() binds entity events synchronously, before the install promise resolves', () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    installScoped(plugin);
    // 不 await ready：事件通道必须在同步阶段就挂载，否则在慢 install 期间
    // 已注册的 handle 会 silent miss 事件
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_UPDATE_EVENT, expect.any(Function));
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_REMOVE_EVENT, expect.any(Function));
  });

  it('normalizes entity names in global search and rejects unknown requested collections', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    installScoped(plugin);
    const handle = plugin.search('', { collections: ['Article'] });

    expect(() => plugin.search('', { collections: ['Article', 'Missing'] })).toThrow(
      /unknown collection\(s\).*Missing/
    );

    handle.destroy();
    await plugin.ready;
  });

  it('searchCollection fails fast for excluded and non-searchable collections', async () => {
    const excludedFake = buildFakeRxdb();
    const excludedPlugin = rxDBPluginSearch(excludedFake.rxdb, {
      debounce: 0,
      excludedCollections: ['Article']
    }) as RxDBPluginSearch;
    installScoped(excludedPlugin);

    expect(() => excludedPlugin.searchCollection('Article', '')).toThrow(/excludedCollections/);
    await excludedPlugin.ready;

    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    installScoped(plugin);

    expect(() => plugin.searchCollection('Missing', '')).toThrow(/not searchable/);
    await plugin.ready;
  });

  describe('Observable query 生命周期', () => {
    it('纯标点 Observable 查询保持 idle，不经过 loading/empty', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      installScoped(plugin);
      await plugin.ready;
      const handle = plugin.search(source);
      const states: SearchState[] = [];
      const sub = handle.state$.subscribe(state => states.push(state));

      source.next('!!!');

      await vi.waitFor(() => expect(states).toEqual(['idle']));
      expect(await firstValueFrom(handle.results$)).toEqual([]);

      sub.unsubscribe();
      handle.destroy();
    });

    it('同步 source error 进入 handle.error$，不逃逸到全局', async () => {
      const failure = new Error('同步 query source 失败');
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      installScoped(plugin);
      const handle = plugin.search(throwError(() => failure));
      const errors: Array<SearchExecutionError | undefined> = [];
      const sub = handle.error$.subscribe(error => errors.push(error));

      expect(errors.at(-1)).toBeInstanceOf(SearchExecutionError);
      expect(errors.at(-1)?.cause).toBe(failure);

      sub.unsubscribe();
      handle.destroy();
      await plugin.ready;
    });

    it('异步 source error 进入 handle.error$', async () => {
      const failure = new Error('异步 query source 失败');
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      installScoped(plugin);
      const handle = plugin.search(source);
      const errors: Array<SearchExecutionError | undefined> = [];
      const sub = handle.error$.subscribe(error => errors.push(error));

      source.error(failure);

      expect(errors.at(-1)).toBeInstanceOf(SearchExecutionError);
      expect(errors.at(-1)?.cause).toBe(failure);

      sub.unsubscribe();
      handle.destroy();
      await plugin.ready;
    });

    it('source complete 后仍可通过 setQuery 使用 handle', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      installScoped(plugin);
      await plugin.ready;
      const handle = plugin.search(source);

      source.complete();
      handle.setQuery('complete 后查询');

      await vi.waitFor(async () => {
        expect(await firstValueFrom(handle.state$)).toBe('empty');
      });

      handle.destroy();
    });

    it('handle destroy 后退订 query source，后续 error 不再派发', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      installScoped(plugin);
      const handle = plugin.search(source);

      expect(source.observed).toBe(true);
      handle.destroy();
      expect(source.observed).toBe(false);
      source.error(new Error('destroy 后错误'));

      await plugin.ready;
    });
  });

  it('纯标点 setQuery 保持 idle，不经过 loading/empty', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    installScoped(plugin);
    await plugin.ready;
    const handle = plugin.search('');
    const states: SearchState[] = [];
    const sub = handle.state$.subscribe(state => states.push(state));

    handle.setQuery('!!!');

    await vi.waitFor(() => expect(states).toEqual(['idle']));
    expect(await firstValueFrom(handle.results$)).toEqual([]);

    sub.unsubscribe();
    handle.destroy();
  });

  it('查询预算超限进入 error$，不执行搜索 SQL', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    installScoped(plugin);
    await plugin.ready;
    const handle = plugin.search('');
    handle.setQuery('a'.repeat(MAX_QUERY_LENGTH + 1));

    await vi.waitFor(async () => {
      expect(await firstValueFrom(handle.state$)).toBe('error');
    });
    expect(await firstValueFrom(handle.error$)).toBeInstanceOf(SearchQueryLimitError);

    handle.destroy();
  });

  it('missing rawQuery rejects ready; releasing the scope tears down listeners', async () => {
    const fake = buildFakeRxdb([FakeArticle], false);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const { scope, installing } = installScoped(plugin);

    // 宿主拿 `install()` 的返回值喂 `connect()`，调用方拿 `ready`：两个对象，同一个失败
    await expect(installing).rejects.toThrow(/does not implement rawQuery/);
    await expect(plugin.ready).rejects.toThrow(/does not implement rawQuery/);

    await scope.dispose();
    expect(fake.rxdb.removeEventListener).toHaveBeenCalledTimes(3);
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(0);
  });

  it('install failure tears down listeners and makes public search entrypoints fail with the original error', async () => {
    const failure = new Error('fts install exploded');
    installFtsForEntity.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const { scope, installing } = installScoped(plugin);
    const handle = plugin.search('');
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(1);

    await expect(installing).rejects.toBe(failure);
    // `ready` 与 `install()` 的返回值是两个对象，但同一个失败：宿主靠后者把错误传给
    // `connect()`，调用方靠前者拿到同一个原因
    await expect(plugin.ready).rejects.toBe(failure);

    expect(consoleError).not.toHaveBeenCalled();
    // 半途失败的插件自己不收尾：宿主握着清单，替它逆序退回去（`#discard_plugin_scope`）
    await scope.dispose();
    expect(fake.rxdb.removeEventListener).toHaveBeenCalledTimes(3);
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(0);
    expect(() => plugin.search('later')).toThrow(failure);
    expect(() => plugin.searchCollection('Article', 'later')).toThrow(failure);

    handle.destroy();
    consoleError.mockRestore();
  });

  // --- P1-009：未安装 / 已销毁时两个入口必须对称 fail-fast ---
  // 回归背景：`search()` 曾在这两种状态下静默返回**永久空**结果——`#searchEntries` 为空
  // → scope 为 `[]` → `#buildPerformSearch` 直接 `return { results: [], hasMore: false }`，
  // 且 scope 在建 handle 时就被闭包冻结，`install()` 完成后也不会自愈。
  // 而 `searchCollection()` 同样状态下抛错。同一误用两种行为，违反「无 fallback 兜底」。

  it('search() fails fast before install() instead of returning a permanently empty handle', () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    expect(() => plugin.search('hello')).toThrow(/not installed/);
  });

  it('searchCollection() before install() reports "not installed", not the misleading "not searchable"', () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    // 未安装时 `#searchEntries` 为空，旧实现会把「插件没装」误报成「这个 collection 不可搜索」
    expect(() => plugin.searchCollection('Article', 'hello')).toThrow(/not installed/);
  });

  it('publishes the plugin instance as a stable readonly RxDB property', () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    expect(fake.rxdb.searchPlugin).toBe(plugin);
    expect(Object.getOwnPropertyDescriptor(fake.rxdb, 'searchPlugin')).toMatchObject({
      value: plugin,
      enumerable: false,
      configurable: false,
      writable: false
    });
    expect(rxDBPluginSearch(fake.rxdb, { debounce: 999 })).toBe(plugin);
  });

  it('rejects an incompatible pre-existing searchPlugin property', () => {
    const fake = buildFakeRxdb();
    Object.defineProperty(fake.rxdb, 'searchPlugin', { value: Object.freeze({}) });

    expect(() => rxDBPluginSearch(fake.rxdb, { debounce: 0 })).toThrow(
      'search plugin is already installed with an incompatible instance'
    );
    expect(Object.hasOwn(fake.rxdb, 'search')).toBe(false);
    expect(Object.hasOwn(fake.rxdb, 'searchCollection')).toBe(false);
  });

  // 「未安装先 reject」的老口径在 US-015 被 pending 取代：依赖调度落地之后，「还没轮到装」
  // 与「装不起来」不再是同一件事。老口径下 `await connect()` 与 `await ready` 之间存在
  // 竞态窗口——connect() 还在飞，ready 已经 reject，调用方拿到的错误与真实原因无关。
  it('ready 在 install() 之前保持 pending，装好后 resolve 同一格', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const pendingBefore = plugin.ready;
    expect(await settlementOf(pendingBefore)).toBe('pending');

    const { installing } = installScoped(plugin);
    // 两个对象：`installing` 归宿主（喂给 `connect()`），`ready` 跨纪元存活
    expect(plugin.ready).not.toBe(installing);
    // 安装前拿到的引用不作废：还 pending 的那一格被本纪元续用，不换新
    expect(plugin.ready).toBe(pendingBefore);

    await installing;
    await expect(pendingBefore).resolves.toBeUndefined();
  });

  it('both entrypoints fail fast after the scope is released', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const { scope } = installScoped(plugin);
    await plugin.ready;
    // `lifecycle: 'scoped'` 之后释放作用域就是全部拆卸，没有第二步 `destroy()`
    await scope.dispose();

    expect(() => plugin.search('hello')).toThrow(/not installed/);
    expect(() => plugin.searchCollection('Article', 'hello')).toThrow(/not installed/);
  });

  it('作用域释放后重装：两个入口恢复可用，ready 换新一格', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const first = installScoped(plugin);
    await plugin.ready;
    await first.scope.dispose();
    const released = plugin.ready;

    const second = installScoped(plugin);
    await second.installing;

    // 守卫只看当前作用域是否 active，不是一次性闸门
    expect(() => plugin.search('hello')).not.toThrow();
    expect(() => plugin.searchCollection('Article', 'hello')).not.toThrow();
    // 上一纪元那一格停在 destroyed 上，新纪元另起一格
    await expect(released).rejects.toThrow(/destroyed/);
    expect(plugin.ready).not.toBe(released);
    await expect(plugin.ready).resolves.toBeUndefined();
  });

  it('旧纪元迟到的 install 只丢弃结果，不改写新纪元的 engine', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    // 第一纪元卡在 FTS 安装上：此时还没走到建 engine 那一步
    let landStaleInstall: (() => void) | undefined;
    installFtsForEntity.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          landStaleInstall = () =>
            resolve({ tableName: 'article', status: 'installed', fields: [{ name: 'title', isArray: false }] });
        })
    );
    const stale = installScoped(plugin);
    await vi.waitFor(() => expect(landStaleInstall).toBeTypeOf('function'));

    // 断连：宿主释放作用域即完成拆卸
    await stale.scope.dispose();

    // 第二纪元正常装好，engine 属于新纪元
    const fresh = installScoped(plugin);
    await fresh.installing;
    expect(createSearchEngine).toHaveBeenCalledTimes(1);
    const freshEngine = createSearchEngine.mock.results.at(-1)?.value;

    // 旧纪元现在才跑完 FTS：它手里的 rawQuery 绑的是上一纪元的适配器
    landStaleInstall?.();
    await stale.installing;

    // 迟到结果被丢弃：没有第二个 engine，新纪元的 handle 也没被它唤醒
    expect(createSearchEngine).toHaveBeenCalledTimes(1);

    const handle = plugin.search('title');
    await vi.waitFor(() => expect(freshEngine?.search).toHaveBeenCalled());

    handle.destroy();
  });

  it('init() 回滚 + 同步重试：旧纪元醒来时不再重跑 FTS DDL', async () => {
    // 宿主 `init()` 失败会回滚（释放作用域）再同步重试，于是同一个插件实例上会有两轮
    // `install()` 并存。旧那一轮此刻正卡在 FTS 安装里，醒来时手里的 `scope` 已经不是
    // 当前纪元了。纪元校验必须在**每个** plan 的 DDL 之前，否则同一批 DDL 打两遍。
    let landStale!: () => void;
    installFtsForEntity.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          landStale = () =>
            resolve({ tableName: 'article', status: 'installed', fields: [{ name: 'title', isArray: false }] });
        })
    );
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const stale = installScoped(plugin);
    await vi.waitFor(() => expect(landStale).toBeTypeOf('function'));
    // 宿主回滚：释放作用域
    await stale.scope.dispose();
    // 同步重试 init() → 同一个插件实例再装一轮
    const fresh = installScoped(plugin);
    await fresh.installing;

    // 旧那一轮这才醒来
    landStale();
    await stale.installing;

    // 一个 entity 一个 plan：第一轮卡住那次 + 重试那一轮，engine 只该属于后者
    expect(installFtsForEntity).toHaveBeenCalledTimes(2);
    expect(createSearchEngine).toHaveBeenCalledTimes(1);
    await expect(plugin.ready).resolves.toBeUndefined();
    expect(() => plugin.searchCollection('Article', 'hello')).not.toThrow();
  });

  it('旧纪元的作用域迟到释放：不清掉新纪元的缓存，也不动新纪元的 ready', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    // 纪元身份就是 scope 的引用，不是一个单调递增的号。两轮 install 并存时，
    // 迟到的那次释放必须按引用认出自己已经过期，否则新纪元的缓存被旧纪元的收尾清空
    const staleScope = new LifecycleScope('search-spec-stale');
    const freshScope = new LifecycleScope('search-spec-fresh');
    await plugin.install(staleScope);
    await plugin.install(freshScope);

    await staleScope.dispose();

    expect(() => plugin.searchCollection('Article', 'hello')).not.toThrow();
    await expect(plugin.ready).resolves.toBeUndefined();

    // 当前纪元自己释放时才真正拆卸
    await freshScope.dispose();
    expect(() => plugin.searchCollection('Article', 'hello')).toThrow(/not installed/);
    await expect(plugin.ready).rejects.toThrow(/destroyed/);
  });

  it('作用域释放后重装：按当下的 entities 重扫，不复用上一轮 plan', async () => {
    const entities: unknown[] = [FakeArticle];
    const fake = buildFakeRxdb(entities);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const first = installScoped(plugin);
    await first.installing;
    await first.scope.dispose();

    // `entities` 是 LIVE_BEHAVIOUR_CONFIG_KEYS 里的字段，宿主有意不深冻结它
    entities.push(FakeNote);
    const second = installScoped(plugin);
    await second.installing;

    expect(() => plugin.searchCollection('Note', 'hello')).not.toThrow();
    // 两个 plan 都装：第一轮 1 次 + 第二轮 2 次
    expect(installFtsForEntity).toHaveBeenCalledTimes(3);
  });

  it('三路 entity 事件各自一条登记，第二条注册失败时第一条不会留在宿主上', async () => {
    const fake = buildFakeRxdb();
    const boom = new Error('addEventListener 第二条炸了');
    const addEventListener = vi.mocked(fake.rxdb.addEventListener);
    addEventListener.mockImplementationOnce(addEventListener.getMockImplementation()!).mockImplementationOnce(() => {
      throw boom;
    });
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const scope = new LifecycleScope('search-spec-partial-bind');
    expect(() => plugin.install(scope)).toThrow(boom);

    // 第一条已经挂上去了，作用域必须握着它的撤销条目
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(1);
    await scope.dispose();
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(0);
  });

  // 拆卸一步到位：插件声明了 `lifecycle: 'scoped'`，宿主释放完作用域就收手，
  // 状态复位挂在作用域最先登记、因而最后执行的那条 `search:state` 条目上。
  it('releasing the scope unsubscribes entity events and rejects ready', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const { scope } = installScoped(plugin);
    await plugin.ready;
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)?.length ?? 0).toBe(1);

    await scope.dispose();

    expect(fake.rxdb.removeEventListener).toHaveBeenCalledTimes(3);
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)?.length ?? 0).toBe(0);

    // 已经 resolve 的那一格改不动，换一格 rejected 顶上：纪元没了，`search()` 一定抛，
    // `ready` 就不能还留着上一纪元的 resolve
    await expect(plugin.ready).rejects.toThrow(SearchError);
    await expect(plugin.ready).rejects.toThrow(/destroyed/);
  });
});
