import { describe, expect, it } from 'vitest';
import { designToSqlSchema } from '../../sql/design-to-schema';
import { generateCreateSql, isDestructiveSql } from '../../sql/generate-sql';
import type { DesignSqlInput, SqlSchema } from '../../sql/types';

function threeEntityDesign(): DesignSqlInput {
  return {
    entities: [
      { id: 'e1', name: 'User', tableName: 'users', extendsBase: 'EntityBase' },
      { id: 'e2', name: 'Post', tableName: 'posts', extendsBase: 'EntityBase' },
      { id: 'e3', name: 'Order', tableName: 'order', extendsBase: 'EntityBase' }
    ],
    properties: [
      {
        id: 'p1',
        name: 'email',
        propertyType: 'string',
        columnName: 'email',
        isRequired: true,
        isUnique: true,
        sortOrder: 'a'
      },
      {
        id: 'p2',
        name: 'status',
        propertyType: 'enum',
        columnName: 'status',
        enumValues: ['draft', 'published'],
        isRequired: true,
        sortOrder: 'a'
      },
      {
        id: 'p3',
        name: 'total',
        propertyType: 'number',
        columnName: 'total',
        isNullable: true,
        sortOrder: 'a'
      },
      {
        id: 'p4',
        name: 'user',
        propertyType: 'string',
        columnName: 'user',
        isRequired: true,
        sortOrder: 'b'
      }
    ],
    relations: [
      {
        id: 'r1',
        name: 'author',
        relationKind: 'MANY_TO_ONE',
        mappedEntityId: 'e1',
        columnName: 'author_id',
        designEntityId: 'e2',
        onDeleteAction: 'CASCADE'
      }
    ],
    indexes: [
      {
        id: 'i1',
        propertyIds: ['p2'],
        isUnique: false,
        displayName: 'idx_posts_status',
        designEntityId: 'e2'
      }
    ],
    propertyEntityIds: {
      p1: 'e1',
      p2: 'e2',
      p3: 'e3',
      p4: 'e3'
    }
  };
}

describe('designToSqlSchema + generateCreateSql', () => {
  it('includes EntityBase columns and CREATE TABLE for 3 entities', () => {
    const schema = designToSqlSchema(threeEntityDesign());
    expect(schema.tables).toHaveLength(3);
    const users = schema.tables.find(t => t.name === 'users');
    expect(users?.columns.map(c => c.name)).toEqual(
      expect.arrayContaining(['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'email'])
    );
    expect(users?.columns.find(c => c.name === 'id')?.primaryKey).toBe(true);
    expect(users?.columns.find(c => c.name === 'email')?.unique).toBe(true);

    const result = generateCreateSql(schema);
    expect(result.sql).toContain('CREATE TABLE users');
    expect(result.sql).toContain('CREATE TABLE posts');
    expect(result.sql).toContain('CREATE TABLE "order"');
    expect(result.sql).toContain('email text NOT NULL UNIQUE');
    expect(result.sql).toContain("CHECK (status IN ('draft', 'published'))");
    expect(result.sql).toContain('FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE');
    expect(result.sql).toContain('CREATE INDEX idx_posts_status ON posts (status)');
  });

  it('header comments list escaped identifiers (reserved / mixed)', () => {
    const result = generateCreateSql(designToSqlSchema(threeEntityDesign()));
    expect(result.sql.startsWith('-- escaped:')).toBe(true);
    expect(result.escapedIdentifiers).toEqual(expect.arrayContaining(['order', 'order.user']));
    expect(result.sql).toContain('"user" text NOT NULL');
  });

  it('snake_cases table/column when overrides absent', () => {
    const schema = designToSqlSchema({
      entities: [{ id: 'e1', name: 'BlogPost' }],
      properties: [{ id: 'p1', name: 'publishedAt', propertyType: 'date', isRequired: true }],
      relations: [],
      indexes: [],
      propertyEntityIds: { p1: 'e1' }
    });
    expect(schema.tables[0].name).toBe('blog_post');
    expect(schema.tables[0].columns.some(c => c.name === 'published_at')).toBe(true);
  });

  it('creates all tables before adding foreign keys', () => {
    const schema = designToSqlSchema({
      entities: [
        { id: 'order', name: 'Order', tableName: 'orders' },
        { id: 'owner', name: 'Owner', tableName: 'owners' }
      ],
      properties: [],
      relations: [
        {
          id: 'owner-relation',
          name: 'owner',
          relationKind: 'MANY_TO_ONE',
          mappedEntityId: 'owner',
          designEntityId: 'order'
        }
      ],
      indexes: [],
      propertyEntityIds: {}
    });

    const { sql } = generateCreateSql(schema);

    const lastCreate = Math.max(sql.indexOf('CREATE TABLE orders'), sql.indexOf('CREATE TABLE owners'));
    expect(sql.indexOf('ALTER TABLE orders ADD CONSTRAINT')).toBeGreaterThan(lastCreate);
  });
});

describe('isDestructiveSql', () => {
  it('detects DROP variants', () => {
    expect(isDestructiveSql('DROP TABLE users;')).toBe(true);
    expect(isDestructiveSql('ALTER TABLE t DROP COLUMN c;')).toBe(true);
    expect(isDestructiveSql('drop index idx_x;')).toBe(true);
    expect(isDestructiveSql('ALTER TABLE t DROP CONSTRAINT fk_x;')).toBe(true);
  });

  it('ignores non-drop DDL', () => {
    expect(isDestructiveSql('CREATE TABLE users (id uuid);')).toBe(false);
    expect(isDestructiveSql('ALTER TABLE t ADD COLUMN c text;')).toBe(false);
  });
});

describe('generateCreateSql empty', () => {
  it('returns empty body for empty schema', () => {
    const empty: SqlSchema = { tables: [] };
    const result = generateCreateSql(empty);
    expect(result.sql).toBe('');
    expect(result.escapedIdentifiers).toEqual([]);
  });
});
