/**
 * 插件生命周期回归测试。
 *
 * 覆盖:
 *  - `install()` 同步阶段对 schema 做 fail-fast（接入 `assertSearchableSchemaValid`）
 *  - `install()` 同步阶段就挂载 entity 事件通道（在 `await ready` 之前 handle 也能收到事件）
 *  - `destroy()` 清空 `#installPromise`，避免后续 `await ready` 仍 resolve 旧 promise
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
import { BehaviorSubject, firstValueFrom, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { installFtsForEntity } = vi.hoisted(() => ({
  installFtsForEntity: vi.fn(async () => ({
    tableName: 'article',
    status: 'installed' as const,
    fields: [{ name: 'title', isArray: false }]
  }))
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
    createSearchEngine: vi.fn(() => ({ search: vi.fn(async () => []) }))
  };
});

import { MAX_QUERY_LENGTH } from '../core/query-compiler.js';
import { rxDBPluginSearch, type RxDBPluginSearch } from '../plugin.js';
import { SearchError, SearchExecutionError, SearchQueryLimitError, type SearchState } from '../types.js';

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
  name: 'InvalidArticle',
  tableName: 'invalid_article',
  properties: [{ name: 'id', type: PropertyType.string, primary: true }, invalidSearchableIntegerProperty]
})
class InvalidArticle extends EntityBase {}

type EntityChangeEvent = EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent;

const buildFakeRxdb = (entities = [FakeArticle], exposesRawQuery = true) => {
  const rawQuery = vi.fn(async () => ({ rowsAffected: 0, rows: [], columns: [] }));
  const migrationRepository = {
    find: vi.fn(async () => []),
    create: vi.fn(async (entity: unknown) => entity)
  };
  const listeners = new Map<string, ((event: EntityChangeEvent) => void)[]>();
  const activeAdapter = exposesRawQuery ? { rawQuery, getRepository: vi.fn(() => migrationRepository) } : {};
  const rxdb = {
    config: {
      sync: { local: { adapter: 'sqlite-wasm' } },
      entities
    },
    localAdapter$: new BehaviorSubject(activeAdapter),
    connected$: new BehaviorSubject(true),
    connect: vi.fn(async () => activeAdapter),
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('install() synchronously rejects invalid `searchable` declarations (fail-fast)', () => {
    const fake = buildFakeRxdb([InvalidArticle]);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    expect(() => plugin.install()).toThrow(/Invalid "searchable"/);
  });

  it('install() binds entity events synchronously, before the install promise resolves', () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    // 不 await ready：事件通道必须在同步阶段就挂载，否则在慢 install 期间
    // 已注册的 handle 会 silent miss 事件
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_CREATE_EVENT, expect.any(Function));
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_UPDATE_EVENT, expect.any(Function));
    expect(fake.rxdb.addEventListener).toHaveBeenCalledWith(ENTITY_LOCAL_REMOVE_EVENT, expect.any(Function));
  });

  it('normalizes entity names in global search and rejects unknown requested collections', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    const handle = plugin.search('', { collections: ['Article'] });

    expect(() => plugin.search('', { collections: ['Article', 'Missing'] })).toThrow(
      /unknown collection\(s\).*Missing/
    );

    handle.destroy();
    await plugin.ready;
    plugin.destroy();
  });

  it('searchCollection fails fast for excluded and non-searchable collections', async () => {
    const excludedFake = buildFakeRxdb();
    const excludedPlugin = rxDBPluginSearch(excludedFake.rxdb, {
      debounce: 0,
      excludedCollections: ['Article']
    }) as RxDBPluginSearch;
    excludedPlugin.install();

    expect(() => excludedPlugin.searchCollection('Article', '')).toThrow(/excludedCollections/);
    await excludedPlugin.ready;
    excludedPlugin.destroy();

    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    plugin.install();

    expect(() => plugin.searchCollection('Missing', '')).toThrow(/not searchable/);
    await plugin.ready;
    plugin.destroy();
  });

  describe('Observable query 生命周期', () => {
    it('纯标点 Observable 查询保持 idle，不经过 loading/empty', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      plugin.install();
      await plugin.ready;
      const handle = plugin.search(source);
      const states: SearchState[] = [];
      const sub = handle.state$.subscribe(state => states.push(state));

      source.next('!!!');

      await vi.waitFor(() => expect(states).toEqual(['idle']));
      expect(await firstValueFrom(handle.results$)).toEqual([]);

      sub.unsubscribe();
      handle.destroy();
      plugin.destroy();
    });

    it('同步 source error 进入 handle.error$，不逃逸到全局', async () => {
      const failure = new Error('同步 query source 失败');
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      plugin.install();
      const handle = plugin.search(throwError(() => failure));
      const errors: Array<SearchExecutionError | undefined> = [];
      const sub = handle.error$.subscribe(error => errors.push(error));

      expect(errors.at(-1)).toBeInstanceOf(SearchExecutionError);
      expect(errors.at(-1)?.cause).toBe(failure);

      sub.unsubscribe();
      handle.destroy();
      await plugin.ready;
      plugin.destroy();
    });

    it('异步 source error 进入 handle.error$', async () => {
      const failure = new Error('异步 query source 失败');
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      plugin.install();
      const handle = plugin.search(source);
      const errors: Array<SearchExecutionError | undefined> = [];
      const sub = handle.error$.subscribe(error => errors.push(error));

      source.error(failure);

      expect(errors.at(-1)).toBeInstanceOf(SearchExecutionError);
      expect(errors.at(-1)?.cause).toBe(failure);

      sub.unsubscribe();
      handle.destroy();
      await plugin.ready;
      plugin.destroy();
    });

    it('source complete 后仍可通过 setQuery 使用 handle', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      plugin.install();
      await plugin.ready;
      const handle = plugin.search(source);

      source.complete();
      handle.setQuery('complete 后查询');

      await vi.waitFor(async () => {
        expect(await firstValueFrom(handle.state$)).toBe('empty');
      });

      handle.destroy();
      plugin.destroy();
    });

    it('handle destroy 后退订 query source，后续 error 不再派发', async () => {
      const source = new Subject<string>();
      const fake = buildFakeRxdb();
      const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
      plugin.install();
      const handle = plugin.search(source);

      expect(source.observed).toBe(true);
      handle.destroy();
      expect(source.observed).toBe(false);
      source.error(new Error('destroy 后错误'));

      await plugin.ready;
      plugin.destroy();
    });
  });

  it('纯标点 setQuery 保持 idle，不经过 loading/empty', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    plugin.install();
    await plugin.ready;
    const handle = plugin.search('');
    const states: SearchState[] = [];
    const sub = handle.state$.subscribe(state => states.push(state));

    handle.setQuery('!!!');

    await vi.waitFor(() => expect(states).toEqual(['idle']));
    expect(await firstValueFrom(handle.results$)).toEqual([]);

    sub.unsubscribe();
    handle.destroy();
    plugin.destroy();
  });

  it('查询预算超限进入 error$，不执行搜索 SQL', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;
    plugin.install();
    await plugin.ready;
    const handle = plugin.search('');
    handle.setQuery('a'.repeat(MAX_QUERY_LENGTH + 1));

    await vi.waitFor(async () => {
      expect(await firstValueFrom(handle.state$)).toBe('error');
    });
    expect(await firstValueFrom(handle.error$)).toBeInstanceOf(SearchQueryLimitError);

    handle.destroy();
    plugin.destroy();
  });

  it('missing rawQuery rejects ready and tears down listeners', async () => {
    const fake = buildFakeRxdb([FakeArticle], false);
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();

    await expect(plugin.ready).rejects.toThrow(/does not implement rawQuery/);
    expect(fake.rxdb.removeEventListener).toHaveBeenCalledTimes(3);
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(0);
  });

  it('install failure tears down listeners and makes public search entrypoints fail with the original error', async () => {
    const failure = new Error('fts install exploded');
    installFtsForEntity.mockRejectedValueOnce(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    const installing = plugin.install();
    expect(plugin.ready).toBe(installing);
    const handle = plugin.search('');
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)).toHaveLength(1);

    await expect(installing).rejects.toBe(failure);
    expect(plugin.ready).toBe(installing);

    expect(consoleError).not.toHaveBeenCalled();
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

  it('ready rejects before install and shares the install promise afterwards', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    await expect(plugin.ready).rejects.toThrow(SearchError);
    await expect(plugin.ready).rejects.toThrow(/not installed/);

    const installing = plugin.install();
    expect(plugin.ready).toBe(installing);
    await installing;
    expect(plugin.ready).toBe(installing);

    plugin.destroy();
  });

  it('both entrypoints fail fast after destroy()', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    await plugin.ready;
    plugin.destroy();

    expect(() => plugin.search('hello')).toThrow(/not installed/);
    expect(() => plugin.searchCollection('Article', 'hello')).toThrow(/not installed/);
  });

  it('re-install() after destroy() restores both entrypoints', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    await plugin.ready;
    plugin.destroy();
    plugin.install();
    await plugin.ready;

    // 守卫只看安装状态，不是一次性闸门
    expect(() => plugin.search('hello')).not.toThrow();
    expect(() => plugin.searchCollection('Article', 'hello')).not.toThrow();
    plugin.destroy();
  });

  it('destroy() rejects ready and unsubscribes entity events', async () => {
    const fake = buildFakeRxdb();
    const plugin = rxDBPluginSearch(fake.rxdb, { debounce: 0 }) as RxDBPluginSearch;

    plugin.install();
    await plugin.ready;
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)?.length ?? 0).toBe(1);

    plugin.destroy();

    expect(fake.rxdb.removeEventListener).toHaveBeenCalledTimes(3);
    expect(fake.listeners.get(ENTITY_LOCAL_CREATE_EVENT)?.length ?? 0).toBe(0);

    await expect(plugin.ready).rejects.toThrow(SearchError);
    await expect(plugin.ready).rejects.toThrow(/destroyed/);
  });
});
