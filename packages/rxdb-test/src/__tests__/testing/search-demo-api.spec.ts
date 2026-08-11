import type { EntityType, RxDB } from '@aiao/rxdb';
import { of, startWith, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installSearchDemoTestApi, type SearchDemoEntityDeps } from '../../testing/search-demo-api.js';

class ArticleStub {
  id = '';
  title = '';
  remove = vi.fn(async () => undefined);
  save = vi.fn(async () => undefined);
}

class CommentStub {}

const defaultDeps: SearchDemoEntityDeps = {
  Article: ArticleStub as unknown as EntityType,
  Comment: CommentStub as unknown as EntityType,
  seedData: async () => undefined
};

const getInstalledApi = () => {
  const api = window.__searchDemoTestApi;
  if (!api) throw new Error('search demo API was not installed');
  return api;
};

afterEach(() => {
  if (typeof window !== 'undefined') delete window.__searchDemoTestApi;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('installSearchDemoTestApi', () => {
  it('does nothing during SSR', () => {
    vi.stubGlobal('window', undefined);
    const db = {} as RxDB;

    expect(() => installSearchDemoTestApi(db, defaultDeps)).not.toThrow();
  });

  it('clears comments and articles before reseeding', async () => {
    vi.useFakeTimers();
    const article = new ArticleStub();
    const comment = new CommentStub();
    const events: string[] = [];
    const removeMany = vi.fn(async (records: object[]) => {
      events.push(records[0] === comment ? 'remove-comment' : 'remove-article');
    });
    const seedData = vi.fn(async () => {
      events.push('seed');
    });
    const deps: SearchDemoEntityDeps = { ...defaultDeps, seedData };
    const db = {
      entityManager: {
        getRepository: (entity: EntityType) => ({
          findAll: () => of(entity === deps.Comment ? [comment] : [article])
        }),
        removeMany
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, deps);
    const reset = getInstalledApi().reset();
    await vi.advanceTimersByTimeAsync(50);
    await reset;

    expect(events).toEqual(['remove-comment', 'remove-article', 'seed']);
    expect(removeMany).toHaveBeenCalledTimes(2);
    expect(seedData).toHaveBeenCalledWith(db);
  });

  // sleep 在锁外时，reset() 返回前的这段窗口里锁已经释放：另一次 reset()（或页面自动 seed）
  // 可以立刻开始 clearEntityRecords，第一个调用方拿到 resolve 时数据正被清空。
  // 串行化保证恰好在最需要它的收尾阶段失效。
  it('keeps the settle window inside the seed lock', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const db = {
      entityManager: {
        getRepository: () => ({ findAll: () => of([]) }),
        removeMany: vi.fn(async () => undefined)
      }
    } as unknown as RxDB;
    const deps: SearchDemoEntityDeps = {
      ...defaultDeps,
      seedData: async () => {
        events.push('seed');
      }
    };

    installSearchDemoTestApi(db, deps);
    const api = getInstalledApi();

    const first = api.reset();
    const second = api.reset().then(() => events.push('second-done'));

    // 推进到第一次 reset 的 settle 窗口正中：此时第二次 reset 必须还没开始 seed
    await vi.advanceTimersByTimeAsync(25);
    expect(events).toEqual(['seed']);

    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([first, second]);

    expect(events).toEqual(['seed', 'seed', 'second-done']);
  });

  it('allows callers to configure the settle window', async () => {
    vi.useFakeTimers();
    const db = {
      entityManager: {
        getRepository: () => ({ findAll: () => of([]) }),
        removeMany: vi.fn(async () => undefined)
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, { ...defaultDeps, settleMs: 0 });
    const reset = getInstalledApi().reset();
    await vi.advanceTimersByTimeAsync(0);

    await expect(reset).resolves.toBeUndefined();
  });

  it('serializes reset with create, update, and remove mutations', async () => {
    let releaseSeed!: () => void;
    let markSeedStarted!: () => void;
    const seedStarted = new Promise<void>(resolve => {
      markSeedStarted = resolve;
    });
    const seedReleased = new Promise<void>(resolve => {
      releaseSeed = resolve;
    });
    const article = new ArticleStub();
    article.id = 'article-1';
    const create = vi.fn(async () => undefined);
    const findAll = vi.fn(() => of([article]));
    const db = {
      entityManager: {
        getRepository: () => ({ create, findAll }),
        removeMany: vi.fn(async () => undefined)
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, {
      ...defaultDeps,
      settleMs: 0,
      seedData: async () => {
        markSeedStarted();
        await seedReleased;
      }
    });
    const api = getInstalledApi();
    const reset = api.reset();
    await seedStarted;
    const resetFindCalls = findAll.mock.calls.length;

    const mutations = [
      api.createArticle({}),
      api.updateArticle(article.id, { title: 'updated' }),
      api.removeArticle(article.id)
    ];
    await Promise.resolve();

    expect(create).not.toHaveBeenCalled();
    expect(findAll).toHaveBeenCalledTimes(resetFindCalls);
    expect(article.save).not.toHaveBeenCalled();
    expect(article.remove).not.toHaveBeenCalled();

    releaseSeed();
    await Promise.all([reset, ...mutations]);

    expect(create).toHaveBeenCalledOnce();
    expect(findAll).toHaveBeenCalledTimes(resetFindCalls + 2);
    expect(article.save).toHaveBeenCalledOnce();
    expect(article.remove).toHaveBeenCalledOnce();
  });

  it('creates collision-free default ids within the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    const created: ArticleStub[] = [];
    const db = {
      entityManager: {
        getRepository: () => ({
          create: async (article: ArticleStub) => {
            created.push(article);
            return article;
          }
        })
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);
    const api = getInstalledApi();
    const left = await api.createArticle({});
    const right = await api.createArticle({ title: 'overridden' });

    expect(left.id).not.toBe(right.id);
    expect(created.map(article => article.id)).toEqual([left.id, right.id]);
    expect(created[1].title).toBe('overridden');
  });

  it('updates and removes an existing article', async () => {
    const article = new ArticleStub();
    article.id = 'article-1';
    const db = {
      entityManager: {
        getRepository: () => ({ findAll: () => of([article]) })
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);
    const api = getInstalledApi();

    await expect(api.updateArticle(article.id, { title: 'updated' })).resolves.toEqual({ id: article.id });
    await expect(api.removeArticle(article.id)).resolves.toEqual({ id: article.id });
    expect(article.title).toBe('updated');
    expect(article.save).toHaveBeenCalledOnce();
    expect(article.remove).toHaveBeenCalledOnce();
  });

  it('rejects update and remove operations for an unknown article', async () => {
    const db = {
      entityManager: {
        getRepository: () => ({ findAll: () => of([]) })
      }
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);
    const api = getInstalledApi();

    await expect(api.updateArticle('missing', {})).rejects.toThrow('Article not found: missing');
    await expect(api.removeArticle('missing')).rejects.toThrow('Article not found: missing');
  });

  it('returns normalized search results and destroys the handle', async () => {
    const destroy = vi.fn();
    const search = vi.fn(() => ({
      state$: of('loading', 'success'),
      results$: of([{ collection: 'articles', id: 'article-1', rank: 1.23456 }]),
      destroy
    }));
    const db = {
      entityManager: { getRepository: () => ({}) },
      search
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    await expect(getInstalledApi().runSearch('sqlite', 5)).resolves.toEqual({
      state: 'success',
      results: [{ collection: 'articles', id: 'article-1', rank: 1.2346 }]
    });
    expect(search).toHaveBeenCalledWith('sqlite', { pageSize: 5, debounce: 0 });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('uses the default page size for an empty search result', async () => {
    const destroy = vi.fn();
    const search = vi.fn(() => ({ state$: of('empty'), results$: of([]), destroy }));
    const db = {
      entityManager: { getRepository: () => ({}) },
      search
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    await expect(getInstalledApi().runSearch('missing')).resolves.toEqual({ state: 'empty', results: [] });
    expect(search).toHaveBeenCalledWith('missing', { pageSize: 10, debounce: 0 });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('always destroys a search handle when reading state fails', async () => {
    const failure = new Error('state failed');
    const destroy = vi.fn();
    const db = {
      entityManager: { getRepository: () => ({}) },
      search: () => ({
        state$: throwError(() => failure),
        results$: of([]),
        destroy
      })
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    await expect(getInstalledApi().runSearch('sqlite')).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('always destroys a search handle when reading results fails', async () => {
    const failure = new Error('results failed');
    const destroy = vi.fn();
    const db = {
      entityManager: { getRepository: () => ({}) },
      search: () => ({
        state$: of('success'),
        results$: throwError(() => failure),
        destroy
      })
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    await expect(getInstalledApi().runSearch('sqlite')).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledOnce();
  });

  // RXT-002：搜索失败走的是持续流上的 `state='error'`，不是 Observable error。
  // 现有用例只造 `throwError()`，而 `state='error'` 时 filter 永不放行，
  // firstValueFrom 永不 settle —— runSearch 挂起且 finally 不执行，handle 泄漏。
  it('rejects and destroys the handle when the search reaches the error state', async () => {
    const destroy = vi.fn();
    const db = {
      entityManager: { getRepository: () => ({}) },
      search: () => ({
        state$: of('loading', 'error'),
        results$: of([]),
        destroy
      })
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    await expect(getInstalledApi().runSearch('sqlite')).rejects.toThrow(/search failed.*error/i);
    expect(destroy).toHaveBeenCalledOnce();
  });

  // 流始终停在非终态（loading）时必须超时报错并带上最后状态，
  // 否则 Playwright 只会给一句无线索的 page.evaluate 超时。
  it('rejects with the last state when no terminal state arrives before the timeout', async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    const db = {
      entityManager: { getRepository: () => ({}) },
      search: () => ({
        state$: new Subject<string>().pipe(startWith('loading')),
        results$: of([]),
        destroy
      })
    } as unknown as RxDB;

    installSearchDemoTestApi(db, defaultDeps);

    const pending = getInstalledApi().runSearch('sqlite');
    const assertion = expect(pending).rejects.toThrow(/did not reach a terminal state.*loading/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(destroy).toHaveBeenCalledOnce();
  });
});
