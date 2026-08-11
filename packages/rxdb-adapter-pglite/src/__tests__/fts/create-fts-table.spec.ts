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
