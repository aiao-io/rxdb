import { Entity, EntityBase, getEntityMetadata, isEntityMatchWhere, PropertyType, type RuleGroup } from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { buildRuleGroupPG } from '../query/query_sql.js';

@Entity({ name: 'ReviewArrayMembership', properties: [{ name: 'tags', type: PropertyType.stringArray }] })
class ReviewArrayMembership extends EntityBase {}
const metadata = getEntityMetadata(ReviewArrayMembership);

describe('实际代码评审：数组 in/notIn 的交集语义', () => {
  it.each(['in', 'notIn'] as const)('%s：SQL 应与核心 JS 的任一元素交集判断一致', async operator => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'tags', operator, value: ['alpha', 'beta'] }] };
    const params: unknown[] = [];
    const sql = buildRuleGroupPG(where, params, new Map(), metadata);
    const db = new PGlite();
    try {
      await db.exec('CREATE TABLE review_array (tags text[])');
      await db.query('INSERT INTO review_array VALUES ($1::text[])', [['alpha']]);
      const result = await db.query(`SELECT tags FROM review_array AS _ WHERE ${sql}`, params);
      const js = isEntityMatchWhere({ tags: ['alpha'] }, where);
      console.log(JSON.stringify({ sql, params, operator, databaseMatches: result.rows.length > 0, jsMatches: js }));
      expect(result.rows.length > 0).toBe(js);
    } finally {
      await db.close();
    }
  });
});
