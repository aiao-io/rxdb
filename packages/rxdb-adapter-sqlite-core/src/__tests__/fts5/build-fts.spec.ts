import { describe, expect, it } from 'vitest';

import {
  buildCreateFtsTableSql,
  buildFtsTriggersSql,
  FTS_BIGRAM_SQL_FUNCTION,
  type FtsField
} from '../../fts5/index.js';

const articleFields: FtsField[] = [
  { name: 'title', isArray: false },
  { name: 'body', isArray: false }
];

const articleWithTags: FtsField[] = [
  { name: 'title', isArray: false },
  { name: 'tags', isArray: true }
];

describe('buildCreateFtsTableSql', () => {
  it('rejects tables without searchable fields', () => {
    expect(() => buildCreateFtsTableSql('article', [])).toThrow(
      'buildCreateFtsTableSql: no searchable fields for table "article"'
    );
  });

  it('generates external-content FTS5 virtual table with unicode61 tokenizer for single field', () => {
    const sql = buildCreateFtsTableSql('article', [{ name: 'title', isArray: false }]);
    expect(sql).toContain('CREATE VIRTUAL TABLE IF NOT EXISTS "_fts_article"');
    expect(sql).toContain('USING fts5(');
    expect(sql).toContain('"title"');
    expect(sql).toContain("content='article'");
    expect(sql).toContain("content_rowid='rowid'");
    expect(sql).toContain("tokenize='unicode61 remove_diacritics 2'");
  });

  it('lists multiple fields in declaration order', () => {
    const sql = buildCreateFtsTableSql('article', articleFields);
    const titleIdx = sql.indexOf('title');
    const bodyIdx = sql.indexOf('body');
    expect(titleIdx).toBeGreaterThan(0);
    expect(bodyIdx).toBeGreaterThan(titleIdx);
  });

  it('always binds external-content FTS tables to SQLite rowid', () => {
    const sql = buildCreateFtsTableSql('comment', articleFields);
    expect(sql).toContain("content_rowid='rowid'");
  });

  it('is idempotent: includes IF NOT EXISTS', () => {
    const sql = buildCreateFtsTableSql('article', articleFields);
    expect(sql).toMatch(/CREATE VIRTUAL TABLE IF NOT EXISTS/);
  });
});

describe('buildFtsTriggersSql', () => {
  it('rejects tables without searchable fields', () => {
    expect(() => buildFtsTriggersSql('article', [])).toThrow(
      'buildFtsTriggersSql: no searchable fields for table "article"'
    );
  });

  it('generates _ai / _ad / _au triggers with IF NOT EXISTS', () => {
    const sql = buildFtsTriggersSql('article', articleFields);
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS "_fts_article_ai"');
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS "_fts_article_ad"');
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS "_fts_article_au"');
  });

  it('AFTER INSERT trigger inserts NEW values', () => {
    const sql = buildFtsTriggersSql('article', articleFields);
    expect(sql).toContain('AFTER INSERT ON "article"');
    expect(sql).toMatch(
      /INSERT INTO "_fts_article"\s*\(\s*rowid,\s*"title",\s*"body"\s*\)\s*VALUES\s*\(\s*NEW\.rowid,\s*NEW\."title",\s*NEW\."body"\s*\)/
    );
  });

  it('AFTER DELETE trigger uses delete command', () => {
    const sql = buildFtsTriggersSql('article', articleFields);
    expect(sql).toContain('AFTER DELETE ON "article"');
    expect(sql).toContain("'delete'");
    expect(sql).toMatch(/"_fts_article",\s*rowid,\s*"title",\s*"body"/);
  });

  it('AFTER UPDATE trigger emits delete then insert', () => {
    const sql = buildFtsTriggersSql('article', articleFields);
    expect(sql).toContain('AFTER UPDATE ON "article"');
    const deletePos = sql.lastIndexOf("'delete'");
    const auStart = sql.indexOf('CREATE TRIGGER IF NOT EXISTS "_fts_article_au"');
    expect(deletePos).toBeGreaterThan(auStart);
  });

  it('AFTER UPDATE trigger guards on field changes via NULL-safe IS NOT', () => {
    const sql = buildFtsTriggersSql('article', articleFields);
    // 仅 searchable 字段变化才同步，避免非 searchable 字段（如 viewCount）触发写放大
    expect(sql).toMatch(/AFTER UPDATE ON "article"\s+WHEN OLD\."title" IS NOT NEW\."title"/);
    expect(sql).toContain('OR OLD."body" IS NOT NEW."body"');
  });

  it('StringArrayProperty MUST use json_each + group_concat subquery, never NEW.<field> directly', () => {
    const sql = buildFtsTriggersSql('article', articleWithTags);
    // INSERT（ai）和 UPDATE（au）必须通过子查询处理 tags。
    expect(sql).toContain('(SELECT group_concat(value, char(10)) FROM json_each(NEW."tags"))');
    // 不得包含裸的 NEW.tags 直接值（只能出现在 json_each 内）。
    const bareNewTags = sql.match(/NEW\.tags(?!\))/g);
    expect(bareNewTags).toBeNull();
    // 删除触发器中的 OLD.tags 也使用子查询。
    expect(sql).toContain('(SELECT group_concat(value, char(10)) FROM json_each(OLD."tags"))');
  });

  it('StringArrayProperty NULL / empty array path: COALESCE to empty string', () => {
    const sql = buildFtsTriggersSql('article', articleWithTags);
    // NULL 或空数组 → 空字符串。空 json_each 上的 group_concat 返回 NULL → COALESCE。
    expect(sql).toMatch(
      /COALESCE\(\s*\(SELECT group_concat\(value, char\(10\)\) FROM json_each\(NEW\."tags"\)\),\s*''\s*\)/
    );
  });

  it('uses SQLite rowid in trigger body regardless of business primary key type', () => {
    const sql = buildFtsTriggersSql('comment', articleFields);
    expect(sql).toContain('NEW.rowid');
    expect(sql).toContain('OLD.rowid');
  });

  // SQLC-028：valueWrapper 原样拼进 CREATE TRIGGER 的 VALUES 里，
  // buildFtsTriggersSql 是 @public 导出，非法函数名必须在入口挡掉而不是交给 SQLite 解析
  describe('SQLC-028 valueWrapper 必须是合法 SQL 函数标识符', () => {
    it('接受合法标识符', () => {
      const sql = buildFtsTriggersSql('article', articleFields, { valueWrapper: FTS_BIGRAM_SQL_FUNCTION });
      expect(sql).toContain(`${FTS_BIGRAM_SQL_FUNCTION}(NEW."title")`);
      expect(sql).toContain(`${FTS_BIGRAM_SQL_FUNCTION}(OLD."title")`);
    });

    it.each([
      ['多语句注入', `x) ; DROP TABLE "article"; SELECT (`],
      ['带空格', 'my func'],
      ['带引号', 'x"y'],
      ['带括号', 'f()'],
      ['以数字开头', '1fn'],
      ['带点号', 'schema.fn'],
      ['空串', ''],
      ['带反引号', 'f`g'],
      ['带分号', 'f;g'],
      ['带 CJK', '函数']
    ])('拒绝 %s', (_label, wrapper) => {
      expect(() => buildFtsTriggersSql('article', articleFields, { valueWrapper: wrapper })).toThrow(
        /buildFtsTriggersSql: invalid valueWrapper/
      );
    });

    it('拒绝时不产出任何 SQL（异常先于拼接）', () => {
      let sql: string | undefined;
      try {
        sql = buildFtsTriggersSql('article', articleFields, { valueWrapper: 'x) ; DROP TABLE t; SELECT (' });
      } catch {
        // 预期抛出
      }
      expect(sql).toBeUndefined();
    });
  });
});
