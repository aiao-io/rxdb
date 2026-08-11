import { EntityMetadata, transitionMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import generate_entity_delete_sql from '../../entity/delete_sql.js';
import generate_entity_deletes_sql from '../../entity/deletes_sql.js';

describe('delete_sql (PGlite)', () => {
  const createMetadata = (
    name: Capitalize<string> = 'TestEntity',
    namespace: Lowercase<string> = 'test'
  ): EntityMetadata => transitionMetadata({ name, namespace, tableName: name });

  it('应该生成基本的 DELETE SQL', () => {
    const metadata = createMetadata();
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toBe('DELETE FROM "test"."TestEntity" WHERE id = $1;');
    expect(result.params).toEqual(['test-id']);
  });

  it('应该使用正确的表名', () => {
    const metadata = createMetadata('User', 'app');
    const entity = { id: 'user-123' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toBe('DELETE FROM "app"."User" WHERE id = $1;');
    expect(result.params).toEqual(['user-123']);
  });

  it('应该使用实体的 id 作为参数', () => {
    const metadata = createMetadata();
    const entity = { id: 'custom-id-456' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.params).toEqual(['custom-id-456']);
  });

  it('应该保持 bigint id 的类型和值', () => {
    const metadata = createMetadata();
    const result = generate_entity_delete_sql(metadata, { id: 9007199254740993n });

    expect(result.params).toEqual([9007199254740993n]);
  });

  it('应该为批量删除保持异构 id 的类型和值', () => {
    const metadata = createMetadata();
    const [result] = generate_entity_deletes_sql(metadata, [{ id: '1' }, { id: 1 }, { id: 1n }]);

    expect(result.sql).toBe('DELETE FROM "test"."TestEntity" WHERE "id" IN ($1,$2,$3);');
    expect(result.params).toEqual(['1', 1, 1n]);
  });

  it('批量删除空输入不生成非法 SQL', () => {
    expect(generate_entity_deletes_sql(createMetadata(), [])).toEqual([]);
  });

  it('批量删除按 PostgreSQL 参数上限分片', () => {
    const entities = Array.from({ length: 65_536 }, (_, id) => ({ id }));
    const statements = generate_entity_deletes_sql(createMetadata(), entities);

    expect(statements).toHaveLength(2);
    expect(statements[0].params).toHaveLength(65_535);
    expect(statements[0].sql).toContain('$65535');
    expect(statements[1]).toMatchObject({ params: [65_535] });
    expect(statements[1].sql).toContain('IN ($1)');
  });

  it('应该为不同的实体生成相同格式的 SQL', () => {
    const metadata = createMetadata();
    const entity1 = { id: 'id-1' };
    const entity2 = { id: 'id-2' };

    const result1 = generate_entity_delete_sql(metadata, entity1);
    const result2 = generate_entity_delete_sql(metadata, entity2);

    expect(result1.sql).toBe(result2.sql);
    expect(result1.params).toEqual(['id-1']);
    expect(result2.params).toEqual(['id-2']);
  });

  it('应该处理包含特殊字符的命名空间', () => {
    const metadata = createMetadata('Entity', 'my-namespace');
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toContain('"my-namespace"."Entity"');
  });

  it('应该使用参数化查询防止 SQL 注入', () => {
    const metadata = createMetadata();
    const entity = { id: "'; DROP TABLE users; --" };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toContain('WHERE id = $1');
    expect(result.sql).not.toContain("'; DROP TABLE");
    expect(result.params[0]).toBe("'; DROP TABLE users; --");
  });

  it('应该以分号结尾', () => {
    const metadata = createMetadata();
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toMatch(/;$/);
  });

  it('应该只返回一个参数', () => {
    const metadata = createMetadata();
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.params).toHaveLength(1);
  });

  it('应该返回包含 sql 和 params 的对象', () => {
    const metadata = createMetadata();
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result).toHaveProperty('sql');
    expect(result).toHaveProperty('params');
    expect(typeof result.sql).toBe('string');
    expect(Array.isArray(result.params)).toBe(true);
  });

  it('应该处理 UUID 格式的 id', () => {
    const metadata = createMetadata();
    const entity = { id: '550e8400-e29b-41d4-a716-446655440000' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.params).toEqual(['550e8400-e29b-41d4-a716-446655440000']);
  });

  it('表名应该使用双引号包裹', () => {
    const metadata = createMetadata('MyEntity', 'myNamespace' as unknown as Lowercase<string>);
    const entity = { id: 'test-id' };
    const result = generate_entity_delete_sql(metadata, entity);

    expect(result.sql).toMatch(/"myNamespace"\."MyEntity"/);
  });
});
