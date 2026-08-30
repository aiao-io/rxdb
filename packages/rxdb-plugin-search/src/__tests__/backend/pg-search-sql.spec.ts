import { describe, expect, it } from 'vitest';

import {
  assertPgRegconfig,
  buildPgBackfillSql,
  buildPgFieldContainsSql,
  buildPgFieldSearchSql,
  buildPgHeadlineOptions,
  buildPgPendingBackfillProbeSql,
  buildPgSourceRowCountSql,
  PG_BACKFILL_BATCH_SIZE
} from '../../backend/pg/pg-search-sql.js';
import { SearchExecutionError } from '../../types.js';

const BASE = { table: 'docs', primaryKey: 'id', regconfig: 'simple' } as const;

describe('buildPgFieldSearchSql', () => {
  const sql = buildPgFieldSearchSql({ ...BASE, field: 'body', fieldIsArray: false });

  it('产出与 FTS5 后端完全相同的 5 个结果列', () => {
    for (const column of ['AS id', 'AS rank', 'AS prefix_penalty', 'AS matched_field', 'AS snippet']) {
      expect(sql, column).toContain(column);
    }
  });

  it('rank 取 ts_rank 的相反数，保持「值越小越相关」与 bm25 一致', () => {
    expect(sql).toContain('-ts_rank(');
    expect(sql).not.toMatch(/[^-]ts_rank\(/);
  });

  it('走 GIN 索引列 _fts，再用逐字段 tsvector 收窄以得到正确的 matched_field', () => {
    expect(sql).toContain('src."_fts" @@ q');
    expect(sql).toContain(`to_tsvector('simple', COALESCE(src."body", '')) @@ q`);
  });

  it('使用 $N 占位符，且 tsquery / headline 选项 / 分页全部参数化', () => {
    expect(sql).toContain('$1::text AS matched_field');
    expect(sql).toContain(`to_tsquery('simple', $2) q`);
    expect(sql).toContain('$3::text');
    expect(sql).toContain('LIMIT $4::int OFFSET $5::int');
    expect(sql).not.toContain('?');
  });

  it('数组字段展开为空格分隔文本（text[] 默认形态）', () => {
    const arraySql = buildPgFieldSearchSql({ ...BASE, field: 'tags', fieldIsArray: true });
    expect(arraySql).toContain(`COALESCE(array_to_string(src."tags", ' '), '')`);
  });

  it('jsonb 数组字段走 jsonb_array_elements_text', () => {
    const jsonbSql = buildPgFieldSearchSql({ ...BASE, field: 'tags', fieldIsArray: true, arrayKind: 'jsonb' });
    expect(jsonbSql).toContain('jsonb_array_elements_text(src."tags")');
  });

  it('sqlTable 覆盖物理表名', () => {
    expect(buildPgFieldSearchSql({ ...BASE, sqlTable: 'ns_docs', field: 'body' })).toContain('FROM "ns_docs" src');
  });
});

describe('buildPgFieldContainsSql', () => {
  const sql = buildPgFieldContainsSql({ ...BASE, field: 'body', tokenCount: 2 });

  it('rank 基数与 prefix_penalty 与 FTS5 fallback 对齐，整体劣后于索引命中', () => {
    expect(sql).toContain('1000000 +');
    expect(sql).toContain('2 AS prefix_penalty');
  });

  it('用 strpos 而不是 SQLite 的 instr', () => {
    expect(sql).toContain('strpos(');
    expect(sql).not.toContain('instr(');
  });

  it('用 greatest 而不是 max —— PG 的 max 是聚合函数，在行表达式里会直接报错', () => {
    expect(sql).toContain('greatest(1,');
    expect(sql).not.toMatch(/\bmax\(1,/);
  });

  it('token 参数从 $2 开始，snippetLength / limit / offset 依次排在其后', () => {
    expect(sql).toContain('lower($2)');
    expect(sql).toContain('lower($3)');
    expect(sql).toContain('$4::int'); // snippetLength
    expect(sql).toContain('LIMIT $5::int OFFSET $6::int');
  });
});

describe('buildPgSourceRowCountSql', () => {
  it('产出带引号的计数语句', () => {
    expect(buildPgSourceRowCountSql('docs')).toBe('SELECT count(*) AS count FROM "docs"');
  });
});

describe('buildPgBackfillSql', () => {
  it('用「空更新」触发已装载的 trigger 重算 _fts，避免与 trigger 表达式产生漂移', () => {
    const sql = buildPgBackfillSql({ table: 'docs', primaryKey: 'id', batchSize: PG_BACKFILL_BATCH_SIZE });
    expect(sql).toContain('UPDATE "docs" SET "id" = "id"');
    expect(sql).toContain('WHERE "_fts" IS NULL');
    expect(sql).toContain(`LIMIT ${PG_BACKFILL_BATCH_SIZE}`);
    expect(sql).not.toContain('to_tsvector');
  });

  it('批大小必须为正整数（直接内联进 SQL，不能接受任意输入）', () => {
    for (const batchSize of [0, -1, 1.5, Number.NaN]) {
      expect(() => buildPgBackfillSql({ table: 'docs', primaryKey: 'id', batchSize }), String(batchSize)).toThrow(
        SearchExecutionError
      );
    }
  });
});

describe('buildPgPendingBackfillProbeSql', () => {
  it('探测是否仍有未回填的行', () => {
    expect(buildPgPendingBackfillProbeSql('docs')).toBe('SELECT count(*) AS count FROM "docs" WHERE "_fts" IS NULL');
  });
});

describe('buildPgHeadlineOptions', () => {
  it('把命中标记与片段预算编码为可参数化的选项串', () => {
    const options = buildPgHeadlineOptions(120);
    expect(options).toContain('StartSel="﷐"');
    expect(options).toContain('StopSel="﷑"');
    expect(options).toContain('MaxFragments=1');
    expect(options).toMatch(/MaxWords=\d+/);
    expect(options).toMatch(/MinWords=\d+/);
  });

  it('MinWords 始终小于 MaxWords（否则 ts_headline 直接报错）', () => {
    for (const length of [1, 10, 120, 4096]) {
      const options = buildPgHeadlineOptions(length);
      const max = Number(/MaxWords=(\d+)/.exec(options)?.[1]);
      const min = Number(/MinWords=(\d+)/.exec(options)?.[1]);
      expect(min, `snippetLength=${length}`).toBeLessThan(max);
      expect(min).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('assertPgRegconfig', () => {
  it('放行合法的文本搜索配置名', () => {
    for (const value of ['simple', 'english', 'pg_catalog.english', 'my_cfg$1']) {
      expect(assertPgRegconfig(value), value).toBe(value);
    }
  });

  it('对任何可能闭合字面量的输入 fail-fast，而不是转义后放行', () => {
    for (const value of [`simple'; DROP TABLE docs; --`, `'`, '', 'a b', '1abc', 'a.b.c']) {
      expect(() => assertPgRegconfig(value), JSON.stringify(value)).toThrow(SearchExecutionError);
    }
  });
});
