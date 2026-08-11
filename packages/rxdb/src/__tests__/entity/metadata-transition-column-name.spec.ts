import { describe, expect, it } from 'vitest';
import { ENTITY_BASE_METADATA_OPTIONS } from '../../entity/entity-base.js';
import { PropertyType, RelationKind } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';

describe('transitionMetadata - columnName 支持', () => {
  describe('属性 columnName', () => {
    it('columnName 默认等于 name', () => {
      const result = transitionMetadata(
        {
          name: 'TestEntity',
          properties: [{ name: 'firstName', type: PropertyType.string }]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const prop = result.propertyMap.get('firstName')!;
      expect(prop.columnName).toBe('firstName');
    });

    it('自定义 columnName 应该保留', () => {
      const result = transitionMetadata(
        {
          name: 'TestEntity',
          properties: [
            { name: 'firstName', type: PropertyType.string, columnName: 'first_name' },
            { name: 'lastName', type: PropertyType.string, columnName: 'last_name' },
            { name: 'age', type: PropertyType.number }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      expect(result.propertyMap.get('firstName')!.columnName).toBe('first_name');
      expect(result.propertyMap.get('lastName')!.columnName).toBe('last_name');
      expect(result.propertyMap.get('age')!.columnName).toBe('age');
    });

    it('columnNameToPropertyName 反向映射应该正确', () => {
      const result = transitionMetadata(
        {
          name: 'TestEntity',
          properties: [
            { name: 'firstName', type: PropertyType.string, columnName: 'first_name' },
            { name: 'lastName', type: PropertyType.string, columnName: 'last_name' },
            { name: 'age', type: PropertyType.number }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      expect(result.columnNameToPropertyName.get('first_name')).toBe('firstName');
      expect(result.columnNameToPropertyName.get('last_name')).toBe('lastName');
      expect(result.columnNameToPropertyName.get('age')).toBe('age');
      // JS 属性名不应该出现在反向映射中（当 columnName 不同时）
      expect(result.columnNameToPropertyName.has('firstName')).toBe(false);
      expect(result.columnNameToPropertyName.has('lastName')).toBe(false);
    });
  });

  describe('计算属性 columnName', () => {
    it('计算属性 columnName 默认等于 name', () => {
      const result = transitionMetadata(
        {
          name: 'TestEntity',
          properties: [{ name: 'title', type: PropertyType.string }],
          computedProperties: [{ name: 'hasChildren', type: PropertyType.boolean }]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const computed = result.computedPropertyMap.get('hasChildren')!;
      expect(computed.columnName).toBe('hasChildren');
    });

    it('计算属性自定义 columnName 应该保留', () => {
      const result = transitionMetadata(
        {
          name: 'TestEntity',
          properties: [{ name: 'title', type: PropertyType.string }],
          computedProperties: [{ name: 'hasChildren', type: PropertyType.boolean, columnName: 'has_children' }]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const computed = result.computedPropertyMap.get('hasChildren')!;
      expect(computed.columnName).toBe('has_children');
    });
  });

  describe('关系 columnName', () => {
    it('关系 columnName 默认为 name + Id', () => {
      const result = transitionMetadata(
        {
          name: 'OrderItem',
          properties: [{ name: 'quantity', type: PropertyType.number }],
          relations: [
            {
              name: 'order',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Order',
              mappedProperty: 'items'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const relation = result.relationMap.get('order')!;
      expect(relation.columnName).toBe('orderId');
    });

    it('关系自定义 columnName 应该保留', () => {
      const result = transitionMetadata(
        {
          name: 'OrderItem',
          properties: [{ name: 'quantity', type: PropertyType.number }],
          relations: [
            {
              name: 'order',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Order',
              mappedProperty: 'items',
              columnName: 'order_id'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const relation = result.relationMap.get('order')!;
      expect(relation.columnName).toBe('order_id');
    });

    it('foreignKeyColumnNames 应该使用 relation.columnName', () => {
      const result = transitionMetadata(
        {
          name: 'OrderItem',
          properties: [{ name: 'quantity', type: PropertyType.number }],
          relations: [
            {
              name: 'order',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Order',
              mappedProperty: 'items',
              columnName: 'order_id'
            },
            {
              name: 'product',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Product',
              mappedProperty: 'orderItems'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      expect(result.foreignKeyColumnNames).toEqual(['order_id', 'productId']);
    });

    it('foreignKeyNames 应该使用 JS 属性名 (name + Id)', () => {
      const result = transitionMetadata(
        {
          name: 'OrderItem',
          properties: [{ name: 'quantity', type: PropertyType.number }],
          relations: [
            {
              name: 'order',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Order',
              mappedProperty: 'items',
              columnName: 'order_id'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      expect(result.foreignKeyNames).toEqual(['orderId']);
    });

    it('ONE_TO_ONE 关系自定义 columnName', () => {
      const result = transitionMetadata(
        {
          name: 'UserProfile',
          properties: [{ name: 'bio', type: PropertyType.string }],
          relations: [
            {
              name: 'user',
              kind: RelationKind.ONE_TO_ONE,
              mappedEntity: 'User',
              mappedProperty: 'profile',
              columnName: 'user_ref_id'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      const relation = result.relationMap.get('user')!;
      expect(relation.columnName).toBe('user_ref_id');
      expect(result.foreignKeyColumnNames).toEqual(['user_ref_id']);
      expect(result.foreignKeyNames).toEqual(['userId']);
    });

    it('ONE_TO_MANY 关系不产生外键', () => {
      const result = transitionMetadata(
        {
          name: 'User',
          properties: [{ name: 'name', type: PropertyType.string }],
          relations: [
            {
              name: 'orders',
              kind: RelationKind.ONE_TO_MANY,
              mappedEntity: 'Order',
              mappedProperty: 'owner'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );
      expect(result.foreignKeyColumnNames).toEqual([]);
      expect(result.foreignKeyNames).toEqual([]);
    });
  });

  describe('混合自定义 columnName', () => {
    it('属性和关系都使用自定义 columnName', () => {
      const result = transitionMetadata(
        {
          name: 'Employee',
          properties: [
            { name: 'firstName', type: PropertyType.string, columnName: 'first_name' },
            { name: 'lastName', type: PropertyType.string, columnName: 'last_name' },
            { name: 'hireDate', type: PropertyType.date, columnName: 'hire_date' }
          ],
          relations: [
            {
              name: 'department',
              kind: RelationKind.MANY_TO_ONE,
              mappedEntity: 'Department',
              mappedProperty: 'employees',
              columnName: 'dept_id'
            }
          ]
        },
        ENTITY_BASE_METADATA_OPTIONS
      );

      // 属性映射
      expect(result.propertyMap.get('firstName')!.columnName).toBe('first_name');
      expect(result.propertyMap.get('lastName')!.columnName).toBe('last_name');
      expect(result.propertyMap.get('hireDate')!.columnName).toBe('hire_date');

      // 反向映射
      expect(result.columnNameToPropertyName.get('first_name')).toBe('firstName');
      expect(result.columnNameToPropertyName.get('last_name')).toBe('lastName');
      expect(result.columnNameToPropertyName.get('hire_date')).toBe('hireDate');

      // 关系映射
      const relation = result.relationMap.get('department')!;
      expect(relation.columnName).toBe('dept_id');

      // 外键列名
      expect(result.foreignKeyColumnNames).toEqual(['dept_id']);
      expect(result.foreignKeyNames).toEqual(['departmentId']);
    });
  });
});
