import { extractEntityFields, extractSystemFields } from '../../entity/entity-field.utils.js';
import {
  type EntityPropertyMetadata,
  type EntityRelationMetadata,
  PropertyType,
  RelationKind
} from '../../entity/metadata-options.interface.js';
import type { EntityMetadata } from '../../entity/metadata.interface.js';

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
