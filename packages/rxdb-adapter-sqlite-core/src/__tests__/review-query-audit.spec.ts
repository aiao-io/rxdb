import { Entity, EntityBase, getEntityMetadata, isEntityMatchWhere, PropertyType, type RuleGroup } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { assertOo1Static, type Oo1Static } from '../oo1-types.js';
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

interface ReviewSqliteDatabase {
  exec(sql: string): void;
  all(sql: string): unknown[];
  close(): void;
}

let wasmModule: Promise<Oo1Static> | undefined;

const createReviewSqliteDatabase = async (): Promise<ReviewSqliteDatabase> => {
  if (typeof window === 'undefined') {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(':memory:');
    return { exec: sql => db.exec(sql), all: sql => db.prepare(sql).all(), close: () => db.close() };
  }
  wasmModule ??= (async () => {
    const { default: init } = await import('@sqlite.org/sqlite-wasm');
    const module: unknown = await init({ print: () => undefined, printErr: () => undefined });
    assertOo1Static(module);
    return module;
  })();
  const module = await wasmModule;
  const db = new module.oo1.DB(':memory:');
  return {
    exec: sql => {
      db.exec({ sql });
    },
    all: sql => {
      const resultRows: unknown[][] = [];
      db.exec({ sql, rowMode: 'array', resultRows });
      return resultRows;
    },
    close: () => db.close()
  };
};

describe('实际代码评审：keyValue 缺失键的 SQL 三值逻辑', () => {
  it.each([
    { title: 'notContains 缺失键', operator: 'notContains' as const, value: { theme: 'dark' } },
    {
      title: 'contains 不能把缺失键变成 undefined 字符串',
      operator: 'contains' as const,
      value: { theme: 'undefined' }
    }
  ])('$title：SQLite 查询结果应与核心 JS 一致', async ({ operator, value }) => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'meta', operator, value }] };
    const sql = buildRuleGroup(where, new Map(), metadata);
    const db = await createReviewSqliteDatabase();
    try {
      db.exec('CREATE TABLE review_kv (meta TEXT)');
      db.exec("INSERT INTO review_kv VALUES ('{}')");
      const rows = db.all(`SELECT meta FROM review_kv AS _ WHERE ${sql}`);
      const js = isEntityMatchWhere({ meta: {} }, where);
      console.log(JSON.stringify({ sql, value, databaseMatches: rows.length > 0, jsMatches: js }));
      expect(rows.length > 0).toBe(js);
    } finally {
      db.close();
    }
  });
});

describe('实际代码评审：空 notIn 集合与 NULL', () => {
  it('SQLite 与核心 JS 对合法 nullable 字段应一致', async () => {
    const where: RuleGroup = { combinator: 'and', rules: [{ field: 'tag', operator: 'notIn', value: [] }] };
    const sql = buildRuleGroup(where, new Map(), metadata);
    const db = await createReviewSqliteDatabase();
    try {
      db.exec('CREATE TABLE review_null (tag TEXT); INSERT INTO review_null VALUES (NULL)');
      const rows = db.all(`SELECT tag FROM review_null AS _ WHERE ${sql}`);
      const js = isEntityMatchWhere({ tag: null }, where);
      console.log(JSON.stringify({ sql, row: { tag: null }, databaseMatches: rows.length > 0, jsMatches: js }));
      expect(rows.length > 0).toBe(js);
    } finally {
      db.close();
    }
  });
});
