import { quote_sql_identifier, SQLITE_MAX_BIND_VARIABLES } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it, vi } from 'vitest';

import { compile } from '../core/query-compiler.js';
import {
  buildFieldContainsSql,
  buildFieldMatchExpression,
  buildFieldSearchSql,
  createSearchEngine,
  type FtsExecutor
} from '../core/search-engine.js';
import { SearchExecutionError } from '../types.js';

describe('search-engine — buildFieldMatchExpression', () => {
  it('prefixes compiled match with column filter', () => {
    const compiled = compile('foo bar');
    expect(compiled).not.toBeNull();
    expect(buildFieldMatchExpression('title', compiled!)).toBe('"title" : (("foo" OR "foo"*) AND ("bar" OR "bar"*))');
    expect(buildFieldMatchExpression('quote"name', compiled!)).toBe(
      '"quote""name" : (("foo" OR "foo"*) AND ("bar" OR "bar"*))'
    );
  });
});

describe('search-engine — buildFieldSearchSql', () => {
  it('joins original table via content_rowid and orders by rank', () => {
    const sql = buildFieldSearchSql({
      table: 'article',
      sqlTable: 'public$article',
      primaryKey: 'id',
      field: 'title',
      fieldIndex: 0
    });
    expect(sql).toContain('FROM "_fts_public$article"');
    expect(sql).toContain('JOIN "public$article" src ON src.rowid = "_fts_public$article".rowid');
    expect(sql).toContain('bm25("_fts_public$article") AS rank');
    expect(sql).toContain('snippet("_fts_public$article", 0, char(64976), char(64977), \'…\', ?) AS snippet');
    expect(sql).not.toContain('COALESCE(src."title", \'\') AS snippet');
    expect(sql).toContain('"_fts_public$article" MATCH ?');
    expect(sql).toContain('ORDER BY rank');
    expect(sql).toContain('LIMIT ? OFFSET ?');
    // matched_field 作为参数绑定（不存在字符串拼接的字面量）。
    expect(sql).toContain('? AS matched_field');
    expect(sql).not.toContain("'title' AS matched_field");
  });

  it('builds a contains fallback query against the source table', () => {
    const sql = buildFieldContainsSql({
      table: 'article',
      sqlTable: 'public$article',
      primaryKey: 'id',
      field: 'body',
      tokenCount: 2
    });

    expect(sql).toContain('FROM "public$article" src');
    expect(sql).toContain('1000000 + instr(lower(');
    expect(sql).toContain('instr(lower(');
    // tokens 移到 ?2..?(N+1)，因为 ?1 现在绑定的是字段名。
    expect(sql).toContain('lower(?2)');
    expect(sql).toContain('lower(?3)');
    expect(sql).toContain('?1 AS matched_field');
    expect(sql).not.toContain("'body' AS matched_field");
    expect(sql).toContain('2 AS prefix_penalty');
    expect(sql).toContain('substr(COALESCE(src."body", \'\'), max(1, instr(');
    expect(sql).toContain('LIMIT ?5 OFFSET ?6');
  });
});

describe('search-engine — createSearchEngine', () => {
  it('returns [] for null CompiledQuery without calling executor', async () => {
    const executor: FtsExecutor = vi.fn();
    const engine = createSearchEngine(executor);
    const res = await engine.search({
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body'],
      compiled: null,
      pageSize: 20,
      offset: 0
    });
    expect(res).toEqual([]);
    expect(executor).not.toHaveBeenCalled();
  });

  it('rejects compiled tokens that exceed the contains bind budget before issuing SQL', async () => {
    const executor: FtsExecutor = vi.fn();
    const engine = createSearchEngine(executor);
    const fixedContainsBindings = 4;
    const tokenCount = SQLITE_MAX_BIND_VARIABLES - fixedContainsBindings + 1;

    await expect(
      engine.search({
        table: 'article',
        entity: 'Article',
        primaryKey: 'id',
        fields: ['title'],
        compiled: {
          match: '("a" OR "a"*)',
          tokens: Array.from({ length: tokenCount }, () => 'a')
        },
        pageSize: 20,
        offset: 0
      })
    ).rejects.toThrow(SearchExecutionError);
    expect(executor).not.toHaveBeenCalled();
  });

  it('issues one query per field and merges by id keeping best rank', async () => {
    const executor: FtsExecutor = vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      // params = [field, snippetLength, matchExpr, limit, offset]
      const matchExpr = String(params[2]);
      if (matchExpr.startsWith('"title" :')) {
        return [
          { id: '1', rank: -5, prefix_penalty: 0, matched_field: 'title', snippet: 'Hello foo' },
          { id: '2', rank: -2, prefix_penalty: 0, matched_field: 'title', snippet: 'Bar foo' }
        ];
      }
      if (matchExpr.startsWith('"body" :')) {
        return [
          // id 同为 1 但 rank 更差，应丢弃。
          { id: '1', rank: -1, prefix_penalty: 0, matched_field: 'body', snippet: 'ignore' },
          { id: '3', rank: -3, prefix_penalty: 0, matched_field: 'body', snippet: 'Text foo' }
        ];
      }
      return [];
    });
    const engine = createSearchEngine(executor);
    const compiled = compile('foo');
    const res = await engine.search({
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body'],
      compiled: compiled!,
      pageSize: 10,
      offset: 0,
      snippetLength: 120
    });
    expect(executor).toHaveBeenCalledTimes(2);
    expect(res).toHaveLength(3);
    const byId = Object.fromEntries(res.map(r => [r.id, r]));
    // 保留 id=1 的 title 版本（rank -5 < -1）。
    expect(byId['1'].matchedField).toBe('title');
    expect(byId['1'].rank).toBe(-5);
    expect(byId['2'].entity).toBe('Article');
    expect(byId['3'].matchedField).toBe('body');
    // 按 rank 升序排序。
    expect(res.map(r => r.id)).toEqual(['1', '3', '2']);
    expect((executor as unknown as ReturnType<typeof vi.fn>).mock.calls.every(call => call[1][1] === 64)).toBe(true);
  });

  it('forwards limit+offset for pagination and applies snippetLength', async () => {
    const executor: FtsExecutor = vi.fn().mockResolvedValue([
      {
        id: '9',
        rank: -1,
        prefix_penalty: 0,
        matched_field: 'title',
        snippet: 'x'.repeat(500)
      }
    ]);
    const engine = createSearchEngine(executor);
    const compiled = compile('x');
    await engine.search({
      table: 'post',
      entity: 'Post',
      primaryKey: 'pid',
      fields: ['title'],
      compiled: compiled!,
      pageSize: 20,
      offset: 40,
      snippetLength: 30
    });
    // limit 必须是 offset + pageSize，以便聚合器获得足够的各字段候选项。
    const call = (executor as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const params = call[1] as unknown[];
    // params = [field, snippetLength, matchExpr, limit, offset]
    expect(params[0]).toBe('title'); // 字段作为参数绑定，而不是插入字符串
    expect(params[1]).toBe(30);
    expect(params[2]).toBe(buildFieldMatchExpression('title', compiled!));
    expect(params[3]).toBe(60); // limit = 40 + 20
    expect(params[4]).toBe(0); // offset = 0（在内存中合并，SQL offset 保持为 0）
  });

  it('source rows 超过 contains 预算时跳过无索引 fallback', async () => {
    const executor: FtsExecutor = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM "_fts_article"')) return [];
      if (sql.includes('count(*)')) return [{ count: 5001 }];
      throw new Error('contains fallback must be skipped');
    });
    const engine = createSearchEngine(executor);
    const compiled = compile('typo');

    await expect(
      engine.search({
        table: 'article',
        sqlTable: 'article',
        entity: 'Article',
        primaryKey: 'id',
        fields: ['title'],
        compiled: compiled!,
        pageSize: 10,
        offset: 0
      })
    ).resolves.toEqual([]);
    expect(executor).toHaveBeenCalledWith(`SELECT count(*) AS count FROM ${quote_sql_identifier('article')}`, []);
  });

  it('breaks rank ties by wired-through _prefixPenalty when merging fields', async () => {
    const executor: FtsExecutor = vi.fn().mockImplementation(async (_sql: string, params: unknown[]) => {
      const matchExpr = String(params[2]);
      // 同 rank、不同 prefix_penalty：FTS 命中（0）应排在 contains 兜底（2）之前
      if (matchExpr.startsWith('"title" :')) {
        return [{ id: 'contains', rank: -1, prefix_penalty: 2, matched_field: 'title', snippet: 'p' }];
      }
      if (matchExpr.startsWith('"body" :')) {
        return [{ id: 'exact', rank: -1, prefix_penalty: 0, matched_field: 'body', snippet: 'e' }];
      }
      return [];
    });
    const engine = createSearchEngine(executor);
    const compiled = compile('foo');
    const res = await engine.search({
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body'],
      compiled: compiled!,
      pageSize: 10,
      offset: 0
    });
    expect(res.map(r => r.id)).toEqual(['exact', 'contains']);
  });

  it('wraps executor errors in SearchExecutionError', async () => {
    const executor: FtsExecutor = vi.fn().mockRejectedValue(new Error('boom'));
    const engine = createSearchEngine(executor);
    const compiled = compile('foo');
    await expect(
      engine.search({
        table: 'article',
        entity: 'Article',
        primaryKey: 'id',
        fields: ['title'],
        compiled: compiled!,
        pageSize: 10,
        offset: 0
      })
    ).rejects.toMatchObject({ name: 'SearchExecutionError' });
  });

  it('falls back to infix contains search only when the whole FTS pass has zero hits (loose global-miss fallback, not full infix recall)', async () => {
    const executor: FtsExecutor = vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM "_fts_article"')) {
        return [];
      }

      if (sql.includes('count(*)')) return [{ count: 1 }];

      expect(sql).toContain('instr(lower(');
      // [field, ...tokens, snippetLength, limit, offset]
      expect(params).toEqual(['body', 'ncluding', 120, 10, 0]);

      return [
        {
          id: '2',
          rank: 1000004,
          prefix_penalty: 2,
          matched_field: 'body',
          snippet: 'We discuss sqlite in depth, including rxdb pitfalls.'
        }
      ];
    });

    const engine = createSearchEngine(executor);
    const compiled = compile('ncluding');
    const res = await engine.search({
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['body'],
      compiled: compiled!,
      pageSize: 10,
      offset: 0,
      snippetLength: 120
    });

    expect(executor).toHaveBeenCalledTimes(3);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      id: '2',
      rank: 1000004,
      matchedField: 'body',
      snippet: expect.stringContaining('including')
    });
  });

  it('skips contains fallback entirely when any field has an FTS hit (deliberate perf boundary)', async () => {
    const executor: FtsExecutor = vi.fn().mockImplementation(async (sql: string, params: unknown[]) => {
      // contains fallback 若被执行即违反语义边界
      expect(sql).not.toContain('instr(lower(');
      return String(params[2]).startsWith('"title" :') ?
          [{ id: '1', rank: -1.5, prefix_penalty: 0, matched_field: 'title', snippet: 'FTS hit on title' }]
        : [];
    });

    const engine = createSearchEngine(executor);
    const compiled = compile('foo');
    const res = await engine.search({
      table: 'article',
      entity: 'Article',
      primaryKey: 'id',
      fields: ['title', 'body'],
      compiled: compiled!,
      pageSize: 10,
      offset: 0,
      snippetLength: 120
    });

    // 只跑了两个字段的 FTS 查询，没有第三次 contains 调用
    expect(executor).toHaveBeenCalledTimes(2);
    expect(res.map(r => r.id)).toEqual(['1']);
  });

  it('does not interpolate field names into SQL string literals (defensive)', () => {
    const fts = buildFieldSearchSql({
      table: 't',
      primaryKey: 'id',
      field: "evil') --",
      fieldIndex: 0
    });
    // 恶意字段名不应出现在 SQL 字符串字面量中。
    expect(fts).not.toContain("'evil') --'");
    expect(fts).toContain('? AS matched_field');

    const contains = buildFieldContainsSql({
      table: 't',
      primaryKey: 'id',
      field: "evil') --",
      tokenCount: 1
    });
    expect(contains).not.toContain("'evil') --'");
    expect(contains).toContain('?1 AS matched_field');
  });
});
