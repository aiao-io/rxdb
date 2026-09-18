/**
 * @fileoverview SchemaParser 单元测试
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { beforeEach, describe, expect, it } from 'vitest';
import { SchemaParser, createSchemaParser } from './schema-parser.service.js';

// 模拟 EntityMetadata
function createMockMetadata(): EntityMetadata {
  const propertyMap = new Map();
  const properties = [
    { name: 'id', type: 'uuid', displayName: 'ID' },
    { name: 'name', type: 'string', displayName: '名称' },
    { name: 'age', type: 'integer', displayName: '年龄' },
    { name: 'email', type: 'string', displayName: '邮箱' },
    { name: 'active', type: 'boolean', displayName: '是否激活' },
    { name: 'createdAt', type: 'date', displayName: '创建时间' },
    { name: 'tags', type: 'stringArray', displayName: '标签' },
    { name: 'metadata', type: 'json', displayName: '元数据' }
  ];

  properties.forEach(p => propertyMap.set(p.name, p));

  return {
    name: 'User',
    namespace: 'public',
    displayName: 'User',
    repository: 'Repository',
    extends: null,
    properties,
    computedProperties: [],
    relations: [],
    indexes: [],
    propertyMap,
    computedPropertyMap: new Map(),
    defaultValueProperties: [],
    relationMap: new Map(),
    foreignKeyRelationMap: new Map(),
    foreignKeyRelations: [],
    foreignKeyNames: ['userId'],
    indexMap: new Map(),
    isForeignKey: (name: string) => name === 'userId'
  } as unknown as EntityMetadata;
}

describe('SchemaParser', () => {
  let parser: SchemaParser;
  let metadata: EntityMetadata;

  beforeEach(() => {
    parser = createSchemaParser();
    metadata = createMockMetadata();
  });

  describe('parse', () => {
    it('应该解析所有属性', () => {
      const fields = parser.parse(metadata);

      // 应该有 8 个属性（不包括外键）
      expect(fields.length).toBeGreaterThan(0);
    });

    it('应该正确映射类型', () => {
      const fields = parser.parse(metadata);

      const nameField = fields.find(f => f.name === 'name');
      expect(nameField?.type).toBe('string');

      const ageField = fields.find(f => f.name === 'age');
      expect(ageField?.type).toBe('number');

      const activeField = fields.find(f => f.name === 'active');
      expect(activeField?.type).toBe('boolean');

      const createdAtField = fields.find(f => f.name === 'createdAt');
      expect(createdAtField?.type).toBe('date');

      const tagsField = fields.find(f => f.name === 'tags');
      expect(tagsField?.type).toBe('array');

      const metadataField = fields.find(f => f.name === 'metadata');
      expect(metadataField?.type).toBe('object');
    });

    it('应该将 PropertyType.enum 映射为 FieldMetadata enum 类型', () => {
      const metadataWithEnumType = {
        ...metadata,
        properties: [
          {
            name: 'status',
            type: 'enum',
            displayName: '状态',
            enum: ['active', 'inactive', 'pending']
          }
        ],
        propertyMap: new Map([['status', { name: 'status', type: 'enum', enum: ['active', 'inactive', 'pending'] }]])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithEnumType);
      const statusField = fields.find(f => f.name === 'status');

      expect(statusField?.type).toBe('enum');
      expect(statusField?.enum).toEqual(['active', 'inactive', 'pending']);
    });

    it('应该使用 displayName', () => {
      const fields = parser.parse(metadata);

      const nameField = fields.find(f => f.name === 'name');
      expect(nameField?.displayName).toBe('名称');
    });

    it('应该默认排除外键', () => {
      const fields = parser.parse(metadata);
      const userIdField = fields.find(f => f.name === 'userId');
      expect(userIdField).toBeUndefined();
    });
  });

  describe('选项: includeForeignKeys', () => {
    it('应该在启用时包含外键', () => {
      // 创建包含外键的元数据
      const metadataWithFK = {
        ...metadata,
        properties: [...metadata.properties, { name: 'userId', type: 'uuid', displayName: '用户ID' }]
      } as unknown as EntityMetadata;

      const parserWithFK = createSchemaParser({ includeForeignKeys: true });
      const fields = parserWithFK.parse(metadataWithFK);

      const userIdField = fields.find(f => f.name === 'userId');
      expect(userIdField).toBeDefined();
    });
  });

  describe('选项: includeComputedProperties', () => {
    it('应该在启用时包含计算属性', () => {
      const metadataWithComputed = {
        ...metadata,
        computedProperties: [{ name: 'fullName', type: 'string', displayName: '全名' }]
      } as unknown as EntityMetadata;

      const parserWithComputed = createSchemaParser({ includeComputedProperties: true });
      const fields = parserWithComputed.parse(metadataWithComputed);

      const fullNameField = fields.find(f => f.name === 'fullName');
      expect(fullNameField).toBeDefined();
    });
  });

  describe('选项: fieldFilter', () => {
    it('应该过滤字段', () => {
      const filteredParser = createSchemaParser({
        fieldFilter: field => field.type !== 'object'
      });

      const fields = filteredParser.parse(metadata);
      const objectFields = fields.filter(f => f.type === 'object');
      expect(objectFields).toHaveLength(0);
    });
  });

  describe('选项: displayNameGenerator', () => {
    it('应该使用自定义显示名称生成器', () => {
      const customParser = createSchemaParser({
        displayNameGenerator: name => `字段: ${name}`
      });

      const fields = customParser.parse(metadata);
      const nameField = fields.find(f => f.name === 'name');
      expect(nameField?.displayName).toBe('字段: name');
    });
  });

  describe('parseMany', () => {
    it('应该批量解析多个元数据', () => {
      const metadataMap = new Map<string, EntityMetadata>();
      metadataMap.set('User', metadata);
      metadataMap.set('Post', {
        ...metadata,
        name: 'Post',
        properties: [
          { name: 'title', type: 'string', displayName: '标题' },
          { name: 'content', type: 'string', displayName: '内容' }
        ],
        propertyMap: new Map([
          ['title', { name: 'title', type: 'string' }],
          ['content', { name: 'content', type: 'string' }]
        ])
      } as unknown as EntityMetadata);

      const result = parser.parseMany(metadataMap);

      expect(result.size).toBe(2);
      expect(result.get('User')).toBeDefined();
      expect(result.get('Post')).toBeDefined();
    });
  });

  describe('默认 displayName 生成', () => {
    it('应该将 camelCase 转换为空格分隔', () => {
      const metadataWithCamelCase = {
        ...metadata,
        properties: [
          { name: 'firstName', type: 'string' },
          { name: 'lastName', type: 'string' },
          { name: 'createdByUserId', type: 'uuid' }
        ],
        propertyMap: new Map([
          ['firstName', { name: 'firstName', type: 'string' }],
          ['lastName', { name: 'lastName', type: 'string' }],
          ['createdByUserId', { name: 'createdByUserId', type: 'uuid' }]
        ])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithCamelCase);

      const firstNameField = fields.find(f => f.name === 'firstName');
      expect(firstNameField?.displayName).toBe('First Name');

      const createdByField = fields.find(f => f.name === 'createdByUserId');
      expect(createdByField?.displayName).toBe('Created By User Id');
    });
  });

  describe('选项: includeRelations', () => {
    it('应该在启用时包含关系字段', () => {
      const metadataWithRelations = {
        ...metadata,
        relations: [
          {
            name: 'posts',
            kind: '1:m',
            mappedEntity: 'Post',
            mappedProperty: 'author',
            mappedNamespace: 'public',
            columnName: 'author_id'
          }
        ]
      } as unknown as EntityMetadata;

      const parserWithRelations = createSchemaParser({ includeRelations: true });
      const fields = parserWithRelations.parse(metadataWithRelations);

      const postsField = fields.find(f => f.name === 'posts');
      expect(postsField).toBeDefined();
      expect(postsField?.type).toBe('relation');
    });

    it('应该解析关系目标实体的字段', () => {
      const postMetadata = {
        name: 'Post',
        namespace: 'public',
        displayName: 'Post',
        repository: 'Repository',
        extends: null,
        properties: [
          { name: 'id', type: 'uuid' },
          { name: 'title', type: 'string' }
        ],
        computedProperties: [],
        relations: [],
        indexes: [],
        propertyMap: new Map([
          ['id', { name: 'id', type: 'uuid' }],
          ['title', { name: 'title', type: 'string' }]
        ]),
        computedPropertyMap: new Map(),
        defaultValueProperties: [],
        relationMap: new Map(),
        foreignKeyRelationMap: new Map(),
        foreignKeyRelations: [],
        foreignKeyNames: [],
        indexMap: new Map(),
        isForeignKey: () => false
      } as unknown as EntityMetadata;

      const metadataWithRelations = {
        ...metadata,
        relations: [
          {
            name: 'posts',
            kind: '1:m',
            mappedEntity: 'Post',
            mappedProperty: 'author',
            mappedNamespace: 'public',
            columnName: 'author_id'
          }
        ]
      } as unknown as EntityMetadata;

      const parserWithRelations = createSchemaParser({
        includeRelations: true,
        entityMetadataMap: new Map([['Post', postMetadata]])
      });
      const fields = parserWithRelations.parse(metadataWithRelations);

      const postsField = fields.find(f => f.name === 'posts');
      expect(postsField?.relationFields).toBeDefined();
      expect(postsField?.relationFields?.length).toBeGreaterThan(0);
    });
  });

  describe('无效类型处理', () => {
    it('应该跳过无法映射的属性类型', () => {
      const metadataWithInvalidType = {
        ...metadata,
        properties: [
          { name: 'validField', type: 'string' },
          { name: 'invalidField', type: 'unknown_type' as never }
        ],
        propertyMap: new Map([
          ['validField', { name: 'validField', type: 'string' }],
          ['invalidField', { name: 'invalidField', type: 'unknown_type' as never }]
        ])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithInvalidType);

      const validField = fields.find(f => f.name === 'validField');
      expect(validField).toBeDefined();

      const invalidField = fields.find(f => f.name === 'invalidField');
      expect(invalidField).toBeUndefined();
    });
  });

  // ✨ T071-T073: US3 Schema 集成测试
  describe('US3: Schema 字段元数据提取', () => {
    describe('T071: 完整字段提取', () => {
      it('应该提取 required 字段（从 nullable 推导）', () => {
        const metadataWithNullable = {
          ...metadata,
          properties: [
            { name: 'requiredField', type: 'string', nullable: false },
            { name: 'optionalField', type: 'string', nullable: true }
          ],
          propertyMap: new Map([
            ['requiredField', { name: 'requiredField', type: 'string', nullable: false }],
            ['optionalField', { name: 'optionalField', type: 'string', nullable: true }]
          ])
        } as unknown as EntityMetadata;

        const fields = parser.parse(metadataWithNullable);

        const requiredField = fields.find(f => f.name === 'requiredField');
        expect(requiredField?.required).toBe(true);

        const optionalField = fields.find(f => f.name === 'optionalField');
        expect(optionalField?.required).toBe(false);
      });

      it('应该提取 description 字段', () => {
        const metadataWithDescription = {
          ...metadata,
          properties: [
            {
              name: 'email',
              type: 'string',
              displayName: '邮箱',
              description: '用户的电子邮件地址'
            }
          ],
          propertyMap: new Map([
            [
              'email',
              {
                name: 'email',
                type: 'string',
                displayName: '邮箱',
                description: '用户的电子邮件地址'
              }
            ]
          ])
        } as unknown as EntityMetadata;

        const fields = parser.parse(metadataWithDescription);
        const emailField = fields.find(f => f.name === 'email');
        expect(emailField?.description).toBe('用户的电子邮件地址');
      });
    });

    describe('T072: enum 字段支持', () => {
      it('应该提取 enum 值', () => {
        const metadataWithEnum = {
          ...metadata,
          properties: [
            {
              name: 'status',
              type: 'string',
              enum: ['active', 'inactive', 'pending']
            }
          ],
          propertyMap: new Map([
            [
              'status',
              {
                name: 'status',
                type: 'string',
                enum: ['active', 'inactive', 'pending']
              }
            ]
          ])
        } as unknown as EntityMetadata;

        const fields = parser.parse(metadataWithEnum);
        const statusField = fields.find(f => f.name === 'status');

        expect(statusField?.enum).toBeDefined();
        expect(statusField?.enum).toEqual(['active', 'inactive', 'pending']);
      });

      it('应该支持数字类型的 enum', () => {
        const metadataWithNumberEnum = {
          ...metadata,
          properties: [
            {
              name: 'priority',
              type: 'integer',
              enum: [1, 2, 3, 4, 5]
            }
          ],
          propertyMap: new Map([
            [
              'priority',
              {
                name: 'priority',
                type: 'integer',
                enum: [1, 2, 3, 4, 5]
              }
            ]
          ])
        } as unknown as EntityMetadata;

        const fields = parser.parse(metadataWithNumberEnum);
        const priorityField = fields.find(f => f.name === 'priority');

        expect(priorityField?.enum).toEqual([1, 2, 3, 4, 5]);
      });
    });

    describe('T073: pattern 字段支持', () => {
      it('应该提取正则验证模式', () => {
        const metadataWithPattern = {
          ...metadata,
          properties: [
            {
              name: 'phone',
              type: 'string',
              pattern: '^\\d{3}-\\d{4}-\\d{4}$'
            }
          ],
          propertyMap: new Map([
            [
              'phone',
              {
                name: 'phone',
                type: 'string',
                pattern: '^\\d{3}-\\d{4}-\\d{4}$'
              }
            ]
          ])
        } as unknown as EntityMetadata;

        const fields = parser.parse(metadataWithPattern);
        const phoneField = fields.find(f => f.name === 'phone');

        expect(phoneField?.pattern).toBe('^\\d{3}-\\d{4}-\\d{4}$');
      });
    });
  });

  describe('keyValue 属性支持', () => {
    it('应该将 keyValue 类型映射为 keyValue', () => {
      const metadataWithKV = {
        ...metadata,
        properties: [{ name: 'profile', type: 'keyValue', displayName: '个人信息', nullable: true }],
        propertyMap: new Map([
          ['profile', { name: 'profile', type: 'keyValue', displayName: '个人信息', nullable: true }]
        ])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithKV);
      const profileField = fields.find(f => f.name === 'profile');
      expect(profileField?.type).toBe('keyValue');
      expect(profileField?.nullable).toBe(true);
    });

    it('应该提取 keyValue 子字段', () => {
      const metadataWithKV = {
        ...metadata,
        properties: [
          {
            name: 'profile',
            type: 'keyValue',
            displayName: '个人信息',
            nullable: true,
            properties: [
              { name: 'age', type: 'number', displayName: '年龄' },
              { name: 'email', type: 'string', displayName: '邮箱' }
            ]
          }
        ],
        propertyMap: new Map([
          [
            'profile',
            {
              name: 'profile',
              type: 'keyValue',
              displayName: '个人信息',
              nullable: true,
              properties: [
                { name: 'age', type: 'number', displayName: '年龄' },
                { name: 'email', type: 'string', displayName: '邮箱' }
              ]
            }
          ]
        ])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithKV);

      // 应该有子字段
      const ageField = fields.find(f => f.name === 'profile.age');
      expect(ageField).toBeDefined();
      expect(ageField?.type).toBe('number');
      expect(ageField?.displayName).toBe('个人信息.年龄');

      const emailField = fields.find(f => f.name === 'profile.email');
      expect(emailField).toBeDefined();
      expect(emailField?.type).toBe('string');

      // 父字段应该有 keyValueFields
      const profileField = fields.find(f => f.name === 'profile');
      expect(profileField?.keyValueFields).toHaveLength(2);
    });

    it('应该处理没有 properties 的 keyValue', () => {
      const metadataWithKV = {
        ...metadata,
        properties: [{ name: 'data', type: 'keyValue', displayName: '数据' }],
        propertyMap: new Map([['data', { name: 'data', type: 'keyValue', displayName: '数据' }]])
      } as unknown as EntityMetadata;

      const fields = parser.parse(metadataWithKV);
      const dataField = fields.find(f => f.name === 'data');
      expect(dataField?.type).toBe('keyValue');
      expect(dataField?.keyValueFields).toBeUndefined();
    });
  });
});
