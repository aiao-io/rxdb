/**
 * T068: find_by_row_ids_sql 单元测试
 *
 * 测试通过 rowIds 生成查询 SQL 的逻辑
 * 这个函数用于 NOTIFY 事件处理时根据 rowIds 批量查询实体
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import find_by_row_ids_sql from '../query/find_by_row_ids_sql.js';

describe('find_by_row_ids_sql', () => {
  const mockMetadata: EntityMetadata = {
    name: 'test_table',
    namespace: 'public',
    tableName: 'test_table',
    className: 'TestEntity',
    columns: [],
    primaryColumn: { propertyName: 'id', columnName: 'id', type: 'string' }
  } as unknown as EntityMetadata;

  it('应该生成单个 ID 的查询', () => {
    const result = find_by_row_ids_sql(mockMetadata, ['123']);

    expect(result.sql).toBe('SELECT * FROM "public"."test_table" WHERE id IN ($1)');
    expect(result.params).toEqual(['123']);
  });

  it('应该生成多个 ID 的查询', () => {
    const result = find_by_row_ids_sql(mockMetadata, ['1', '2', '3']);

    expect(result.sql).toBe('SELECT * FROM "public"."test_table" WHERE id IN ($1, $2, $3)');
    expect(result.params).toEqual(['1', '2', '3']);
  });

  it('应该处理数字类型的 ID', () => {
    const result = find_by_row_ids_sql(mockMetadata, [1, 2, 3]);

    expect(result.sql).toBe('SELECT * FROM "public"."test_table" WHERE id IN ($1, $2, $3)');
    expect(result.params).toEqual([1, 2, 3]);
  });

  it('应该处理混合类型的 ID', () => {
    const result = find_by_row_ids_sql(mockMetadata, ['a', 1, 'b', 2]);

    expect(result.sql).toBe('SELECT * FROM "public"."test_table" WHERE id IN ($1, $2, $3, $4)');
    expect(result.params).toEqual(['a', 1, 'b', 2]);
  });

  it('应该为不同 schema 生成正确查询', () => {
    const metadataWithSchema: EntityMetadata = {
      name: 'my_table',
      namespace: 'custom_schema',
      tableName: 'my_table',
      className: 'TestEntity',
      columns: [],
      primaryColumn: { propertyName: 'id', columnName: 'id', type: 'string' }
    } as unknown as EntityMetadata;

    const result = find_by_row_ids_sql(metadataWithSchema, ['123']);

    expect(result.sql).toBe('SELECT * FROM "custom_schema"."my_table" WHERE id IN ($1)');
    expect(result.params).toEqual(['123']);
  });

  it('应该使用 PostgreSQL 参数占位符（$1, $2, ...）', () => {
    const result = find_by_row_ids_sql(mockMetadata, ['a', 'b', 'c', 'd', 'e']);

    // 验证占位符格式
    expect(result.sql).toContain('$1');
    expect(result.sql).toContain('$2');
    expect(result.sql).toContain('$3');
    expect(result.sql).toContain('$4');
    expect(result.sql).toContain('$5');
    expect(result.sql).not.toContain('?'); // 不应该是 SQLite 的 ?
  });
});
