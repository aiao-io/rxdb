import { describe, expect, it } from 'vitest';

import { buildCreateFtsTableSql } from '../../fts/create-fts-table.js';

describe('buildCreateFtsTableSql', () => {
  it('throws when no fields are provided', () => {
    expect(() => buildCreateFtsTableSql('docs', [])).toThrow(/no searchable fields/);
  });

  it('emits ADD COLUMN tsvector and GIN index for a single text field', () => {
    const sql = buildCreateFtsTableSql('docs', [{ name: 'title', isArray: false }]);
    expect(sql).toContain('ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "_fts" tsvector');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "docs__fts_idx" ON "docs" USING GIN ("_fts")');
  });

  it('escapes table names that contain reserved words or double quotes', () => {
    const sql = buildCreateFtsTableSql('na"me', [{ name: 'title', isArray: false }]);
    expect(sql).toContain('"na""me"');
    expect(sql).toContain('"na""me__fts_idx"');
  });

  it('ignores regconfig at DDL stage (consumed by buildFtsTriggersSql instead)', () => {
    const sql = buildCreateFtsTableSql('docs', [{ name: 'body', isArray: false }]);
    expect(sql).toContain('ALTER TABLE');
    expect(sql).toContain('GIN ("_fts")');
    expect(sql).not.toContain('regconfig');
  });

  /**
   * 适配器把实体建成 `"<namespace>"."<table>"`（见 `getTableNameByMetadata`），
   * 所以 schema 非 public 时 DDL 必须限定 schema。不限定的话它落到 search_path 的
   * 首个 schema 上：轻则 42P01「表不存在」，重则给 public 里另一张同名表加了列。
   *
   * 索引名保持裸名：索引跟着表进同一个 schema，跨 schema 不可能重名。
   */
  it('schema 给定时限定表名，索引名仍是裸名', () => {
    const sql = buildCreateFtsTableSql('article', [{ name: 'title', isArray: false }], { schema: 'shop' });
    expect(sql).toContain('ALTER TABLE "shop"."article" ADD COLUMN IF NOT EXISTS "_fts" tsvector');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "article__fts_idx" ON "shop"."article" USING GIN ("_fts")');
  });

  it('separates ALTER and CREATE INDEX with statement separator', () => {
    const sql = buildCreateFtsTableSql('docs', [{ name: 'title', isArray: false }]);
    const stmts = sql
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    expect(stmts.length).toBeGreaterThanOrEqual(2);
    expect(stmts[0]).toMatch(/^ALTER TABLE/);
    expect(stmts[1]).toMatch(/^CREATE INDEX/);
  });
});
