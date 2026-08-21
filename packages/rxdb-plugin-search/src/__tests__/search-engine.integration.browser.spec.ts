import { RxDB, SyncType } from '@aiao/rxdb';
import { quote_sql_identifier } from '@aiao/rxdb-adapter-sqlite-core';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { compile } from '../core/query-compiler.js';
import { buildFieldMatchExpression } from '../core/search-engine.js';
import { RxDBPluginSearch, rxDBPluginSearch } from '../plugin.js';
import type { SearchHandle, SearchResult, SearchState } from '../types.js';
import { Article } from './fixtures/article.entity.js';
import { Comment } from './fixtures/comment.entity.js';
import { disposeScopes, installScoped } from './scoped-install.js';

interface Harness {
  readonly rxdb: RxDB;
  readonly adapter: RxDBAdapterSqlite;
  readonly plugin: RxDBPluginSearch;
  /** 清空已记录的 SQL，用于把断言限定在下一次查询上 */
  resetSql(): void;
  /** 是否执行过 contains 兜底（instr 全表扫描）——FTS 命中时不应出现 */
  ranContainsFallback(): boolean;
  /** 自上次 resetSql 以来执行的 SQL 条数 */
  executedSqlCount(): number;
  cleanup(): Promise<void>;
}

interface HandleObserver {
  snapshot(): {
    state: SearchState;
    results: SearchResult[];
    hasMore: boolean;
  };
  waitForTerminal(): Promise<{
    state: SearchState;
    results: SearchResult[];
    hasMore: boolean;
  }>;
  destroy(): void;
}

const createHarness = async (): Promise<Harness> => {
  const rxdb = new RxDB({
    dbName: `search-query-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entities: [Article, Comment],
    sync: {
      local: { adapter: 'sqlite-wasm' },
      type: SyncType.None
    }
  });

  rxdb.adapter('sqlite-wasm', db => new RxDBAdapterSqlite(db, { vfs: 'memory', batchTimeout: 1 }));
  rxdb.init();
  const adapter = (await rxdb.connect('sqlite-wasm')) as RxDBAdapterSqlite;

  const articleRepo = rxdb.entityManager.getRepository(Article);
  const commentRepo = rxdb.entityManager.getRepository(Comment);

  await articleRepo.create(
    rxdb.entityManager.instantiate(Article, {
      title: 'rxdb local-first guide',
      body: 'Long form workflows for rxdb local-first search integration coverage.',
      category: 'tech' as const,
      tags: ['rxdb', 'guide'],
      authorId: 'author-1',
      viewCount: 1
    })
  );
  await articleRepo.create(
    rxdb.entityManager.instantiate(Article, {
      title: 'rxdb adapters handbook',
      body: 'Focuses on adapter internals without the local first phrase.',
      category: 'tech' as const,
      tags: ['adapters', 'sqlite'],
      authorId: 'author-2',
      viewCount: 2
    })
  );
  await articleRepo.create(
    rxdb.entityManager.instantiate(Article, {
      // 真实中文形态：不含人工空格。此前 fixture 写成「数据库 搜索 指南」用空格
      // 人工分了词，恰好掩盖了 unicode61 把整段中文切成单 token 的问题。
      title: '数据库搜索指南',
      body: '中文全文搜索引擎设计示例，适合测试中缀命中。',
      category: 'tech' as const,
      tags: ['中文', '搜索'],
      authorId: 'author-3',
      viewCount: 3
    })
  );
  await articleRepo.create(
    rxdb.entityManager.instantiate(Article, {
      // SQLC-013：中英/数字紧邻且不带空格。unicode61 不在脚本边界切词，
      // 索引侧不补空格时整串是一个 token，查询侧却分段编译 → FTS 零召回。
      title: 'rxdb中文混排v2',
      body: '混排场景：rxdb搜索与sqlite全文检索，第3章节。',
      category: 'tech' as const,
      tags: ['混排', 'mixed'],
      authorId: 'author-5',
      viewCount: 5
    })
  );
  await articleRepo.create(
    rxdb.entityManager.instantiate(Article, {
      title: 'including semantics note',
      body: 'Includes a direct infix fallback regression fixture.',
      category: 'tech' as const,
      tags: ['including', 'fallback'],
      authorId: 'author-4',
      viewCount: 4
    })
  );

  await commentRepo.create(
    rxdb.entityManager.instantiate(Comment, {
      articleId: 'article-a',
      content: 'rxdb local-first comments are useful for ranking checks.',
      authorName: 'Alice'
    })
  );
  await commentRepo.create(
    rxdb.entityManager.instantiate(Comment, {
      articleId: 'article-b',
      content: 'prefix searches should still find local-first phrases.',
      authorName: 'Bob'
    })
  );

  // 必须在 install() 之前包住：plugin 会把 adapter.rawQuery bind 走，事后 spy 拦不到
  const executedSql: string[] = [];
  const originalRawQuery = adapter.rawQuery!.bind(adapter);
  adapter.rawQuery = (sql: string, params?: unknown[]) => {
    executedSql.push(sql);
    return originalRawQuery(sql, params);
  };

  const plugin = rxDBPluginSearch(rxdb, { debounce: 0, pageSize: 10, snippetLength: 24 }) as RxDBPluginSearch;
  const { scope } = installScoped(plugin);
  await plugin.ready;

  return {
    rxdb,
    adapter,
    plugin,
    resetSql: () => {
      executedSql.length = 0;
    },
    /** 是否执行过 contains 兜底（instr 全表扫描）——FTS 命中时不应出现 */
    ranContainsFallback: () => executedSql.some(sql => sql.includes('instr(')),
    executedSqlCount: () => executedSql.length,
    async cleanup() {
      // `lifecycle: 'scoped'` 之后释放作用域就是全部拆卸，没有第二步 `destroy()`
      await scope.dispose();
      await rxdb.disconnectAll();
    }
  };
};

const observeHandle = (handle: SearchHandle): HandleObserver => {
  let state: SearchState = 'idle';
  let results: SearchResult[] = [];
  let hasMore = false;
  let latestError: unknown;
  const subs = new Subscription();

  subs.add(
    handle.state$.subscribe(value => {
      state = value;
    })
  );
  subs.add(
    handle.results$.subscribe(value => {
      results = [...value];
    })
  );
  subs.add(
    handle.hasMore$.subscribe(value => {
      hasMore = value;
    })
  );
  subs.add(
    handle.error$.subscribe(value => {
      latestError = value;
    })
  );

  return {
    snapshot: () => ({ state, results, hasMore }),
    async waitForTerminal() {
      await vi.waitFor(() => {
        if (state === 'error') {
          throw latestError instanceof Error ? latestError : new Error('search entered error state');
        }
        expect(['success', 'empty']).toContain(state);
      });
      return { state, results, hasMore };
    },
    destroy() {
      subs.unsubscribe();
      handle.destroy();
    }
  };
};

describe('search engine browser integration', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
    await disposeScopes();
  });

  it('quotes hostile column names in real FTS5 column filters', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const table = '_fts_column_filter_probe';
    const fields = ['full-text', 'display name', 'and', 'quote"name'] as const;
    const quotedTable = quote_sql_identifier(table);
    const quotedFields = fields.map(quote_sql_identifier);
    await harness.adapter.rawQuery!(`CREATE VIRTUAL TABLE ${quotedTable} USING fts5(${quotedFields.join(', ')})`);

    for (const [index, field] of fields.entries()) {
      const values = fields.map(candidate => (candidate === field ? `token${index}` : ''));
      const placeholders = values.map(() => '?').join(', ');
      await harness.adapter.rawQuery!(
        `INSERT INTO ${quotedTable}(${quotedFields.join(', ')}) VALUES (${placeholders})`,
        values
      );
    }

    for (const [index, field] of fields.entries()) {
      const compiled = compile(`token${index}`);
      expect(compiled).not.toBeNull();
      const result = await harness.adapter.rawQuery!(
        `SELECT rowid FROM ${quotedTable} WHERE ${quotedTable} MATCH ? ORDER BY rowid`,
        [buildFieldMatchExpression(field, compiled!)]
      );
      expect(result.rows).toEqual([[index + 1]]);
    }
  });

  it('supports English and Chinese single-character searches against real sqlite-wasm FTS', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const english = observeHandle(harness.rxdb.searchCollection('Article', 'r'));
    const englishTerminal = await english.waitForTerminal();
    expect(englishTerminal.state).toBe('success');
    expect(englishTerminal.results.some(result => result.snippet.includes('rxdb'))).toBe(true);
    english.destroy();

    const chinese = observeHandle(harness.rxdb.searchCollection('Article', '数'));
    const chineseTerminal = await chinese.waitForTerminal();
    expect(chineseTerminal.state).toBe('success');
    expect(chineseTerminal.results.some(result => result.snippet.includes('数据库'))).toBe(true);
    chinese.destroy();
  });

  it('treats FTS5 reserved punctuation as tokenizer boundaries', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const search = async (query: string): Promise<string[]> => {
      harness.resetSql();
      const observer = observeHandle(harness.rxdb.searchCollection('Article', query));
      const terminal = await observer.waitForTerminal();
      expect(harness.ranContainsFallback()).toBe(false);
      observer.destroy();
      return terminal.results.map(result => result.id).sort();
    };

    expect(await search('rxdb:local')).toEqual(await search('rxdb local'));
  });

  // unicode61 把一整段连续中文切成单个 token，中缀查询在 FTS 层 100% 零召回，
  // 并整体退化为 instr() 无索引全表扫描——在中文场景下这条 fallback 是常态而非兜底。
  // 索引侧与查询侧同时做 bigram 切分后，2 字词与真中缀都能走 FTS 命中。
  it('matches CJK infix terms against unspaced Chinese text', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    // '搜索' 位于 '数据库搜索指南' 正中间，且不是任何字段的前缀
    const infix = observeHandle(harness.rxdb.searchCollection('Article', '搜索'));
    const infixTerminal = await infix.waitForTerminal();
    expect(infixTerminal.state).toBe('success');
    expect(infixTerminal.results.some(result => result.snippet.includes('数据库搜索指南'))).toBe(true);
    infix.destroy();

    // 多字中缀：'引擎设计' 落在 body 中部。
    // 光断言「有结果」不够——FTS 零命中会掉进 instr() 全表扫描，照样能返回结果，
    // 从而掩盖 FTS 根本没工作。必须断言没走 contains 兜底。
    harness.resetSql();
    const longer = observeHandle(harness.rxdb.searchCollection('Article', '引擎设计'));
    const longerTerminal = await longer.waitForTerminal();
    expect(longerTerminal.state).toBe('success');
    expect(longerTerminal.results.length).toBeGreaterThan(0);
    expect(harness.ranContainsFallback()).toBe(false);
    longer.destroy();

    // 不连续的词不应命中，避免 bigram 退化成「任意字符都能匹配」
    const disjoint = observeHandle(harness.rxdb.searchCollection('Article', '数据库设计'));
    const disjointTerminal = await disjoint.waitForTerminal();
    expect(disjointTerminal.results).toHaveLength(0);
    disjoint.destroy();
  });

  // SQLC-013：索引侧只在 CJK 段内部切 bigram，段与相邻拉丁/数字之间不插空格，
  // `rxdb搜索` 在 unicode61 眼里是一个 token，而查询侧编成 `rxdb AND 搜索` —— 两侧 token 失配。
  // 补边界空格前，下面每一条都会掉进 instr() 全表扫描（甚至直接零结果）。
  it('matches mixed CJK/latin/digit text without manual spaces', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    // 每条查询都只有 'rxdb中文混排v2' 这一篇能命中，因此断言恰好 1 条；
    // 同时断言没走 instr() 兜底 —— 否则「有结果」只能证明全表扫描能捞到，证明不了 FTS 命中。
    const expectFtsOnlyHit = async (keyword: string): Promise<void> => {
      harness.resetSql();
      const observer = observeHandle(harness.rxdb.searchCollection('Article', keyword));
      const terminal = await observer.waitForTerminal();
      expect(terminal.state).toBe('success');
      expect(terminal.results).toHaveLength(1);
      expect(harness.ranContainsFallback()).toBe(false);
      observer.destroy();
    };

    // 中英紧邻：'rxdb搜索' 编译成 rxdb 前缀 AND '搜索' phrase，body 里两段紧贴
    await expectFtsOnlyHit('rxdb搜索');
    // CJK 紧跟在拉丁词之后：'中文混排' 的第一个字紧贴 title 里的 'rxdb'
    await expectFtsOnlyHit('中文混排');
    // 数字夹在两段 CJK 中间：'第3章'
    await expectFtsOnlyHit('第3章');
    // 全角标点边界：'全文检索' 紧跟 'sqlite' 之后、'，' 之前
    await expectFtsOnlyHit('全文检索');
  });

  it('enforces multi-key AND semantics, prefix matching, and paginated loadMore', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const handle = harness.rxdb.search('rxdb local-first', { pageSize: 1 });
    const observer = observeHandle(handle);
    const firstPage = await observer.waitForTerminal();
    expect(firstPage.state).toBe('success');
    expect(firstPage.results).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.results[0].snippet).not.toContain('<mark>');
    expect(firstPage.results[0].snippet).toContain('rxdb');

    await handle.loadMore();
    await vi.waitFor(() => {
      const snapshot = observer.snapshot();
      expect(snapshot.state).toBe('success');
      expect(snapshot.results).toHaveLength(2);
      expect(snapshot.hasMore).toBe(false);
    });
    observer.destroy();

    const prefix = observeHandle(harness.rxdb.search('loca', { pageSize: 5 }));
    const prefixTerminal = await prefix.waitForTerminal();
    expect(prefixTerminal.state).toBe('success');
    expect(prefixTerminal.results.length).toBeGreaterThan(0);
    prefix.destroy();
  });

  it('paginates a single collection on a single-field hit: hasMore stays true until the last page', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    // 'local' 仅命中 Comment.content（两条都含），authorName 不含 —— 单字段命中。
    // engine 是「按字段各取 poolCap 条再合并」，单字段命中时整页全靠该字段的 LIMIT。
    // pageSize=1 时第一页必须 hasMore=true，否则单 collection 分页第二条永远拉不出来。
    const handle = harness.rxdb.searchCollection('Comment', 'local', { pageSize: 1 });
    const observer = observeHandle(handle);
    const firstPage = await observer.waitForTerminal();
    expect(firstPage.state).toBe('success');
    expect(firstPage.results).toHaveLength(1);
    expect(firstPage.hasMore).toBe(true);

    await handle.loadMore();
    await vi.waitFor(() => {
      const snapshot = observer.snapshot();
      expect(snapshot.state).toBe('success');
      expect(snapshot.results).toHaveLength(2);
      expect(snapshot.hasMore).toBe(false);
    });
    expect(new Set(observer.snapshot().results.map(r => r.id)).size).toBe(2);
    observer.destroy();
  });

  // offset 恒为 0 时，翻到第 N 页要重取 (N+1)×pageSize+1 行再全量合并排序，只为拿其中 pageSize 条，
  // 累计传输量 O(N²·pageSize)。惰性有界池：page 0 不变（不翻页的用户零额外成本），
  // 首次 loadMore 一次性抓满池并缓存，后续页从缓存切片。
  it('does not re-issue SQL for pages served from the cached pool', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    // 基础 fixture 只有 2 条匹配，翻到第 2 页 hasMore 就是 false、loadMore 直接早退，
    // 根本触不到缓存。补足数据才能真正走到「第 3 页从池里切片」。
    const commentRepo = harness.rxdb.entityManager.getRepository(Comment);
    for (let i = 0; i < 5; i += 1) {
      await commentRepo.create(
        harness.rxdb.entityManager.instantiate(Comment, {
          articleId: 'article-a',
          content: `extra local-first comment ${i}`,
          authorName: `Author ${i}`
        })
      );
    }

    const handle = harness.rxdb.searchCollection('Comment', 'local', { pageSize: 1 });
    const observer = observeHandle(handle);
    const firstPage = await observer.waitForTerminal();
    expect(firstPage.state).toBe('success');
    expect(firstPage.hasMore).toBe(true);

    // 首次 loadMore 会抓池——这一次落 SQL 是预期的
    await handle.loadMore();
    await vi.waitFor(() => {
      expect(observer.snapshot().results).toHaveLength(2);
    });

    // 池已缓存，后续两页必须全部从缓存切片，一条 SQL 都不该再落
    harness.resetSql();
    await handle.loadMore();
    await vi.waitFor(() => {
      expect(observer.snapshot().results).toHaveLength(3);
    });
    await handle.loadMore();
    await vi.waitFor(() => {
      expect(observer.snapshot().results).toHaveLength(4);
    });
    expect(harness.executedSqlCount()).toBe(0);
    observer.destroy();
  });

  it('returns empty state for misses and keeps snippets as original plain text', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const hit = observeHandle(harness.rxdb.searchCollection('Article', 'guide', { snippetLength: 18 }));
    const hitTerminal = await hit.waitForTerminal();
    expect(hitTerminal.state).toBe('success');
    expect(hitTerminal.results[0].snippet).toContain('guide');
    expect(hitTerminal.results[0].snippet.length).toBeLessThanOrEqual(18);
    expect(hitTerminal.results[0].snippet).toBe(hitTerminal.results[0].snippet.trim());
    expect(hitTerminal.results[0].snippet).not.toContain('<');
    hit.destroy();

    const miss = observeHandle(harness.rxdb.search('no-such-token'));
    const missTerminal = await miss.waitForTerminal();
    expect(missTerminal.state).toBe('empty');
    expect(missTerminal.results).toEqual([]);
    expect(missTerminal.hasMore).toBe(false);
    miss.destroy();
  });

  it('returns bounded plain-text snippets around middle matches for long scalar and array fields', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());
    const articleRepo = harness.rxdb.entityManager.getRepository(Article);
    const longPrefix = 'prefix '.repeat(80);
    const longSuffix = ' suffix'.repeat(80);
    await articleRepo.create(
      harness.rxdb.entityManager.instantiate(Article, {
        title: 'middle snippet fixture',
        body: `${longPrefix}needlebody${longSuffix}`,
        category: 'tech' as const,
        tags: [`${longPrefix}needletag${longSuffix}`],
        authorId: 'author-snippet',
        viewCount: 99
      })
    );

    const body = observeHandle(harness.rxdb.searchCollection('Article', 'needlebody', { snippetLength: 24 }));
    const bodyTerminal = await body.waitForTerminal();
    expect(bodyTerminal.state).toBe('success');
    expect(bodyTerminal.results[0].snippet).toContain('needlebody');
    expect(bodyTerminal.results[0].snippet.length).toBeLessThanOrEqual(24);
    expect(bodyTerminal.results[0].snippet).not.toContain('<');
    body.destroy();

    const tags = observeHandle(harness.rxdb.searchCollection('Article', 'needletag', { snippetLength: 24 }));
    const tagsTerminal = await tags.waitForTerminal();
    expect(tagsTerminal.state).toBe('success');
    expect(tagsTerminal.results[0].snippet).toContain('needletag');
    expect(tagsTerminal.results[0].snippet.length).toBeLessThanOrEqual(24);
    expect(tagsTerminal.results[0].snippet).not.toContain('<');
    tags.destroy();
  });

  it('falls back to infix contains matching only when the whole FTS pass misses (loose global-miss fallback)', async () => {
    const harness = await createHarness();
    cleanups.push(() => harness.cleanup());

    const infix = observeHandle(harness.rxdb.searchCollection('Article', 'ncluding'));
    const infixTerminal = await infix.waitForTerminal();
    expect(infixTerminal.state).toBe('success');
    expect(infixTerminal.results.some(result => result.snippet.includes('including'))).toBe(true);
    infix.destroy();
  });
});
