import {
  PropertyType,
  RelationKind,
  transitionMetadata,
  type EntityMetadata,
  type EntityPropertyMetadataOptions,
  type EntityRelationMetadataOptions
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { generate_entity_insert_sql as insert_sql, type InsertSqlOptions } from '../../index.js';

// 模拟 Entity 类。
class TestEntity {
  id: string = 'test-id';
  name: string = 'Test Name';
  age: number = 25;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

describe('insert_sql', () => {
  const createMetadata = (properties: EntityPropertyMetadataOptions[]): EntityMetadata =>
    transitionMetadata({
      name: 'TestEntity',
      namespace: 'test',
      properties
    });

  const createMetadataWithRelations = (
    name: Capitalize<string>,
    properties: EntityPropertyMetadataOptions[],
    relations: EntityRelationMetadataOptions[]
  ): EntityMetadata => transitionMetadata({ name, namespace: 'blog', properties, relations });

  it('应该生成基本的 INSERT SQL', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'age', type: PropertyType.integer }
    ]);

    const entity = new TestEntity();
    const result = await insert_sql(metadata, entity);

    expect(result.sql).toContain('INSERT INTO "test$TestEntity"');
    expect(result.sql).toContain('("id","name","age")');
    expect(result.sql).toContain('VALUES (?,?,?)');
    expect(result.sql).toContain('RETURNING rowid as __rowid, *');
    expect(result.params).toEqual(['test-id', 'Test Name', 25]);
  });

  it('useReplace 应按主键更新现有记录', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const result = await insert_sql(metadata, new TestEntity(), { useReplace: true });

    expect(result.sql).toContain('INSERT INTO "test$TestEntity"');
    expect(result.sql).toContain('ON CONFLICT ("id") DO UPDATE SET "name" = excluded."name"');
    expect(result.sql).not.toContain('REPLACE');
  });

  it('useReplace 应使用自定义物理主键列', async () => {
    const metadata = createMetadata([
      { name: 'id', columnName: 'entity_id', type: PropertyType.uuid },
      { name: 'name', columnName: 'display_name', type: PropertyType.string }
    ]);

    const result = await insert_sql(metadata, new TestEntity(), { useReplace: true });

    expect(result.sql).toContain('("entity_id","display_name")');
    expect(result.sql).toContain('ON CONFLICT ("entity_id") DO UPDATE SET "display_name" = excluded."display_name"');
  });

  it('useReplace 仅包含主键时应忽略同主键冲突', async () => {
    const metadata = createMetadata([{ name: 'id', type: PropertyType.uuid }]);

    const result = await insert_sql(metadata, new TestEntity(), { useReplace: true });

    expect(result.sql).toContain('ON CONFLICT ("id") DO NOTHING');
  });

  it('应该自动添加 createdAt 时间戳', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'createdAt', type: PropertyType.date }
    ]);

    const entity = new TestEntity();
    const beforeCreate = new Date();
    const result = await insert_sql(metadata, entity);
    const afterCreate = new Date();

    expect(result.sql).toContain('createdAt');
    expect(result.params!).toHaveLength(3);
    const createdAtParam = result.params![2] as string;
    const createdAtDate = new Date(createdAtParam);
    expect(createdAtDate.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(createdAtDate.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
  });

  it('应该自动添加 updatedAt 时间戳', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'updatedAt', type: PropertyType.date }
    ]);

    const entity = new TestEntity();
    const beforeCreate = new Date();
    const result = await insert_sql(metadata, entity);
    const afterCreate = new Date();

    expect(result.sql).toContain('updatedAt');
    expect(result.params!).toHaveLength(3);
    const updatedAtParam = result.params![2] as string;
    const updatedAtDate = new Date(updatedAtParam);
    expect(updatedAtDate.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
    expect(updatedAtDate.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
  });

  it('应该从 context 中设置 createdBy', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'createdBy', type: PropertyType.uuid }
    ]);

    const entity = new TestEntity();
    const context: InsertSqlOptions = { userId: 'user-123' };
    const result = await insert_sql(metadata, entity, context);

    expect(result.sql).toContain('createdBy');
    expect(result.params).toContain('user-123');
  });

  it('应该从 context 中设置 updatedBy', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'updatedBy', type: PropertyType.uuid }
    ]);

    const entity = new TestEntity();
    const context: InsertSqlOptions = { userId: 'user-456' };
    const result = await insert_sql(metadata, entity, context);

    expect(result.sql).toContain('updatedBy');
    expect(result.params).toContain('user-456');
  });

  it('应该使用 context 提供的 createdAt', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'createdAt', type: PropertyType.date }
    ]);

    const entity = new TestEntity();
    const customDate = new Date('2025-01-01T00:00:00.000Z');
    const context: InsertSqlOptions = { createdAt: customDate };
    const result = await insert_sql(metadata, entity, context);

    expect(result.params).toContain('2025-01-01T00:00:00.000Z');
  });

  it('应该使用 context 提供的 updatedAt', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'updatedAt', type: PropertyType.date }
    ]);

    const entity = new TestEntity();
    const customDate = new Date('2025-06-15T12:30:00.000Z');
    const context: InsertSqlOptions = { updatedAt: customDate };
    const result = await insert_sql(metadata, entity, context);

    expect(result.params).toContain('2025-06-15T12:30:00.000Z');
  });

  it('当 returning = false 时不应包含 RETURNING 子句', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const entity = new TestEntity();
    const context: InsertSqlOptions = { returning: false };
    const result = await insert_sql(metadata, entity, context);

    expect(result.sql).not.toContain('RETURNING');
    expect(result.sql).toMatch(/;$/);
  });

  it('默认应该包含 RETURNING 子句', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const entity = new TestEntity();
    const result = await insert_sql(metadata, entity);

    expect(result.sql).toContain('RETURNING rowid as __rowid, *');
  });

  it('应该处理布尔类型值', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'active', type: PropertyType.boolean }
    ]);

    const entity = Object.assign(new TestEntity(), { active: true });
    const result = await insert_sql(metadata, entity);

    expect(result.params).toContain(1); // true 转换为 1
  });

  it('应该处理 JSON 类型值', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'data', type: PropertyType.json }
    ]);

    const entity = Object.assign(new TestEntity(), { data: { key: 'value', nested: { prop: 123 } } });
    const result = await insert_sql(metadata, entity);

    expect(result.params).toContain(JSON.stringify({ key: 'value', nested: { prop: 123 } }));
  });

  it('应该处理数组类型值', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'tags', type: PropertyType.stringArray }
    ]);

    const entity = Object.assign(new TestEntity(), { tags: ['tag1', 'tag2', 'tag3'] });
    const result = await insert_sql(metadata, entity);

    expect(result.params).toContain(JSON.stringify(['tag1', 'tag2', 'tag3']));
  });

  it('应该只包含 metadata 中定义的属性', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string }
    ]);

    const entity = Object.assign(new TestEntity(), { name: 'Test', extraField: 'should be ignored' });
    const result = await insert_sql(metadata, entity);

    expect(result.sql).not.toContain('extraField');
    expect(result.params).toHaveLength(2);
  });

  it('应该保留外键字段', async () => {
    const metadata = createMetadataWithRelations(
      'Post',
      [
        { name: 'id', type: PropertyType.uuid },
        { name: 'title', type: PropertyType.string }
      ],
      [
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'User',
          mappedProperty: 'posts',
          columnName: 'authorId'
        }
      ]
    );

    const entity = Object.assign(new TestEntity(), { id: 'post-123', title: 'My Post', authorId: 'user-456' });
    const result = await insert_sql(metadata, entity);

    expect(result.sql).toContain('authorId');
    expect(result.params).toContain('user-456');
  });

  it('应该处理多个外键', async () => {
    const metadata = createMetadataWithRelations(
      'Comment',
      [
        { name: 'id', type: PropertyType.uuid },
        { name: 'content', type: PropertyType.string }
      ],
      [
        {
          name: 'post',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'Post',
          mappedProperty: 'comments',
          columnName: 'postId'
        },
        {
          name: 'author',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'User',
          mappedProperty: 'comments',
          columnName: 'authorId'
        }
      ]
    );

    const entity = Object.assign(new TestEntity(), {
      id: 'comment-123',
      content: 'Nice post!',
      postId: 'post-456',
      authorId: 'user-789'
    });
    const result = await insert_sql(metadata, entity);

    expect(result.sql).toContain('postId');
    expect(result.sql).toContain('authorId');
    expect(result.params).toContain('post-456');
    expect(result.params).toContain('user-789');
  });

  it('应该正确生成占位符数量', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'field1', type: PropertyType.string },
      { name: 'field2', type: PropertyType.number },
      { name: 'field3', type: PropertyType.boolean },
      { name: 'field4', type: PropertyType.integer }
    ]);

    const entity = Object.assign(new TestEntity(), {
      id: 'test',
      field1: 'a',
      field2: 1.5,
      field3: true,
      field4: 10
    });
    const result = await insert_sql(metadata, entity);

    const placeholderCount = (result.sql.match(/\?/g) || []).length;
    expect(placeholderCount).toBe(result.params!.length);
  });

  it('应该同时设置所有上下文字段', async () => {
    const metadata = createMetadata([
      { name: 'id', type: PropertyType.uuid },
      { name: 'name', type: PropertyType.string },
      { name: 'createdAt', type: PropertyType.date },
      { name: 'updatedAt', type: PropertyType.date },
      { name: 'createdBy', type: PropertyType.uuid },
      { name: 'updatedBy', type: PropertyType.uuid }
    ]);

    const entity = new TestEntity();
    const context: InsertSqlOptions = {
      userId: 'user-999',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-02')
    };
    const result = await insert_sql(metadata, entity, context);

    expect(result.sql).toContain('createdAt');
    expect(result.sql).toContain('updatedAt');
    expect(result.sql).toContain('createdBy');
    expect(result.sql).toContain('updatedBy');
    expect(result.params).toContain('user-999'); // 出现两次
    expect(result.params!.filter(p => p === 'user-999')).toHaveLength(2);
  });
});
