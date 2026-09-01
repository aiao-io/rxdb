import { describe, expect, it } from 'vitest';

import { buildFtsTriggersSql } from '../../fts/build-fts-triggers.js';

describe('buildFtsTriggersSql', () => {
  it('throws when no fields are provided', () => {
    expect(() => buildFtsTriggersSql('docs', [])).toThrow(/no searchable fields/);
  });

  it('generates a trigger function and a BEFORE INSERT OR UPDATE trigger for a single text field', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'title', isArray: false }]);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "docs__fts_update"()');
    expect(sql).toContain('RETURNS trigger');
    expect(sql).toContain("to_tsvector('simple'");
    expect(sql).toContain('NEW."title"');
    expect(sql).toContain('CREATE TRIGGER "docs__fts_trg"');
    expect(sql).toContain('BEFORE INSERT OR UPDATE');
    expect(sql).toContain('ON "docs"');
    expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION "docs__fts_update"()');
  });

  // 原用例 `expands array fields via jsonb_array_elements_text` 断言的是**默认按 JSONB 展开**，
  // 而适配器对 stringArray 建的是 text[]，那条默认在真实表上是 42883（PGL-007）。
  it('默认按 text[] 展开数组字段（与适配器建表映射一致）', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'tags', isArray: true }]);
    expect(sql).toContain(`array_to_string(NEW."tags", ' ')`);
    expect(sql).not.toContain('jsonb_array_elements_text');
  });

  it('显式 arrayKind: jsonb 时才用 jsonb_array_elements_text', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'tags', isArray: true, arrayKind: 'jsonb' }]);
    expect(sql).toContain('jsonb_array_elements_text');
    expect(sql).toContain('NEW."tags"');
  });

  it('arrayKind 对标量字段无影响', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'title', isArray: false, arrayKind: 'jsonb' }]);
    expect(sql).toContain(`COALESCE(NEW."title", '')`);
    expect(sql).not.toContain('jsonb_array_elements_text');
    expect(sql).not.toContain('array_to_string');
  });

  it('concatenates multiple fields with space separator inside to_tsvector', () => {
    const sql = buildFtsTriggersSql('docs', [
      { name: 'title', isArray: false },
      { name: 'body', isArray: false }
    ]);
    expect(sql).toContain('NEW."title"');
    expect(sql).toContain('NEW."body"');
    // 单次 to_tsvector 调用拼接两个字段。
    const count = (sql.match(/to_tsvector\(/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('honors a custom regconfig', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'body', isArray: false }], { regconfig: 'english' });
    expect(sql).toContain("to_tsvector('english'");
    expect(sql).not.toContain("to_tsvector('simple'");
  });

  /**
   * 函数名**必须**跟着 schema 走，表名同理。
   *
   * trigger 名是表的附属对象、索引名跟着表进同一个 schema，两者跨 schema 都不会撞；
   * 而函数不带限定时被创建到 search_path 的首个 schema（通常是 public）——于是
   * `shop.article` 与 `public.article` 会抢同一个 `"article__fts_update"`，
   * 后装的那个把先装的函数体覆盖掉，先装那张表的 trigger 从此按别人的字段算 tsvector。
   */
  it('schema 给定时限定表名与函数名', () => {
    const sql = buildFtsTriggersSql('article', [{ name: 'title', isArray: false }], { schema: 'shop' });
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "shop"."article__fts_update"()');
    expect(sql).toContain('DROP TRIGGER IF EXISTS "article__fts_trg" ON "shop"."article"');
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON "shop"."article"');
    expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION "shop"."article__fts_update"()');
  });

  it('drops existing trigger before recreating (idempotent)', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'title', isArray: false }]);
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS "docs__fts_trg"/);
  });

  it('coalesces NULL fields to empty string to avoid NULL tsvector', () => {
    const sql = buildFtsTriggersSql('docs', [{ name: 'title', isArray: false }]);
    expect(sql).toContain('COALESCE');
  });

  it('mixes array and scalar fields correctly', () => {
    const sql = buildFtsTriggersSql('docs', [
      { name: 'title', isArray: false },
      { name: 'tags', isArray: true }
    ]);
    expect(sql).toContain(`COALESCE(NEW."title", '')`);
    expect(sql).toContain(`array_to_string(NEW."tags", ' ')`);
  });

  it('同一张表可以混用 text[] 与 jsonb 两种数组列', () => {
    const sql = buildFtsTriggersSql('docs', [
      { name: 'tags', isArray: true },
      { name: 'labels', isArray: true, arrayKind: 'jsonb' }
    ]);
    expect(sql).toContain(`array_to_string(NEW."tags", ' ')`);
    expect(sql).toContain('jsonb_array_elements_text(NEW."labels")');
  });

  /**
   * `regconfig` 来自 `buildCreateFtsTableSql(..., { regconfig })` 这一公开选项，
   * 却被直接插进 plpgsql 函数体的 `to_tsvector('${regconfig}', ...)`。
   * 单引号一闭合就能往函数体里塞任意语句 —— 公开 API 注入。
   */
  it.each([
    ['单引号闭合注入', "english', '') || (SELECT pg_sleep(1)); --"],
    ['分号注入', 'english; DROP TABLE users; --'],
    ['反斜杠转义', "english\\'"],
    ['空字符串', ''],
    ['带空格', 'not a config']
  ])('非法 regconfig（%s）必须被拒绝而不是拼进 SQL', (_name, regconfig) => {
    expect(() => buildFtsTriggersSql('docs', [{ name: 'title', isArray: false }], { regconfig })).toThrow(/regconfig/i);
  });

  it('合法 regconfig 照常通过', () => {
    for (const regconfig of ['english', 'simple', 'zh_cn', 'pg_catalog.english']) {
      const sql = buildFtsTriggersSql('docs', [{ name: 'title', isArray: false }], { regconfig });
      expect(sql).toContain(`to_tsvector('${regconfig}'`);
    }
  });
});
