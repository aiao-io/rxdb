import type { EntityMetadata, EntityRelationMetadata, KeyValuePropertyMetadata } from '@aiao/rxdb';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import type { FieldMetadata, PropertyType as QBPropertyType } from '../models/query-builder-state.js';

/**
 * 模型信息接口
 */
export interface ModelInfo {
  /** 实体名称 */
  name: string;
  /** 实体显示名称 */
  displayName: string;

  /** 实体类构造函数 */
  entityClass: new (...args: never[]) => unknown;
  /** RxDB 实体元数据 */
  metadata: EntityMetadata;
}

/**
 * 查询示例接口
 */
export interface QueryExample {
  /** 示例名称 */
  name: string;
  /** 示例描述 */
  description: string;
  /** 示例对应的模型名称 */
  modelName: string;
  /** 示例查询内容（结构由具体模型决定） */
  query: unknown;
}

/**
 * 字段提取器配置
 */
export interface FieldExtractorConfig {
  /** 关系查询深度，默认 4 */
  relationQueryDeep?: number;
  /** 系统字段列表，默认 ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'] */
  systemFields?: string[];
}

/**
 * 关系深度配置（默认值）
 */
const DEFAULT_RELATION_QUERY_DEEP = 4;

/**
 * 系统字段列表（默认值）
 */
const DEFAULT_SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

/**
 * 将 PropertyType 映射到 FieldMetadata 的 type
 *
 * @param type - RxDB 属性类型
 * @returns QueryBuilder 属性类型
 *
 * @example
 * ```typescript
 * mapPropertyType(PropertyType.string) // 'string'
 * mapPropertyType(PropertyType.number) // 'number'
 * mapPropertyType(PropertyType.boolean) // 'boolean'
 * ```
 */
export function mapPropertyType(type: PropertyType): QBPropertyType {
  switch (type) {
    case PropertyType.uuid:
      return 'uuid';
    case PropertyType.string:
      return 'string';
    case PropertyType.enum:
      return 'enum';
    case PropertyType.number:
    case PropertyType.integer:
      return 'number';
    case PropertyType.boolean:
      return 'boolean';
    case PropertyType.date:
      return 'date';
    case PropertyType.stringArray:
    case PropertyType.numberArray:
      return 'array';
    case PropertyType.json:
      return 'object';
    case PropertyType.keyValue:
      return 'keyValue';
    default:
      return 'string';
  }
}

/**
 * 获取关系需要忽略的键（避免循环引用）
 *
 * @param relation - 实体关系元数据
 * @returns 需要忽略的键列表
 *
 * @remarks
 * 对于 ONE_TO_MANY 和 MANY_TO_MANY 关系，返回 mappedProperty（如果存在）
 * 以避免无限递归
 *
 * @example
 * ```typescript
 * // ONE_TO_MANY: User.orders -> Order.owner
 * getRelationIgnoreKeys(ordersRelation) // ['owner']
 * ```
 */
export function getRelationIgnoreKeys(relation: EntityRelationMetadata): string[] {
  if (relation.kind === RelationKind.ONE_TO_MANY || relation.kind === RelationKind.MANY_TO_MANY) {
    return [relation.mappedProperty];
  }
  return [];
}

/**
 * 从 EntityMetadata 提取字段（支持递归关系）
 *
 * @param metadata - 实体元数据
 * @param allModels - 所有模型的映射表
 * @param config - 字段提取器配置
 * @returns 字段元数据列表
 *
 * @remarks
 * 此函数会递归提取实体的所有字段，包括：
 * 1. 系统字段（id, createdAt, updatedAt 等）
 * 2. 实体属性字段
 * 3. 外键字段
 * 4. 关系字段（递归，直到达到深度限制）
 *
 * @example
 * ```typescript
 * const fields = extractFieldsFromMetadata(
 *   userMetadata,
 *   modelMap,
 *   { relationQueryDeep: 3 }
 * );
 * // 返回: [
 * //   { name: 'id', displayName: 'ID', type: 'string' },
 * //   { name: 'name', displayName: '姓名', type: 'string' },
 * //   { name: 'orders', displayName: '订单 (ONE_TO_MANY)', type: 'relation', ... },
 * //   { name: 'orders.id', displayName: '订单.ID', type: 'string' },
 * //   ...
 * // ]
 * ```
 */
export function extractFieldsFromMetadata(
  metadata: EntityMetadata,
  allModels: Map<string, ModelInfo>,
  config: FieldExtractorConfig = {}
): FieldMetadata[] {
  return extractFieldsRecursive(metadata, allModels, config, metadata, [], '', new Set(), 0);
}

/**
 * 递归提取字段的内部实现
 */
function extractFieldsRecursive(
  metadata: EntityMetadata,
  allModels: Map<string, ModelInfo>,
  config: FieldExtractorConfig,
  firstMetadata: EntityMetadata,
  ignoreKeys: string[],
  prefix: string,
  visitedEntities: Set<string>,
  depth: number
): FieldMetadata[] {
  const fields: FieldMetadata[] = [];
  const relationQueryDeep = config.relationQueryDeep ?? DEFAULT_RELATION_QUERY_DEEP;
  const systemFields = config.systemFields ?? DEFAULT_SYSTEM_FIELDS;

  // 防止循环引用
  if (visitedEntities.has(metadata.name)) {
    return fields;
  }

  // 使用 propertyMap 做 O(1) 名称查找
  const propertyByName = metadata.propertyMap;

  // 1. 添加系统字段（仅顶层）
  if (!prefix) {
    for (const sysField of systemFields) {
      const sysProp = propertyByName.get(sysField);
      if (sysProp) {
        fields.push({
          name: sysField,
          displayName: sysProp.displayName ?? sysField,
          type: mapPropertyType(sysProp.type as PropertyType),
          nullable: sysProp.nullable ?? false
        });
      }
    }
  }

  // 2. 添加实体属性字段
  for (const [key, property] of metadata.propertyMap) {
    const fieldName = prefix ? `${prefix}.${key}` : key;
    const field: FieldMetadata = {
      name: fieldName,
      displayName: property.displayName ?? key,
      type: mapPropertyType(property.type as PropertyType),
      nullable: property.nullable ?? false
    };
    if (property.type === PropertyType.enum && Array.isArray(property.enum)) {
      field.enum = property.enum;
    }
    if (property.type === PropertyType.keyValue) {
      const kvProperties = (property as unknown as { properties: KeyValuePropertyMetadata[] }).properties;
      if (kvProperties?.length > 0) {
        field.keyValueFields = extractKeyValueFields(kvProperties);
        for (const kvField of field.keyValueFields) {
          fields.push({
            ...kvField,
            name: `${fieldName}.${kvField.name}`,
            displayName: `${field.displayName}.${kvField.displayName}`
          });
        }
      }
    }
    fields.push(field);
  }

  // 3. 添加外键字段（使用 Set 避免 O(n²) 重复检测）
  const existingNames = new Set<string>();
  for (const f of fields) existingNames.add(f.name);
  for (const fkName of metadata.foreignKeyNames) {
    const fieldName = prefix ? `${prefix}.${fkName}` : fkName;
    if (existingNames.has(fieldName)) continue;
    const relationName = fkName.slice(0, -2);
    const relation = metadata.foreignKeyRelationMap.get(relationName);
    const relationDisplayName = relation?.displayName ?? relationName;
    const nullable = relation && 'nullable' in relation ? (relation.nullable ?? false) : false;
    fields.push({
      name: fieldName,
      displayName: `${relationDisplayName}ID`,
      type: 'string',
      nullable
    });
    existingNames.add(fieldName);
  }

  // 4. 处理关系（递归）
  if (depth < relationQueryDeep) {
    for (const [key, relation] of metadata.relationMap) {
      if (ignoreKeys.includes(key)) continue;

      const relatedModel = allModels.get(relation.mappedEntity);
      if (!relatedModel) continue;

      if (depth > 0 && relatedModel.metadata === firstMetadata) continue;
      if (visitedEntities.has(relatedModel.metadata.name)) continue;

      const relPrefix = prefix ? `${prefix}.${key}` : key;
      const relDisplayName = relation.displayName || key;

      // 提取关联实体的字段（用于 EXISTS 子查询）
      const relationFields = extractRelationTargetFields(relatedModel.metadata, config);

      fields.push({
        name: relPrefix,
        displayName: `${relDisplayName} (${relation.kind})`,
        type: 'relation' as QBPropertyType,
        isRelation: true,
        relationTarget: relation.mappedEntity,
        relationFields
      });

      const nextIgnoreKeys = getRelationIgnoreKeys(relation);
      const nextVisited = new Set(visitedEntities);
      nextVisited.add(metadata.name);

      const nestedFields = extractFieldsRecursive(
        relatedModel.metadata,
        allModels,
        config,
        firstMetadata,
        nextIgnoreKeys,
        relPrefix,
        nextVisited,
        depth + 1
      );

      // 添加嵌套字段的系统字段（使用 propertyMap 做 O(1) 查找）
      const relatedPropertyMap = relatedModel.metadata.propertyMap;
      const existingFieldNames = new Set(fields.map(f => f.name));
      for (const sysField of systemFields) {
        const sysFieldName = `${relPrefix}.${sysField}`;
        const sysProp = relatedPropertyMap.get(sysField);
        if (sysProp && !existingFieldNames.has(sysFieldName)) {
          fields.push({
            name: sysFieldName,
            displayName: `${relDisplayName}.${sysProp.displayName ?? sysField}`,
            type: mapPropertyType(sysProp.type as PropertyType),
            nullable: sysProp.nullable ?? false
          });
        }
      }

      fields.push(...nestedFields);
    }
  }

  return fields;
}

/**
 * 提取关系目标实体的字段（用于 EXISTS 子查询）
 *
 * @param metadata - 实体元数据
 * @param config - 字段提取器配置
 * @returns 字段元数据列表（仅一层，不递归）
 *
 * @remarks
 * 此函数只提取一层字段，不递归关系。用于 EXISTS/NOT EXISTS 子查询的字段列表。
 *
 * @example
 * ```typescript
 * const fields = extractRelationTargetFields(orderMetadata);
 * // 返回: [
 * //   { name: 'id', displayName: 'ID', type: 'string' },
 * //   { name: 'total', displayName: '总金额', type: 'number' },
 * //   { name: 'ownerId', displayName: '用户ID', type: 'string' },
 * //   ...
 * // ]
 * ```
 */
export function extractRelationTargetFields(
  metadata: EntityMetadata,
  config: FieldExtractorConfig = {}
): FieldMetadata[] {
  const fields: FieldMetadata[] = [];
  const systemFields = config.systemFields ?? DEFAULT_SYSTEM_FIELDS;
  const propertyByName = metadata.propertyMap;

  // 添加系统字段
  for (const sysField of systemFields) {
    const sysProp = propertyByName.get(sysField);
    if (sysProp) {
      fields.push({
        name: sysField,
        displayName: sysProp.displayName ?? sysField,
        type: mapPropertyType(sysProp.type as PropertyType),
        nullable: sysProp.nullable ?? false
      });
    }
  }

  // 添加实体属性字段
  for (const [key, property] of metadata.propertyMap) {
    const field: FieldMetadata = {
      name: key,
      displayName: property.displayName ?? key,
      type: mapPropertyType(property.type as PropertyType),
      nullable: property.nullable ?? false
    };
    if (property.type === PropertyType.enum && Array.isArray(property.enum)) {
      field.enum = property.enum;
    }
    fields.push(field);
  }

  // 添加外键字段
  const existingFkNames = new Set<string>();
  for (const f of fields) existingFkNames.add(f.name);
  for (const fkName of metadata.foreignKeyNames) {
    if (existingFkNames.has(fkName)) continue;
    const relationName = fkName.slice(0, -2);
    const relation = metadata.foreignKeyRelationMap.get(relationName);
    const relationDisplayName = relation?.displayName ?? relationName;
    const nullable = relation && 'nullable' in relation ? (relation.nullable ?? false) : false;
    fields.push({
      name: fkName,
      displayName: `${relationDisplayName}ID`,
      type: 'string',
      nullable
    });
    existingFkNames.add(fkName);
  }

  return fields;
}

/**
 * 将 KeyValuePropertyMetadata 的 type 映射到 QueryBuilder PropertyType
 */
function mapKVPropertyType(type?: string): QBPropertyType {
  switch (type) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    default:
      return 'string';
  }
}

/**
 * 从 keyValue 属性的 properties 提取子字段列表
 *
 * @param properties keyValue 属性的子属性元数据列表
 * @returns 子字段元数据列表
 */
export function extractKeyValueFields(properties: KeyValuePropertyMetadata[]): FieldMetadata[] {
  return properties.map(p => ({
    name: p.name,
    displayName: p.displayName ?? p.name,
    type: mapKVPropertyType(p.type as string),
    nullable: p.nullable ?? false,
    required: p.required ?? false
  }));
}

/**
 * 对字段进行分组和排序
 *
 * @param fields - 字段元数据列表
 * @returns 排序后的字段列表
 *
 * @remarks
 * 排序规则：
 * 1. 按层级深度排序（字段名中 '.' 的数量）
 * 2. 同一层级按字段名字母顺序排序
 *
 * @example
 * ```typescript
 * const fields = [
 *   { name: 'orders.id', ... },
 *   { name: 'name', ... },
 *   { name: 'id', ... },
 *   { name: 'orders.total', ... }
 * ];
 *
 * const sorted = organizeFields(fields);
 * // 返回: [
 * //   { name: 'id', ... },
 * //   { name: 'name', ... },
 * //   { name: 'orders.id', ... },
 * //   { name: 'orders.total', ... }
 * // ]
 * ```
 */
export function organizeFields(fields: FieldMetadata[]): FieldMetadata[] {
  // 预计算深度，避免在排序比较器中重复执行 regex
  const depths = new Map<FieldMetadata, number>();
  for (const f of fields) {
    let depth = 0;
    for (let i = 0; i < f.name.length; i++) {
      if (f.name.charCodeAt(i) === 46) depth++;
    }
    depths.set(f, depth);
  }
  return [...fields].sort((a, b) => {
    const d = (depths.get(a) ?? 0) - (depths.get(b) ?? 0);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
}
