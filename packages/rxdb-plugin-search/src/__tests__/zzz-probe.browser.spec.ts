import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RxDBPluginSearch, rxDBPluginSearch } from '../plugin.js';
import type { SearchHandle, SearchResult, SearchState } from '../types.js';
import { Article } from './fixtures/article.entity.js';
import { Comment } from './fixtures/comment.entity.js';
import { disposeScopes, installScoped } from './scoped-install.js';

const mk = async (titles: string[]) => {
  const rxdb = new RxDB({
    dbName: `probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entities: [Article, Comment],
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  });
  rxdb.adapter('sqlite-wasm', db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1 }));
  rxdb.init();
  const adapter = (await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite;
  const repo = rxdb.entityManager.getRepository(Article);
  for (const t of titles) {
    await repo.create(
      rxdb.entityManager.instantiate(Article, {
        title: t,
        body: t,
        category: 'tech' as const,
        tags: [],
        authorId: 'a',
        viewCount: 0
      })
    );
  }
  const plugin = rxDBPluginSearch(rxdb, { debounce: 0, pageSize: 10 }) as RxDBPluginSearch;
  const { scope } = installScoped(plugin);
  await plugin.ready;
  return {
    rxdb,
    adapter,
    async cleanup() {
      // `lifecycle: 'scoped'` 之后释放作用域就是全部拆卸，没有第二步 `destroy()`
      await scope.dispose();
      await rxdb.disconnectAll();
    }
  };
};

const observe = (handle: SearchHandle) => {
  let state: SearchState = 'idle';
  let results: SearchResult[] = [];
  let hasMore = false;
  const subs = new Subscription();
  subs.add(handle.state$.subscribe(v => (state = v)));
  subs.add(handle.results$.subscribe(v => (results = [...v])));
  subs.add(handle.hasMore$.subscribe(v => (hasMore = v)));
  return {
    snap: () => ({ state, results, hasMore }),
    async wait() {
      await vi.waitFor(() => expect(['success', 'empty', 'error']).toContain(state));
      return { state, results, hasMore };
    },
    stop() {
      subs.unsubscribe();
      handle.destroy();
    }
  };
};

describe('probe', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
    await disposeScopes();
  });

  it('CJK: mid-token recall depends on unrelated docs', async () => {
    // 场景 A：只有 token 中段文档存在 → 兜底路径找到它。
    const a = await mk(['全局搜索测试']);
    cleanups.push(() => a.cleanup());
    const ha = observe(a.rxdb.searchCollection('Article', '搜索'));
    const ra = await ha.wait();
    ha.stop();

    // case B: add an unrelated doc whose token STARTS with 搜索 -> FTS hits, fallback skipped
    const b = await mk(['全局搜索测试', '搜索引擎优化']);
    cleanups.push(() => b.cleanup());
    const hb = observe(b.rxdb.searchCollection('Article', '搜索'));
    const rb = await hb.wait();
    hb.stop();

    expect(ra.results.length).toBe(1);
    expect(rb.results.length).toBe(2); // will FAIL if short-circuit drops 全局搜索测试
  });

  it('loadMore re-fetches from offset 0 every page (quadratic)', async () => {
    const titles = Array.from({ length: 30 }, (_, i) => `alpha doc number ${i}`);
    const h = await mk(titles);
    cleanups.push(() => h.cleanup());
    const raw = h.adapter as unknown as { rawQuery: (s: string, p?: unknown[]) => Promise<unknown> };
    const orig = raw.rawQuery.bind(raw);
    const limits: Array<{ limit: unknown; offset: unknown }> = [];
    (raw as { rawQuery: unknown }).rawQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('MATCH') && params) limits.push({ limit: params[2], offset: params[3] });
      return orig(sql, params);
    };
    const handle = h.rxdb.search('alpha', { pageSize: 2 });
    const o = observe(handle);
    await o.wait();
    for (let i = 0; i < 5; i++) {
      limits.length = 0;
      await handle.loadMore();
      await vi.waitFor(() => expect(o.snap().state).toBe('success'));
    }
    o.stop();
  });

  it('expands the result pool instead of declaring hasMore false at the tenth page', async () => {
    const titles = Array.from({ length: 25 }, (_, i) => `alpha boundary document ${i}`);
    const h = await mk(titles);
    cleanups.push(() => h.cleanup());
    const handle = h.rxdb.search('alpha', { pageSize: 2 });
    const observer = observe(handle);
    await observer.wait();

    for (let page = 1; page <= 12; page += 1) {
      await handle.loadMore();
      await vi.waitFor(() => expect(observer.snap().state).toBe('success'));
    }

    expect(observer.snap().results).toHaveLength(25);
    expect(new Set(observer.snap().results.map(result => result.id)).size).toBe(25);
    expect(observer.snap().hasMore).toBe(false);
    observer.stop();
  });
});
