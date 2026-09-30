import type { EntityMetadata, EntityPropertyMetadata, EntityRelationMetadata } from '@aiao/rxdb';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import { extractEntityFields, extractSystemFields } from '../entity-field.utils.js';

function makeMeta(overrides: Partial<EntityMetadata> = {}): EntityMetadata {
  return {
    name: 'Test',
    namespace: 'public',
    displayName: 'Test',
    tableName: 'test',
    repository: 'Repository',
    extends: [],
    properties: [],
    computedProperties: [],
    relations: [],
    indexes: [],
    propertyMap: new Map(),
    computedPropertyMap: new Map(),
    relationMap: new Map(),
    foreignKeyRelationMap: new Map(),
    foreignKeyRelations: [],
    foreignKeyNames: [],
    foreignKeyColumnNames: [],
    columnNameToPropertyName: new Map(),
    indexMap: new Map(),
    defaultValueProperties: [],
    isForeignKey: () => false,
    ...overrides
  } as EntityMetadata;
}

describe('extractEntityFields', () => {
  it('should extract string property', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'name',
          { name: 'name', columnName: 'name', type: PropertyType.string, displayName: '姓名' } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields).toEqual([
      {
        field: 'name',
        displayName: '姓名',
        type: 'string',
        readonly: false,
        nullable: undefined,
        required: undefined,
        unique: undefined
      }
    ]);
  });

  it('should skip system fields', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        ['id', { name: 'id', columnName: 'id', type: PropertyType.uuid } as EntityPropertyMetadata],
        [
          'createdAt',
          { name: 'createdAt', columnName: 'created_at', type: PropertyType.date } as EntityPropertyMetadata
        ],
        [
          'updatedAt',
          { name: 'updatedAt', columnName: 'updated_at', type: PropertyType.date } as EntityPropertyMetadata
        ],
        [
          'title',
          {
            name: 'title',
            columnName: 'title',
            type: PropertyType.string,
            displayName: 'Title'
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('title');
  });

  it('should extract enum property with values', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'status',
          {
            name: 'status',
            columnName: 'status',
            type: PropertyType.enum,
            displayName: '状态',
            enum: ['active', 'inactive']
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0].enumValues).toEqual(['active', 'inactive']);
  });

  it('should extract stringArray enum values with format and options', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'labels',
          {
            name: 'labels',
            columnName: 'labels',
            type: PropertyType.stringArray,
            displayName: '标签',
            enum: ['alpha', 'beta'],
            format: { kind: 'multiSelect' },
            options: { alpha: { label: '甲' } }
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0].enumValues).toEqual(['alpha', 'beta']);
    expect(fields[0].format).toEqual({ kind: 'multiSelect' });
    expect(fields[0].options).toEqual({ alpha: { label: '甲' } });
  });

  it('should carry format / options / encrypted only when declared', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'homepage',
          {
            name: 'homepage',
            columnName: 'homepage',
            type: PropertyType.string,
            displayName: '主页',
            format: { kind: 'url', schemes: ['HTTPS'] }
          } as EntityPropertyMetadata
        ],
        [
          'status',
          {
            name: 'status',
            columnName: 'status',
            type: PropertyType.enum,
            displayName: '状态',
            enum: ['draft', 'archived'],
            format: { kind: 'singleSelect' },
            options: { draft: { label: '草稿', disabled: true } }
          } as EntityPropertyMetadata
        ],
        [
          'secret',
          {
            name: 'secret',
            columnName: 'secret',
            type: PropertyType.string,
            displayName: '密文',
            encrypted: true
          } as EntityPropertyMetadata
        ],
        [
          'title',
          {
            name: 'title',
            columnName: 'title',
            type: PropertyType.string,
            displayName: '标题'
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    const homepage = fields.find(f => f.field === 'homepage')!;
    expect(homepage.format).toEqual({ kind: 'url', schemes: ['HTTPS'] });
    expect('options' in homepage).toBe(false);
    const status = fields.find(f => f.field === 'status')!;
    expect(status.format).toEqual({ kind: 'singleSelect' });
    expect(status.options).toEqual({ draft: { label: '草稿', disabled: true } });
    const secret = fields.find(f => f.field === 'secret')!;
    expect(secret.encrypted).toBe(true);
    const title = fields.find(f => f.field === 'title')!;
    expect('format' in title).toBe(false);
    expect('options' in title).toBe(false);
    expect('encrypted' in title).toBe(false);
  });

  it('should extract keyValue property with schema', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'config',
          {
            name: 'config',
            columnName: 'config',
            type: PropertyType.keyValue,
            displayName: 'Config',
            properties: [
              { name: 'host', displayName: 'Host', type: 'string', required: true },
              { name: 'port', displayName: 'Port', type: 'integer', nullable: true }
            ]
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0].keyValueSchema).toEqual({
      host: { label: 'Host', type: 'string', required: true, nullable: undefined },
      port: { label: 'Port', type: 'integer', required: undefined, nullable: true }
    });
  });

  it('should extract computed properties as readonly', () => {
    const meta = makeMeta({
      computedPropertyMap: new Map([
        [
          'fullName',
          {
            name: 'fullName',
            columnName: 'full_name',
            type: PropertyType.string,
            displayName: '全名'
          } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0]).toEqual({ field: 'fullName', displayName: '全名', type: 'computed', readonly: true });
  });

  it('should extract foreign key relations', () => {
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'authorId',
          {
            name: 'author',
            columnName: 'author_id',
            kind: RelationKind.MANY_TO_ONE,
            displayName: '作者',
            mappedEntity: 'User',
            mappedNamespace: 'public',
            mappedProperty: 'posts',
            nullable: true
          } as EntityRelationMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0]).toEqual({
      field: 'authorId',
      displayName: '作者',
      type: 'manyToOne',
      nullable: true,
      relatedEntityName: 'User',
      relatedNamespace: 'public'
    });
  });

  it('should extract oneToOne relation', () => {
    const meta = makeMeta({
      foreignKeyRelationMap: new Map([
        [
          'profileId',
          {
            name: 'profile',
            columnName: 'profile_id',
            kind: RelationKind.ONE_TO_ONE,
            displayName: 'Profile',
            mappedEntity: 'Profile',
            mappedNamespace: 'public',
            mappedProperty: 'user'
          } as EntityRelationMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields[0].type).toBe('oneToOne');
  });

  it('should combine properties, computed, and relations', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'title',
          {
            name: 'title',
            columnName: 'title',
            type: PropertyType.string,
            displayName: 'Title'
          } as EntityPropertyMetadata
        ]
      ]),
      computedPropertyMap: new Map([
        [
          'slug',
          { name: 'slug', columnName: 'slug', type: PropertyType.string, displayName: 'Slug' } as EntityPropertyMetadata
        ]
      ]),
      foreignKeyRelationMap: new Map([
        [
          'categoryId',
          {
            name: 'category',
            columnName: 'category_id',
            kind: RelationKind.MANY_TO_ONE,
            displayName: 'Category',
            mappedEntity: 'Category',
            mappedNamespace: 'public',
            mappedProperty: 'items'
          } as EntityRelationMetadata
        ]
      ])
    });
    const fields = extractEntityFields(meta);
    expect(fields).toHaveLength(3);
    expect(fields.map(f => f.field)).toEqual(['title', 'slug', 'categoryId']);
  });
});

describe('extractSystemFields', () => {
  it('should return id always', () => {
    const meta = makeMeta();
    const fields = extractSystemFields(meta);
    expect(fields).toEqual([{ field: 'id', displayName: 'ID', type: 'uuid', readonly: true }]);
  });

  it('should include createdAt/updatedAt when present', () => {
    const meta = makeMeta({
      propertyMap: new Map([
        [
          'createdAt',
          { name: 'createdAt', columnName: 'created_at', type: PropertyType.date } as EntityPropertyMetadata
        ],
        [
          'updatedAt',
          { name: 'updatedAt', columnName: 'updated_at', type: PropertyType.date } as EntityPropertyMetadata
        ]
      ])
    });
    const fields = extractSystemFields(meta);
    expect(fields).toHaveLength(3);
    expect(fields[1].field).toBe('createdAt');
    expect(fields[2].field).toBe('updatedAt');
  });
});
