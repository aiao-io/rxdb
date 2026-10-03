import { Entity, EntityBase, getEntityMetadata, isEntityMatchWhere, PropertyType, type RuleGroup } from '@aiao/rxdb';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildRuleGroup } from '../query/query_sql.js';

@Entity({
  name: 'ReviewSqliteKeyValue',
  properties: [
    { name: 'meta', type: PropertyType.keyValue, properties: [{ name: 'value', type: PropertyType.string }] },
    { name: 'tag', type: PropertyType.string, nullable: true }
  ]
})
class ReviewSqliteKeyValue extends EntityBase {}

const metadata = getEntityMetadata(ReviewSqliteKeyValue);

describe('实际代码评审：keyValue 缺失键的 SQL 三值逻辑', () => {
  it.each([
    { title: 'notContains 缺失键', operator: 'notContains' as const, value: { theme: 'dark' } },
    {
      title: 'contains 不能把缺失键变成 undefined 字符串',
      operator: 'contains' as const,
      value: { theme: 'undefined' }
    }
  ])('$title：SQLite 查询结果应与核心 JS 一致', ({ operator, value }) => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'meta', operator, value }] };
    const sql = buildRuleGroup(where, new Map(), metadata);
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE review_kv (meta TEXT)');
      db.prepare('INSERT INTO review_kv VALUES (?)').run('{}');
      const rows = db.prepare(`SELECT meta FROM review_kv AS _ WHERE ${sql}`).all();
      const js = isEntityMatchWhere({ meta: {} }, where);
      console.log(JSON.stringify({ sql, value, databaseMatches: rows.length > 0, jsMatches: js }));
      expect(rows.length > 0).toBe(js);
    } finally {
      db.close();
    }
  });
});

describe('实际代码评审：空 notIn 集合与 NULL', () => {
  it('SQLite 与核心 JS 对合法 nullable 字段应一致', () => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'tag', operator: 'notIn', value: [] }] };
    const sql = buildRuleGroup(where, new Map(), metadata);
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE review_null (tag TEXT); INSERT INTO review_null VALUES (NULL)');
      const rows = db.prepare(`SELECT tag FROM review_null AS _ WHERE ${sql}`).all();
      const js = isEntityMatchWhere({ tag: null }, where);
      console.log(JSON.stringify({ sql, row: { tag: null }, databaseMatches: rows.length > 0, jsMatches: js }));
      expect(rows.length > 0).toBe(js);
    } finally {
      db.close();
    }
  });
});
