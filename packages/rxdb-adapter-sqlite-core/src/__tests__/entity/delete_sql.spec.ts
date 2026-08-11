import { transitionMetadata, type EntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { generate_entity_delete_sql as delete_sql, generate_entity_deletes_sql as deletes_sql } from '../../index.js';

class TestEntity {
  name: string = 'Test Name';

  constructor(public id: string = 'test-id') {}
}

describe('delete_sql', () => {
  const createMetadata = (
    name: Capitalize<string> = 'TestEntity',
    namespace: Lowercase<string> = 'test'
  ): EntityMetadata => transitionMetadata({ name, namespace, tableName: name });

  it('应该生成基本的 DELETE SQL', () => {
    const metadata = createMetadata();
    const entity = new TestEntity();
    const result = delete_sql(metadata, entity);

    expect(result.sql).toBe('DELETE FROM "test$TestEntity" WHERE "id" = ?;');
    expect(result.params).toEqual(['test-id']);
  });

  it('应该使用正确的表名', () => {
    const metadata = createMetadata('User', 'app');
    const result = delete_sql(metadata, new TestEntity('user-123'));

    expect(result.sql).toBe('DELETE FROM "app$User" WHERE "id" = ?;');
    expect(result.params).toEqual(['user-123']);
  });

  it('应该使用实体的 id 作为参数', () => {
    const metadata = createMetadata();
    const result = delete_sql(metadata, new TestEntity('custom-id-456'));

    expect(result.params).toEqual(['custom-id-456']);
  });

  it('应该为不同的实体生成相同格式的 SQL', () => {
    const metadata = createMetadata();
    const result1 = delete_sql(metadata, new TestEntity('id-1'));
    const result2 = delete_sql(metadata, new TestEntity('id-2'));

    expect(result1.sql).toBe(result2.sql);
    expect(result1.params).toEqual(['id-1']);
    expect(result2.params).toEqual(['id-2']);
  });

  it('应该处理包含特殊字符的命名空间', () => {
    const metadata = createMetadata('Entity', 'my-namespace');
    const result = delete_sql(metadata, new TestEntity());

    expect(result.sql).toContain('my-namespace$Entity');
  });

  it('应该处理包含特殊字符的实体名', () => {
    const metadata = createMetadata('Special_Entity', 'app');
    const result = delete_sql(metadata, new TestEntity());

    expect(result.sql).toContain('app$Special_Entity');
  });

  it('应该使用参数化查询防止 SQL 注入', () => {
    const metadata = createMetadata();
    const result = delete_sql(metadata, new TestEntity("'; DROP TABLE users; --"));

    expect(result.sql).toContain('WHERE "id" = ?');
    expect(result.sql).not.toContain("'; DROP TABLE");
    expect(result.params[0]).toBe("'; DROP TABLE users; --");
  });

  it('应该以分号结尾', () => {
    const metadata = createMetadata();
    const result = delete_sql(metadata, new TestEntity());

    expect(result.sql.endsWith(';')).toBe(true);
  });

  it('空实体列表应该生成永不匹配的批量删除 SQL', () => {
    const metadata = createMetadata();

    expect(deletes_sql(metadata, [])).toBe('DELETE FROM "test$TestEntity" WHERE 1 = 0;');
  });

  it('非空实体列表应该按 id 生成批量删除 SQL', () => {
    const metadata = createMetadata();

    expect(deletes_sql(metadata, [new TestEntity('id-1'), new TestEntity('id-2')])).toBe(
      `DELETE FROM "test$TestEntity" WHERE "id" in ('id-1','id-2');`
    );
  });
});
