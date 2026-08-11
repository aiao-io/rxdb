import { transitionMetadata, type EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { find_by_row_ids_sql } from '../../query/find_by_row_ids_sql.js';
import { generate_sql } from '../../query/query_sql.js';

/**
 * 回归测试：limit / offset 必须按值精确生效，不能被 truthy 判断吞掉。
 * - `limit: 0` 应生成 `LIMIT 0`（返回空集），而不是无 LIMIT 全量返回
 * - SQLite 语法要求 OFFSET 必须跟在 LIMIT 之后，单独 offset 需补 `LIMIT -1`
 */
describe('generate_sql - limit / offset', () => {
  const metadata = {} as EntityMetadata;
  const base = { tableName: 'test$Item', metadata };

  it('limit: 0 应生成 LIMIT 0，而不是省略 LIMIT', () => {
    const sql = generate_sql({ ...base, limit: 0 });
    expect(sql).toContain(' LIMIT 0');
  });

  it('offset: 0 应生成 OFFSET 0', () => {
    const sql = generate_sql({ ...base, limit: 10, offset: 0 });
    expect(sql).toContain(' LIMIT 10 OFFSET 0');
  });

  it('只有 offset 时应补 LIMIT -1 以满足 SQLite 语法', () => {
    const sql = generate_sql({ ...base, offset: 5 });
    expect(sql).toContain(' LIMIT -1 OFFSET 5');
  });

  it('limit 与 offset 同时存在时按序拼接', () => {
    const sql = generate_sql({ ...base, limit: 20, offset: 40 });
    expect(sql).toContain(' LIMIT 20 OFFSET 40');
  });

  it('未提供 limit / offset 时不生成分页子句', () => {
    const sql = generate_sql({ ...base });
    expect(sql).not.toContain('LIMIT');
    expect(sql).not.toContain('OFFSET');
  });

  it('负数 limit 应 fail-fast', () => {
    expect(() => generate_sql({ ...base, limit: -1 })).toThrow(/Invalid limit/);
  });

  it('负数 offset 应 fail-fast', () => {
    expect(() => generate_sql({ ...base, offset: -10 })).toThrow(/Invalid offset/);
  });

  it('非整数 limit 应 fail-fast', () => {
    expect(() => generate_sql({ ...base, limit: 1.5 })).toThrow(/Invalid limit/);
  });
});

describe('find_by_row_ids_sql', () => {
  it('空 rowid 列表应该生成永不匹配的查询', () => {
    const metadata = transitionMetadata({ name: 'Item', namespace: 'test', tableName: 'Item' });

    const result = find_by_row_ids_sql(metadata, []);

    expect(result.sql).toContain('WHERE 1 = 0');
    expect(result.params).toEqual([]);
  });

  it('非空 rowid 列表应生成参数化 IN 查询', () => {
    const metadata = transitionMetadata({ name: 'Item', namespace: 'test', tableName: 'Item' });

    const result = find_by_row_ids_sql(metadata, [1n, 2n, 3n]);

    expect(result.sql).toContain('WHERE __rowid IN (?,?,?)');
    expect(result.params).toEqual([1n, 2n, 3n]);
  });
});
