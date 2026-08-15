import { Entity, EntityBase, PropertyType, type RxDB } from '@aiao/rxdb';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SearchResult } from '../types.js';

const { installFtsForEntity, engineSearch } = vi.hoisted(() => ({
  installFtsForEntity: vi.fn(async () => ({
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
      getRepository: vi.fn(() => migrationRepository)
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
    expect(adapter.getRepository).not.toHaveBeenCalled();
    expect(installFtsForEntity).not.toHaveBeenCalled();
    expect(emissions.at(-1) ?? []).toEqual([]);

    resolveConnect();
    await Promise.resolve();
    expect(installFtsForEntity).not.toHaveBeenCalled();

    connected$.next(true);
    await plugin.ready;

    expect(adapter.getRepository).toHaveBeenCalledTimes(1);
    expect(installFtsForEntity).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(engineSearch).toHaveBeenCalled();
      expect(emissions.at(-1)).toEqual(['article-1']);
    });

    sub.unsubscribe();
    handle.destroy();
  });
});
