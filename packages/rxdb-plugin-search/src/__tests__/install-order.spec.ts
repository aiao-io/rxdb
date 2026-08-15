import { Entity, EntityBase, PropertyType, type RxDB } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FtsInstallPlan } from '../core/fts5-installer.js';
import type { InstallFtsResult, MigrationRecordStore, RuntimeSqlExecutor } from '../core/fts5-runtime.js';
import type { SearchResult } from '../types.js';

const { installFtsForEntity, engineSearch } = vi.hoisted(() => ({
  installFtsForEntity: vi.fn(
    async (
      _plan: FtsInstallPlan,
      _executor: RuntimeSqlExecutor,
      _store: MigrationRecordStore
    ): Promise<InstallFtsResult> => ({
      tableName: 'article',
      status: 'installed' as const,
      fields: [{ name: 'title', isArray: false }]
    })
  ),
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
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('waits for connected$ (tables ready) before installing FTS and refreshes handles created before ready', async () => {
    let resolveConnect!: () => void;
    const connectGate = new Promise<void>(resolve => {
      resolveConnect = resolve;
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

    const connected$ = new BehaviorSubject(false);
    const fakeRxdb = {
      config: {
        sync: { local: { adapter: 'sqlite-wasm' } },
        entities: [FakeArticle]
      },
      localAdapter$: new BehaviorSubject(adapter),
      connected$,
      connect: vi.fn(async () => {
        await connectGate;
        return adapter;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as RxDB;

    const plugin = rxDBPluginSearch(fakeRxdb, { debounce: 0 }) as RxDBPluginSearch;
    const installation = plugin.install();
    expect(installation).toBe(plugin.ready);

    const handle = fakeRxdb.search('alpha');
    const emissions: string[][] = [];
    const sub = handle.results$.subscribe((results: readonly Readonly<SearchResult>[]) => {
      emissions.push(results.map(result => result.id));
    });

    await Promise.resolve();
    expect(fakeRxdb.connect).toHaveBeenCalledWith('sqlite-wasm');
    expect(adapter.bootstrapTransaction).not.toHaveBeenCalled();
    expect(installFtsForEntity).not.toHaveBeenCalled();
    expect(emissions.at(-1) ?? []).toEqual([]);

    resolveConnect();
    await Promise.resolve();
    expect(installFtsForEntity).not.toHaveBeenCalled();

    connected$.next(true);
    await plugin.ready;

    expect(adapter.bootstrapTransaction).toHaveBeenCalledTimes(1);
    expect(installFtsForEntity).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(engineSearch).toHaveBeenCalled();
      expect(emissions.at(-1)).toEqual(['article-1']);
    });

    sub.unsubscribe();
    handle.destroy();
  });

  it('does not deadlock when FTS rawQuery / migration repo re-enter RxDB.connect()', async () => {
    installFtsForEntity.mockImplementationOnce(async (_plan, executor, store) => {
      await executor.rawQuery('SELECT 1');
      await store.listInstallMigrationsForTable('article');
      return {
        tableName: 'article',
        status: 'installed' as const,
        fields: [{ name: 'title', isArray: false }]
      };
    });

    let finishPlugins!: () => void;
    const pluginGate = new Promise<void>(resolve => {
      finishPlugins = resolve;
    });
    const connected$ = new BehaviorSubject(false);
    const reenterConnect = async () => {
      await fakeRxdb.connect('sqlite-wasm');
    };
    const rawQuery = vi.fn(async () => {
      await reenterConnect();
      return { rowsAffected: 0, rows: [], columns: [] };
    });
    const migrationRepository = {
      find: vi.fn(async () => {
        await reenterConnect();
        return [];
      }),
      create: vi.fn(async (entity: unknown) => {
        await reenterConnect();
        return entity;
      })
    };
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
      config: {
        sync: { local: { adapter: 'sqlite-wasm' } },
        entities: [FakeArticle]
      },
      localAdapter$: new BehaviorSubject(adapter),
      connected$,
      connect: vi.fn(async () => {
        connected$.next(true);
        await pluginGate;
        return adapter;
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as RxDB;

    const plugin = rxDBPluginSearch(fakeRxdb, { debounce: 0 }) as RxDBPluginSearch;
    plugin.install();

    const hung = Promise.race([
      plugin.ready.then(() => 'ready' as const),
      new Promise<'hung'>(resolve => {
        setTimeout(() => resolve('hung'), 50);
      })
    ]);

    await expect(hung).resolves.toBe('ready');
    expect(adapter.bootstrapTransaction).toHaveBeenCalled();
    expect(rawQuery).not.toHaveBeenCalled();
    finishPlugins();
    await plugin.ready;
  });
});
