import { Entity, EntityBase, getEntityMetadata, isEntityMatchWhere, PropertyType, type RuleGroup } from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { buildRuleGroupPG } from '../query/query_sql.js';

@Entity({
  name: 'ReviewKeyValue',
  properties: [
    { name: 'meta', type: PropertyType.keyValue, properties: [{ name: 'value', type: PropertyType.string }] },
    { name: 'tag', type: PropertyType.string, nullable: true }
  ]
})
class ReviewKeyValue extends EntityBase {
  declare meta: Record<string, string>;
  declare tag: string | null;
}

const metadata = getEntityMetadata(ReviewKeyValue);

describe('实际代码评审：keyValue 查询与增量匹配一致性', () => {
  it.each([
    { title: '子串', row: { theme: 'light' }, value: { theme: 'li' } },
    { title: '多键 OR', row: { theme: 'light', mode: 'light' }, value: { theme: 'light', mode: 'dark' } }
  ])('$title：PGlite 查询结果应与核心 JS 一致', async ({ row, value }) => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'meta', operator: 'contains', value }] };
    const params: unknown[] = [];
    const sql = buildRuleGroupPG(where, params, new Map(), metadata);
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE review_kv (meta jsonb)');
      await db.query('INSERT INTO review_kv (meta) VALUES ($1::jsonb)', [JSON.stringify(row)]);
      const result = await db.query(`SELECT meta FROM review_kv AS _ WHERE ${sql}`, params);
      const js = isEntityMatchWhere({ meta: row }, where);
      console.log(JSON.stringify({ sql, params, row, databaseMatches: result.rows.length > 0, jsMatches: js }));
      expect(result.rows.length > 0).toBe(js);
    } finally {
      await db.close();
    }
  });
});

describe('实际代码评审：空 notIn 集合与 NULL', () => {
  it('PGlite 与核心 JS 对合法 nullable 字段应一致', async () => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'tag', operator: 'notIn', value: [] }] };
    const params: unknown[] = [];
    const sql = buildRuleGroupPG(where, params, new Map(), metadata);
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE review_null (tag TEXT); INSERT INTO review_null VALUES (NULL)');
      const result = await db.query(`SELECT tag FROM review_null AS _ WHERE ${sql}`, params);
      const js = isEntityMatchWhere({ tag: null }, where);
      console.log(JSON.stringify({ sql, row: { tag: null }, databaseMatches: result.rows.length > 0, jsMatches: js }));
      expect(result.rows.length > 0).toBe(js);
    } finally {
      await db.close();
    }
  });
});
