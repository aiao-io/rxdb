import type { EntityMetadata, EntityPropertyMetadata } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import type { FieldMetadata } from '../../../query-builder/models/query-builder-state.js';
import type { SchemaParserOptions } from '../../../query-builder/services/schema-parser.service.js';
import { createSchemaFromEntities, createSchemaFromEntity } from '../../../query-builder/utils/schema-factory.js';

// 创建模拟 EntityMetadata 的辅助函数
function createMockEntityMetadata(name: Capitalize<string>, properties: EntityPropertyMetadata[] = []): EntityMetadata {
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
    columnNameToPropertyName: new Map(),
    indexMap: new Map(),
    encryptedPropertyMap: new Map(),
    foreignKeys: [],
    isForeignKey: () => false
  };
}

describe('schema-factory', () => {
  describe('createSchemaFromEntity', () => {
    it('应该从 EntityMetadata 创建字段', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'name', type: PropertyType.string, columnName: 'name', nullable: false, displayName: '姓名' }
      ]);

      const fields = createSchemaFromEntity(metadata);

      expect(fields.length).toBeGreaterThan(0);
      const nameField = fields.find(f => f.name === 'name');
      expect(nameField).toBeDefined();
    });

    it('应该接受自定义选项', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const options: SchemaParserOptions = {
        includeForeignKeys: true,
        includeComputedProperties: true,
        includeRelations: true
      };

      const fields = createSchemaFromEntity(metadata, options);

      expect(fields).toBeDefined();
    });

    it('应该处理空属性列表', () => {
      const metadata = createMockEntityMetadata('User', []);

      const fields = createSchemaFromEntity(metadata);

      // 空属性时可能返回空数组
      expect(fields).toBeDefined();
    });

    it('应该正确映射类型', () => {
      const metadata = createMockEntityMetadata('Test', [
        { name: 'strField', type: PropertyType.string, columnName: 'str_field', nullable: false },
        { name: 'numField', type: PropertyType.number, columnName: 'num_field', nullable: false },
        { name: 'boolField', type: PropertyType.boolean, columnName: 'bool_field', nullable: false }
      ]);

      const fields = createSchemaFromEntity(metadata);

      const strField = fields.find(f => f.name === 'strField');
      const numField = fields.find(f => f.name === 'numField');
      const boolField = fields.find(f => f.name === 'boolField');

      expect(strField?.type).toBe('string');
      expect(numField?.type).toBe('number');
      expect(boolField?.type).toBe('boolean');
    });
  });

  describe('createSchemaFromEntities', () => {
    it('应该批量创建多个实体的字段', () => {
      const userMetadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const postMetadata = createMockEntityMetadata('Post', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'title', type: PropertyType.string, columnName: 'title', nullable: false }
      ]);

      const metadataMap = new Map<string, EntityMetadata>([
        ['User', userMetadata],
        ['Post', postMetadata]
      ]);

      const schemas = createSchemaFromEntities(metadataMap);

      expect(schemas.size).toBe(2);
      expect(schemas.get('User')).toBeDefined();
      expect(schemas.get('Post')).toBeDefined();
    });

    it('应该返回正确的字段数组', () => {
      const userMetadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false },
        { name: 'name', type: PropertyType.string, columnName: 'name', nullable: false }
      ]);

      const metadataMap = new Map<string, EntityMetadata>([['User', userMetadata]]);

      const schemas = createSchemaFromEntities(metadataMap);
      const userFields = schemas.get('User');

      expect(userFields?.length).toBeGreaterThan(0);
    });

    it('应该接受自定义选项', () => {
      const metadata = createMockEntityMetadata('User', [
        { name: 'id', type: PropertyType.uuid, columnName: 'id', nullable: false }
      ]);

      const metadataMap = new Map<string, EntityMetadata>([['User', metadata]]);

      const options: SchemaParserOptions = {
        fieldFilter: (field: FieldMetadata) => field.name !== 'createdAt'
      };

      const schemas = createSchemaFromEntities(metadataMap, options);

      expect(schemas.get('User')).toBeDefined();
    });

    it('应该处理空映射', () => {
      const metadataMap = new Map<string, EntityMetadata>();

      const schemas = createSchemaFromEntities(metadataMap);

      expect(schemas.size).toBe(0);
    });
  });
});
