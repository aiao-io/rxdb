import {
  EntityMetadata,
  EntityPropertyMetadataOptions,
  PropertyType,
  RelationKind,
  transitionMetadata
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import generate_entity_insert_sql from '../../entity/insert_sql.js';

describe('insert_sql (PGlite)', () => {
  const createMetadata = (properties: Array<[string, PropertyType]>): EntityMetadata =>
    transitionMetadata({
      name: 'TestEntity',
      namespace: 'test',
      properties: properties.map(([name, type]) => ({ name, type })) as EntityPropertyMetadataOptions[]
    });

  it('应该生成基本的 INSERT SQL', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['age', PropertyType.integer]
    ]);

    const entity = { id: 'test-id', name: 'Test Name', age: 25 };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).toContain('INSERT INTO "test"."TestEntity"');
    expect(result.sql).toContain('RETURNING *');
    expect(result.params.length).toBeGreaterThanOrEqual(3);
  });

  it('应该使用 $1, $2 等参数化占位符', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const entity = { id: 'test-id', name: 'Test Name' };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).toContain('$1');
    expect(result.sql).toContain('$2');
    expect(result.sql).not.toContain('?');
  });

  it('应该从 context 中设置 createdBy', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['createdBy', PropertyType.uuid]
    ]);

    const entity = { id: 'test-id', name: 'Test Name' };
    const context = { userId: 'user-123' };
    const result = await generate_entity_insert_sql(metadata, entity, context);

    expect(result.sql).toContain('"createdBy"');
    expect(result.params).toContain('user-123');
  });

  it('应该从 context 中设置 updatedBy', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string],
      ['updatedBy', PropertyType.uuid]
    ]);

    const entity = { id: 'test-id', name: 'Test Name' };
    const context = { userId: 'user-456' };
    const result = await generate_entity_insert_sql(metadata, entity, context);

    expect(result.sql).toContain('"updatedBy"');
    expect(result.params).toContain('user-456');
  });

  it('当 returning = false 时不应包含 RETURNING 子句', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const entity = { id: 'test-id', name: 'Test Name' };
    const context = { returning: false } as const;
    const result = await generate_entity_insert_sql(metadata, entity, context);

    expect(result.sql).not.toContain('RETURNING');
    expect(result.sql).toMatch(/;$/);
  });

  it('默认应该包含 RETURNING 子句', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const entity = { id: 'test-id', name: 'Test Name' };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).toContain('RETURNING *');
  });

  it('应该处理 JSON 类型值', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['data', PropertyType.json]
    ]);

    const entity = { id: 'test-id', data: { key: 'value', nested: { prop: 123 } } };
    const result = await generate_entity_insert_sql(metadata, entity);

    const jsonParam = result.params.find(p => typeof p === 'string' && p.includes('key'));
    expect(jsonParam).toBeDefined();
  });

  it('应该只包含 metadata 中定义的属性', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const entity = { id: 'test-id', name: 'Test', extraField: 'should be ignored' };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).not.toContain('extraField');
  });

  it('应该保留外键字段', async () => {
    const metadata = transitionMetadata({
      name: 'Post',
      namespace: 'blog',
      properties: [
        { name: 'id', type: PropertyType.uuid },
        { name: 'title', type: PropertyType.string }
      ],
      relations: [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'User',
          mappedProperty: 'posts'
        }
      ]
    });

    const entity = { id: 'post-123', title: 'My Post', authorId: 'user-456' };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).toContain('"authorId"');
    expect(result.params).toContain('user-456');
  });

  it('应该正确生成占位符数量', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['field1', PropertyType.string],
      ['field2', PropertyType.number],
      ['field3', PropertyType.boolean],
      ['field4', PropertyType.integer]
    ]);

    const entity = { id: 'test', field1: 'a', field2: 1.5, field3: true, field4: 10 };
    const result = await generate_entity_insert_sql(metadata, entity);

    const placeholderCount = (result.sql.match(/\$\d+/g) || []).length;
    expect(placeholderCount).toBe(result.params.length);
  });

  it('应该使用参数化查询防止 SQL 注入', async () => {
    const metadata = createMetadata([
      ['id', PropertyType.uuid],
      ['name', PropertyType.string]
    ]);

    const entity = { id: 'test-id', name: "'; DROP TABLE users; --" };
    const result = await generate_entity_insert_sql(metadata, entity);

    expect(result.sql).not.toContain("'; DROP TABLE");
    expect(result.params).toContain("'; DROP TABLE users; --");
  });
});
