/**
 * @fileoverview Schema 解析服务
 * 从 EntityMetadata 解析字段元数据，用于 QueryBuilder 组件
 */

import type { EntityMetadata, KeyValuePropertyMetadata, PropertyType } from '@aiao/rxdb';
import type { FieldMetadata } from '../models/query-builder-state.js';
import { extractKeyValueFields } from '../utils/metadata-field-extractor.js';

/**
 * 属性类型到 QueryBuilder 类型的映射
 * 将 RxDB 的 PropertyType 映射到 QueryBuilder 支持的简化类型
 */
const PROPERTY_TYPE_MAP: Record<string, FieldMetadata['type']> = {
  uuid: 'uuid',
  string: 'string',
  enum: 'enum',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  date: 'date',
  stringArray: 'array',
  numberArray: 'array',
  keyValue: 'keyValue',
  json: 'object'
};

/**
 * 解析器配置选项
 */
export interface SchemaParserOptions {
  /**
   * 是否包含外键字段
   * @default false
   */
  includeForeignKeys?: boolean;

  /**
   * 是否包含计算属性
   * @default false
   */
  includeComputedProperties?: boolean;

  /**
   * 是否包含关系字段（用于 EXISTS 操作符）
   * @default false
   */
  includeRelations?: boolean;

  /**
   * 实体元数据映射（用于解析关系字段的目标实体字段）
   * 键为实体名称，值为实体元数据
   */
  entityMetadataMap?: Map<string, EntityMetadata>;

  /**
   * 自定义字段过滤器
   */
  fieldFilter?: (field: FieldMetadata) => boolean;

  /**
   * 自定义显示名称生成器
   */
  displayNameGenerator?: (fieldName: string, metadata?: { displayName?: string }) => string;
}

/**
 * 默认显示名称生成器。
 *
 * 优先使用字段元数据中的 `displayName`，如果未提供，则根据字段名生成可读的标题。
 * 生成规则是将 camelCase / PascalCase 名称转换为以空格分隔的形式，并将首字母大写。
 *
 * 例如：
 * - `"userName"`   -> `"User Name"`
 * - `"createdAt"`  -> `"Created At"`
 * - `"URLValue"`   -> `"URL Value"`
 *
 * @param fieldName 原始字段名称（通常为 camelCase 或 PascalCase）。
 * @param metadata  字段元数据，可选。如果包含 `displayName`，则直接返回该值。
 * @returns 适合在界面上展示的字段标题字符串。
 */
function defaultDisplayNameGenerator(fieldName: string, metadata?: { displayName?: string }): string {
  if (metadata?.displayName) {
    return metadata.displayName;
  }
  // camelCase -> Camel Case
  return fieldName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Schema 解析服务
 * 负责将 RxDB EntityMetadata 转换为 QueryBuilder 可用的字段元数据
 */
export class SchemaParser {
  private readonly options: Required<Omit<SchemaParserOptions, 'entityMetadataMap'>> & {
    entityMetadataMap?: Map<string, EntityMetadata>;
  };

  private readonly relationFieldsCache = new Map<string, FieldMetadata[]>();

  /** @param options - 解析器配置（含关系目标字段递归解析缓存） */
  constructor(options: SchemaParserOptions = {}) {
    this.options = {
      includeForeignKeys: options.includeForeignKeys ?? false,
      includeComputedProperties: options.includeComputedProperties ?? false,
      includeRelations: options.includeRelations ?? false,
      entityMetadataMap: options.entityMetadataMap,
      fieldFilter: options.fieldFilter ?? (() => true),
      displayNameGenerator: options.displayNameGenerator ?? defaultDisplayNameGenerator
    };
  }

  /**
   * 从 EntityMetadata 解析字段元数据
   *
   * @param metadata - RxDB 实体元数据
   * @returns 字段元数据数组
   *
   * @example
   * ```typescript
   * const parser = new SchemaParser();
   * const fields = parser.parse(userMetadata);
   * // [{ name: 'id', displayName: 'ID', type: 'string' }, ...]
   * ```
   */
  parse(metadata: EntityMetadata): FieldMetadata[] {
    const fields: FieldMetadata[] = [];

    // 解析普通属性
    for (const property of metadata.properties) {
      // 跳过外键（如果配置不包含）
      if (!this.options.includeForeignKeys && metadata.isForeignKey(property.name)) {
        continue;
      }

      const field = this.parseProperty(property);
      if (field && this.options.fieldFilter(field)) {
        // keyValue 属性：提取子字段
        if (field.type === 'keyValue') {
          const kvProperties = (property as unknown as { properties: KeyValuePropertyMetadata[] }).properties;
          if (kvProperties?.length > 0) {
            field.keyValueFields = extractKeyValueFields(kvProperties);
            for (const kvField of field.keyValueFields) {
              const childField: FieldMetadata = {
                ...kvField,
                name: `${field.name}.${kvField.name}`,
                displayName: `${field.displayName}.${kvField.displayName}`
              };
              if (this.options.fieldFilter(childField)) {
                fields.push(childField);
              }
            }
          }
        }
        fields.push(field);
      }
    }

    // 解析计算属性（如果配置包含）
    if (this.options.includeComputedProperties) {
      for (const property of metadata.computedProperties) {
        const field = this.parseProperty(property);
        if (field && this.options.fieldFilter(field)) {
          fields.push(field);
        }
      }
    }

    // 解析关系字段（如果配置包含）
    if (this.options.includeRelations && metadata.relations) {
      for (const relation of metadata.relations) {
        const field = this.parseRelation(relation);
        if (field && this.options.fieldFilter(field)) {
          fields.push(field);
        }
      }
    }

    return fields;
  }

  /**
   * 从多个 EntityMetadata 批量解析
   *
   * @param metadataMap - 实体名称到元数据的映射
   * @returns 实体名称到字段数组的映射
   */
  parseMany(metadataMap: Map<string, EntityMetadata>): Map<string, FieldMetadata[]> {
    const result = new Map<string, FieldMetadata[]>();

    for (const [entityName, metadata] of metadataMap) {
      result.set(entityName, this.parse(metadata));
    }

    return result;
  }

  /**
   * 解析单个属性
   */
  private parseProperty(property: {
    name: string;
    displayName?: string;
    type: PropertyType | `${PropertyType}`;
    description?: string;
    nullable?: boolean;
    enum?: readonly unknown[];
    pattern?: string;
  }): FieldMetadata | null {
    const type = this.mapPropertyType(property.type);
    if (!type) {
      return null;
    }

    const field: FieldMetadata = {
      name: property.name,
      displayName: this.options.displayNameGenerator(property.name, property),
      type
    };

    // ✨ T071-T073: 提取额外的字段元数据

    // 从 nullable 推导 required（nullable 为 false 或 undefined 时为必填）
    if (property.nullable !== undefined) {
      field.required = !property.nullable;
      field.nullable = property.nullable;
    }

    // 提取 description
    if (property.description) {
      field.description = property.description;
    }

    // 提取 enum 值
    if (property.enum && Array.isArray(property.enum)) {
      field.enum = property.enum;
    }

    // 提取正则验证模式
    if (property.pattern) {
      field.pattern = property.pattern;
    }

    return field;
  }

  /**
   * 将 RxDB PropertyType 映射到 QueryBuilder 类型
   */
  private mapPropertyType(propertyType: PropertyType | `${PropertyType}`): FieldMetadata['type'] | null {
    const typeString = typeof propertyType === 'string' ? propertyType : String(propertyType);
    return PROPERTY_TYPE_MAP[typeString] ?? null;
  }

  /**
   * 解析关系字段
   */
  private parseRelation(relation: {
    name: string;
    displayName?: string;
    kind: string;
    mappedEntity: string;
    mappedNamespace?: string;
  }): FieldMetadata | null {
    const field: FieldMetadata = {
      name: relation.name,
      displayName: this.options.displayNameGenerator(relation.name, relation),
      type: 'relation',
      isRelation: true,
      relationTarget: relation.mappedEntity,
      relationKind: relation.kind as FieldMetadata['relationKind']
    };

    // 如果提供了实体元数据映射，解析关系目标实体的字段
    if (this.options.entityMetadataMap) {
      const targetEntityName = relation.mappedEntity;
      const targetMetadata = this.options.entityMetadataMap.get(targetEntityName);
      if (targetMetadata) {
        const cached = this.relationFieldsCache.get(targetEntityName);
        if (cached) {
          field.relationFields = cached;
        } else {
          const targetParser = new SchemaParser({
            ...this.options,
            includeRelations: false
          });
          const parsed = targetParser.parse(targetMetadata);
          this.relationFieldsCache.set(targetEntityName, parsed);
          field.relationFields = parsed;
        }
      }
    }

    return field;
  }
}

/**
 * 创建 SchemaParser 实例的工厂函数
 *
 * @param options - 解析器配置选项
 * @returns 新的 SchemaParser 实例
 */
export function createSchemaParser(options?: SchemaParserOptions): SchemaParser {
  return new SchemaParser(options);
}
