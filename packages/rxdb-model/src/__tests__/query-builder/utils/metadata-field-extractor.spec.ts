import type { EntityMetadata, EntityPropertyMetadata, EntityRelationMetadata } from '@aiao/rxdb';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { FieldMetadata } from '../../../query-builder/models/query-builder-state.js';
import {
  extractFieldsFromMetadata,
  extractKeyValueFields,
  extractRelationTargetFields,
  getRelationIgnoreKeys,
  mapPropertyType,
  organizeFields,
  type FieldExtractorConfig,
  type ModelInfo
} from '../../../query-builder/utils/metadata-field-extractor.js';

// 创建模拟 EntityMetadata 的辅助函数
function createMockEntityMetadata(name: string, properties: EntityPropertyMetadata[] = []): EntityMetadata {
  const propertyMap = new Map(properties.map(p => [p.name, p]));

  return {
    name,
    namespace: 'public',
    displayName: name,
    tableName: name.toLowerCase(),
    repository: 'Repository',
    extends: [],
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
    foreignKeyNames: [],
    foreignKeyColumnNames: [],
    foreignKeys: [],
    encryptedPropertyMap: new Map(),
    columnNameToPropertyName: new Map(),
    indexMap: new Map(),
    isForeignKey: () => false
  } as EntityMetadata;
}

describe('metadata-field-extractor', () => {
  describe('mapPropertyType', () => {
    it('应该正确映射 uuid 类型', () => {
      expect(mapPropertyType(PropertyType.uuid)).toBe('uuid');
    });

    it('应该正确映射 string 类型', () => {
      expect(mapPropertyType(PropertyType.string)).toBe('string');
    });

    it('应该正确映射 number 类型', () => {
      expect(mapPropertyType(PropertyType.number)).toBe('number');
    });

    it('应该正确映射 integer 类型', () => {
      expect(mapPropertyType(PropertyType.integer)).toBe('number');
    });

    it('应该正确映射 boolean 类型', () => {
      expect(mapPropertyType(PropertyType.boolean)).toBe('boolean');
    });

    it('应该正确映射 date 类型', () => {
      expect(mapPropertyType(PropertyType.date)).toBe('date');
    });

    it('应该正确映射 stringArray 类型', () => {
      expect(mapPropertyType(PropertyType.stringArray)).toBe('array');
    });

    it('应该正确映射 numberArray 类型', () => {
      expect(mapPropertyType(PropertyType.numberArray)).toBe('array');
    });

    it('应该正确映射 json 类型', () => {
      expect(mapPropertyType(PropertyType.json)).toBe('object');
    });

    it('应该正确映射 keyValue 类型', () => {
      expect(mapPropertyType(PropertyType.keyValue)).toBe('keyValue');
    });

    it('应该正确映射 enum 类型', () => {
      expect(mapPropertyType(PropertyType.enum)).toBe('enum');
    });

    it('应该将未知类型映射为 string', () => {
      expect(mapPropertyType('unknown' as PropertyType)).toBe('string');
    });
  });

  describe('getRelationIgnoreKeys', () => {
    it('应该为 ONE_TO_MANY 关系返回 mappedProperty', () => {
      const relation: EntityRelationMetadata = {
        name: 'orders',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'Order',
        mappedProperty: 'owner',
        mappedNamespace: 'public',
        columnName: 'owner_id'
      } as EntityRelationMetadata;
      expect(getRelationIgnoreKeys(relation)).toEqual(['owner']);
    });

    it('应该为 MANY_TO_MANY 关系返回 mappedProperty', () => {
      const relation: EntityRelationMetadata = {
        name: 'courses',
        kind: RelationKind.MANY_TO_MANY,
        mappedEntity: 'Course',
        mappedProperty: 'students',
        mappedNamespace: 'public',
        columnName: 'courses_id'
      } as EntityRelationMetadata;
      expect(getRelationIgnoreKeys(relation)).toEqual(['students']);
    });

    it('应该为空数组当关系类型不是 ONE_TO_MANY 或 MANY_TO_MANY', () => {
      const relation: EntityRelationMetadata = {
        name: 'profile',
        kind: RelationKind.ONE_TO_ONE,
        mappedEntity: 'Profile',
        mappedProperty: 'user',
        mappedNamespace: 'public',
        columnName: 'profile_id'
      } as EntityRelationMetadata;
      expect(getRelationIgnoreKeys(relation)).toEqual([]);
    });
  });

  describe('extractFieldsFromMetadata', () => {
    it('应该提取基本字段', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'name', type: PropertyType.string, columnName: 'name', nullable: false, displayName: '姓名' }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap);

      expect(fields.length).toBeGreaterThan(0);
      const idField = fields.find(f => f.name === 'id');
      expect(idField).toBeDefined();
      expect(idField?.type).toBe('uuid');
    });

    it('应该包含系统字段（顶层）', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'name', type: PropertyType.string, columnName: 'name', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap);

      // 应该包含 id, createdAt, updatedAt 等系统字段
      const fieldNames = fields.map(f => f.name);
      expect(fieldNames).toContain('id');
    });

    it('应该使用自定义系统字段', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const config: FieldExtractorConfig = {
        systemFields: ['id', 'customField']
      };

      const fields = extractFieldsFromMetadata(metadata, modelMap, config);

      // 只应该包含 id 和 customField
      const fieldNames = fields.map(f => f.name);
      expect(fieldNames).toContain('id');
    });

    it('应该处理外键字段', () => {
      const metadata: EntityMetadata = {
        name: 'Order',
        namespace: 'public',
        displayName: 'Order',
        tableName: 'order',
        repository: 'Repository',
        extends: [],
        properties: [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
          { name: 'ownerId', type: PropertyType.uuid, columnName: 'owner_id', nullable: false }
        ],
        computedProperties: [],
        relations: [],
        indexes: [],
        propertyMap: new Map([
          ['id', { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }],
          ['ownerId', { name: 'ownerId', type: PropertyType.uuid, columnName: 'owner_id', nullable: false }]
        ]),
        computedPropertyMap: new Map(),
        defaultValueProperties: [],
        relationMap: new Map(),
        foreignKeyRelationMap: new Map(),
        foreignKeyRelations: [],
        foreignKeyNames: ['ownerId'],
        foreignKeyColumnNames: ['owner_id'],
        columnNameToPropertyName: new Map(),
        indexMap: new Map(),
        encryptedPropertyMap: new Map(),
        foreignKeys: [],
        isForeignKey: (name: string) => name === 'ownerId'
      };

      const modelMap = new Map<string, ModelInfo>([
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, { relationQueryDeep: 0 });

      // 应该有外键字段
      const fkFields = fields.filter(f => f.name === 'ownerId');
      expect(fkFields.length).toBeGreaterThan(0);
    });

    it('应该防止循环引用', () => {
      const userMetadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const orderMetadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'owner',
            {
              name: 'owner',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'orders',
              mappedNamespace: 'public',
              columnName: 'owner_id'
            }
          ]
        ])
      };

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }],
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata: orderMetadata }]
      ]);

      // 不应该无限递归
      const fields = extractFieldsFromMetadata(userMetadata, modelMap, { relationQueryDeep: 10 });
      expect(fields.length).toBeLessThan(100); // 确保没有无限递归
    });

    it('应该使用自定义 relationQueryDeep', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, { relationQueryDeep: 0 });
      const fieldNames = fields.map(f => f.name);

      // 不应该包含关系字段
      expect(fieldNames.some(n => n.includes('.'))).toBe(false);
    });

    it('应该处理带 prefix 的嵌套字段', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      // 提取嵌套字段
      const fields = extractFieldsFromMetadata(metadata, modelMap, { relationQueryDeep: 1 });

      // 有关系时应该产生嵌套字段
      expect(fields.length).toBeGreaterThan(0);
    });

    it('应该处理没有 relationMap 的情况', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap);

      // 应该能正常处理
      expect(fields.length).toBeGreaterThan(0);
    });
  });

  describe('extractRelationTargetFields', () => {
    it('应该提取关系目标字段（不递归）', () => {
      const metadata = createMockEntityMetadata('Order', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'total', type: PropertyType.number, columnName: 'total', nullable: false }
      ]);

      const fields = extractRelationTargetFields(metadata);

      // 应该包含系统字段和属性字段
      expect(fields.length).toBeGreaterThan(0);
      const idField = fields.find(f => f.name === 'id');
      expect(idField).toBeDefined();
    });

    it('应该使用自定义系统字段', () => {
      const metadata = createMockEntityMetadata('Order', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'name', type: PropertyType.string, columnName: 'name', nullable: false }
      ]);

      const config: FieldExtractorConfig = {
        systemFields: ['id']
      };

      const fields = extractRelationTargetFields(metadata, config);

      // 应该包含 id (自定义系统字段) 和 name (属性字段)
      const names = fields.map(f => f.name);
      expect(names).toContain('name');
    });

    it('应该处理外键字段', () => {
      const metadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        foreignKeyNames: ['ownerId'],
        foreignKeyRelationMap: new Map([
          [
            'owner',
            {
              name: 'owner',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'orders',
              mappedNamespace: 'public',
              columnName: 'owner_id',
              displayName: '用户',
              nullable: false
            }
          ]
        ])
      };

      const fields = extractRelationTargetFields(metadata);

      // 应该包含外键字段
      const fkField = fields.find(f => f.name === 'ownerId');
      expect(fkField).toBeDefined();
      expect(fkField?.displayName).toContain('ID');
    });

    it('应该避免重复字段', () => {
      const metadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        foreignKeyNames: ['ownerId'],
        foreignKeyRelationMap: new Map([
          [
            'owner',
            {
              name: 'owner',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'orders',
              mappedNamespace: 'public',
              columnName: 'owner_id',
              displayName: '用户',
              nullable: false
            } as EntityRelationMetadata
          ]
        ])
      };

      const fields = extractRelationTargetFields(metadata);

      // 不应该有重复 - id 是属性，ownerId 是外键
      const fieldNames = fields.map(f => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('ownerId');
    });
  });

  describe('organizeFields', () => {
    it('应该按深度排序字段', () => {
      const fields: FieldMetadata[] = [
        { name: 'orders.amount', displayName: '订单.金额', type: 'number', nullable: false },
        { name: 'name', displayName: '姓名', type: 'string', nullable: false },
        { name: 'orders.id', displayName: '订单.ID', type: 'string', nullable: false }
      ];

      const sorted = organizeFields(fields);

      // 顶层字段应该在前面
      expect(sorted[0].name).toBe('name');
    });

    it('应该按字母顺序排序同一深度的字段', () => {
      const fields: FieldMetadata[] = [
        { name: 'zField', displayName: 'Z字段', type: 'string', nullable: false },
        { name: 'aField', displayName: 'A字段', type: 'string', nullable: false },
        { name: 'mField', displayName: 'M字段', type: 'string', nullable: false }
      ];

      const sorted = organizeFields(fields);

      expect(sorted[0].name).toBe('aField');
      expect(sorted[1].name).toBe('mField');
      expect(sorted[2].name).toBe('zField');
    });

    it('不应该修改原始数组', () => {
      const fields: FieldMetadata[] = [
        { name: 'b', displayName: 'B', type: 'string', nullable: false },
        { name: 'a', displayName: 'A', type: 'string', nullable: false }
      ];
      const originalOrder = [...fields];

      organizeFields(fields);

      expect(fields[0].name).toBe(originalOrder[0].name);
    });

    it('应该处理空数组', () => {
      const result = organizeFields([]);
      expect(result).toEqual([]);
    });
  });

  describe('extractKeyValueFields', () => {
    it('应该将 keyValue 子属性转换为 FieldMetadata', () => {
      const fields = extractKeyValueFields([
        { name: 'age', type: 'number', displayName: '年龄' },
        { name: 'email', type: 'string', displayName: '邮箱' },
        { name: 'active', type: 'boolean' }
      ]);

      expect(fields).toHaveLength(3);
      expect(fields[0]).toEqual({ name: 'age', displayName: '年龄', type: 'number', nullable: false, required: false });
      expect(fields[1]).toEqual({
        name: 'email',
        displayName: '邮箱',
        type: 'string',
        nullable: false,
        required: false
      });
      expect(fields[2]).toEqual({
        name: 'active',
        displayName: 'active',
        type: 'boolean',
        nullable: false,
        required: false
      });
    });

    it('应该正确映射 date 和 integer 类型', () => {
      const fields = extractKeyValueFields([
        { name: 'birthday', type: 'date' },
        { name: 'count', type: 'integer' }
      ]);

      expect(fields[0].type).toBe('date');
      expect(fields[1].type).toBe('number');
    });

    it('应该处理 nullable 和 required 属性', () => {
      const fields = extractKeyValueFields([
        { name: 'phone', type: 'string', nullable: true, required: false },
        { name: 'name', type: 'string', nullable: false, required: true }
      ]);

      expect(fields[0].nullable).toBe(true);
      expect(fields[0].required).toBe(false);
      expect(fields[1].nullable).toBe(false);
      expect(fields[1].required).toBe(true);
    });

    it('应该将未知类型默认为 string', () => {
      const fields = extractKeyValueFields([{ name: 'data', type: 'string' }]);
      expect(fields[0].type).toBe('string');
    });
  });

  describe('extractFieldsFromMetadata - keyValue 支持', () => {
    it('应该提取 keyValue 属性的子字段', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        {
          name: 'profile',
          type: PropertyType.keyValue,
          columnName: 'profile',
          nullable: true,
          displayName: '个人信息',
          properties: [
            { name: 'age', type: 'number', displayName: '年龄' },
            { name: 'email', type: 'string', displayName: '邮箱' }
          ]
        } as EntityPropertyMetadata
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, { systemFields: ['id'] });

      // 应该有: id, profile.age, profile.email, profile
      const profileField = fields.find(f => f.name === 'profile');
      expect(profileField).toBeDefined();
      expect(profileField?.type).toBe('keyValue');
      expect(profileField?.nullable).toBe(true);
      expect(profileField?.keyValueFields).toHaveLength(2);

      const ageField = fields.find(f => f.name === 'profile.age');
      expect(ageField).toBeDefined();
      expect(ageField?.type).toBe('number');
      expect(ageField?.displayName).toBe('个人信息.年龄');

      const emailField = fields.find(f => f.name === 'profile.email');
      expect(emailField).toBeDefined();
      expect(emailField?.type).toBe('string');
    });

    it('应该处理没有 properties 的 keyValue 属性', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'data', type: PropertyType.keyValue, columnName: 'data', nullable: false } as EntityPropertyMetadata
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, { systemFields: ['id'] });

      const dataField = fields.find(f => f.name === 'data');
      expect(dataField).toBeDefined();
      expect(dataField?.type).toBe('keyValue');
      expect(dataField?.keyValueFields).toBeUndefined();
    });
  });

  describe('extractFieldsFromMetadata - 关系递归', () => {
    it('自引用关系不会无限递归', () => {
      const userMetadata: EntityMetadata = {
        ...createMockEntityMetadata('User', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'manager',
            {
              name: 'manager',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'subordinates',
              mappedNamespace: 'public',
              columnName: 'manager_id'
            } as EntityRelationMetadata
          ]
        ])
      };

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }]
      ]);

      const fields = extractFieldsFromMetadata(userMetadata, modelMap, { relationQueryDeep: 4, systemFields: ['id'] });

      const relationField = fields.find(f => f.name === 'manager');
      expect(relationField).toBeDefined();
      expect(relationField?.type).toBe('relation');
      expect(relationField?.isRelation).toBe(true);
      expect(relationField?.relationTarget).toBe('User');
      expect(relationField?.relationFields?.length).toBeGreaterThan(0);
      expect(fields.length).toBeLessThan(20);
    });

    it('跳过未注册的关联实体', () => {
      const userMetadata: EntityMetadata = {
        ...createMockEntityMetadata('User', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'missing',
            {
              name: 'missing',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Ghost',
              mappedProperty: 'users',
              mappedNamespace: 'public',
              columnName: 'ghost_id'
            } as EntityRelationMetadata
          ]
        ])
      };

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }]
      ]);

      const fields = extractFieldsFromMetadata(userMetadata, modelMap, { systemFields: ['id'] });
      expect(fields.some(f => f.name === 'missing')).toBe(false);
    });

    it('跳过反向引用（防止 A→B→A 循环）', () => {
      const userMetadata: EntityMetadata = {
        ...createMockEntityMetadata('User', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'orders',
            {
              name: 'orders',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Order',
              mappedProperty: 'owner',
              mappedNamespace: 'public',
              columnName: 'owner_id'
            } as EntityRelationMetadata
          ]
        ])
      };
      const orderMetadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
          { name: 'total', type: PropertyType.number, columnName: 'total', nullable: false }
        ]),
        relationMap: new Map([
          [
            'owner',
            {
              name: 'owner',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'orders',
              mappedNamespace: 'public',
              columnName: 'owner_id'
            } as EntityRelationMetadata
          ]
        ])
      };

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }],
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata: orderMetadata }]
      ]);

      const fields = extractFieldsFromMetadata(userMetadata, modelMap, {
        relationQueryDeep: 4,
        systemFields: ['id']
      });

      expect(fields.some(f => f.name === 'orders')).toBe(true);
      // 订单内的 owner 关系被 ignoreKeys 与反向引用双重防护
      expect(fields.some(f => f.name === 'orders.owner')).toBe(false);
      expect(fields.length).toBeLessThan(50);
    });

    it('嵌套字段带前缀且包含关联实体系统字段', () => {
      const userMetadata: EntityMetadata = {
        ...createMockEntityMetadata('User', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'orders',
            {
              name: 'orders',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Order',
              mappedProperty: 'owner',
              mappedNamespace: 'public',
              columnName: 'owner_id',
              displayName: '订单列表'
            } as EntityRelationMetadata
          ]
        ])
      };
      const orderMetadata = createMockEntityMetadata('Order', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false, displayName: 'ID' },
        { name: 'total', type: PropertyType.number, columnName: 'total', nullable: false, displayName: '金额' }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }],
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata: orderMetadata }]
      ]);

      const fields = extractFieldsFromMetadata(userMetadata, modelMap, {
        relationQueryDeep: 2,
        systemFields: ['id']
      });

      const ordersRelation = fields.find(f => f.name === 'orders');
      expect(ordersRelation?.displayName).toContain('订单列表');

      const nestedTotal = fields.find(f => f.name === 'orders.total');
      expect(nestedTotal).toBeDefined();
      expect(nestedTotal?.type).toBe('number');
      expect(nestedTotal?.displayName).toBe('金额');

      const nestedId = fields.find(f => f.name === 'orders.id');
      expect(nestedId).toBeDefined();
      expect(nestedId?.displayName).toBe('订单列表.ID');
    });

    it('限制递归深度', () => {
      const userMetadata: EntityMetadata = {
        ...createMockEntityMetadata('User', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        relationMap: new Map([
          [
            'orders',
            {
              name: 'orders',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Order',
              mappedProperty: 'owner',
              mappedNamespace: 'public',
              columnName: 'owner_id'
            } as EntityRelationMetadata
          ]
        ])
      };
      const orderMetadata = createMockEntityMetadata('Order', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'total', type: PropertyType.number, columnName: 'total', nullable: false }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata: userMetadata }],
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata: orderMetadata }]
      ]);

      const shallow = extractFieldsFromMetadata(userMetadata, modelMap, {
        relationQueryDeep: 0,
        systemFields: ['id']
      });
      expect(shallow.some(f => f.name === 'orders')).toBe(false);

      const deep = extractFieldsFromMetadata(userMetadata, modelMap, {
        relationQueryDeep: 1,
        systemFields: ['id']
      });
      expect(deep.some(f => f.name === 'orders')).toBe(true);
      expect(deep.some(f => f.name === 'orders.total')).toBe(true);
    });

    it('为枚举属性附加 enum 选项', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        {
          name: 'status',
          type: PropertyType.enum,
          columnName: 'status',
          nullable: false,
          enum: ['active', 'blocked']
        }
      ]);

      const modelMap = new Map<string, ModelInfo>([
        ['User', { name: 'User', displayName: '用户', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, { systemFields: ['id'] });
      const statusField = fields.find(f => f.name === 'status');
      expect(statusField?.enum).toEqual(['active', 'blocked']);
    });

    it('外键字段与属性同名时不重复', () => {
      const metadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
          { name: 'ownerId', type: PropertyType.uuid, columnName: 'owner_id', nullable: false }
        ]),
        foreignKeyNames: ['ownerId'],
        foreignKeyRelationMap: new Map([
          [
            'owner',
            {
              name: 'owner',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'orders',
              mappedNamespace: 'public',
              columnName: 'owner_id',
              nullable: true
            } as EntityRelationMetadata
          ]
        ])
      };

      const modelMap = new Map<string, ModelInfo>([
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, {
        relationQueryDeep: 0,
        systemFields: ['id']
      });

      const ownerIdFields = fields.filter(f => f.name === 'ownerId');
      expect(ownerIdFields).toHaveLength(1);
    });

    it('外键无关联元数据时 nullable 为 false', () => {
      const metadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
        ]),
        foreignKeyNames: ['ownerId'],
        foreignKeyRelationMap: new Map()
      };

      const modelMap = new Map<string, ModelInfo>([
        ['Order', { name: 'Order', displayName: '订单', entityClass: class {}, metadata }]
      ]);

      const fields = extractFieldsFromMetadata(metadata, modelMap, {
        relationQueryDeep: 0,
        systemFields: ['id']
      });

      const fkField = fields.find(f => f.name === 'ownerId');
      expect(fkField).toBeDefined();
      expect(fkField?.nullable).toBe(false);
      expect(fkField?.displayName).toBe('ownerID');
    });
  });

  describe('extractRelationTargetFields - 补充场景', () => {
    it('为枚举属性附加 enum 选项', () => {
      const metadata = createMockEntityMetadata('Order', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        {
          name: 'state',
          type: PropertyType.enum,
          columnName: 'state',
          nullable: true,
          enum: ['new', 'paid']
        }
      ]);

      const fields = extractRelationTargetFields(metadata, { systemFields: ['id'] });
      const stateField = fields.find(f => f.name === 'state');
      expect(stateField?.enum).toEqual(['new', 'paid']);
    });

    it('外键与属性同名时不重复', () => {
      const metadata: EntityMetadata = {
        ...createMockEntityMetadata('Order', [
          { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
          { name: 'ownerId', type: PropertyType.uuid, columnName: 'owner_id', nullable: false }
        ]),
        foreignKeyNames: ['ownerId'],
        foreignKeyRelationMap: new Map()
      };

      const fields = extractRelationTargetFields(metadata, { systemFields: ['id'] });
      expect(fields.filter(f => f.name === 'ownerId')).toHaveLength(1);
    });
  });
});
